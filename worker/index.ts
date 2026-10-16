import {
  COOKIE_NAME,
  FailureLimiter,
  MIN_SECRET_LENGTH,
  createSession,
  isSameOrigin,
  openSession,
  rateLimitKey,
  readCookie,
  safeEqual,
  sessionCookie,
} from './auth';
import { ADMIN_MESSAGES, adminPage } from './adminPage';
import { loginPage } from './loginPage';
import {
  MAX_USERS, deleteUser, getUser, hashPassword, listUsers, normalizeUser, passwordProblem, putUser, verifyPassword,
  type KV,
} from './users';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  APP_USER?: string;
  APP_PASSWORD?: string;
  /** Usuários extras: JSON `{"usuario":"senha"}`; somam-se ao par APP_USER/APP_PASSWORD. */
  APP_USERS?: string;
  SESSION_SECRET?: string;
  /** Usuários cadastrados pela tela de administração (opcional: sem ele só valem as contas dos secrets). */
  USERS?: KV;
}

/** Prefixo sob o qual o app é publicado no domínio principal (nexohorizonte.com.br/jogos-jornal). */
const BASE = '/jogos-jornal';

/** Credenciais válidas: o par legado (APP_USER/APP_PASSWORD) mais os do JSON APP_USERS. JSON inválido é ignorado (falha fechada). */
export function credentialsOf(env: Env): [string, string][] {
  const list: [string, string][] = [];
  if (env.APP_USER && env.APP_PASSWORD) list.push([env.APP_USER, env.APP_PASSWORD]);
  try {
    const extra: unknown = env.APP_USERS ? JSON.parse(env.APP_USERS) : {};
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [u, pw] of Object.entries(extra)) if (u && typeof pw === 'string' && pw) list.push([u, pw]);
    }
  } catch {
    /* APP_USERS malformado: só valem as credenciais legadas */
  }
  return list;
}

const limiter = new FailureLimiter();
const MAX_BODY = 2048;
const FAIL_DELAY_MS = 500;

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
    "form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // 'no-referrer' faria o navegador enviar `Origin: null` nos POSTs e quebraria a checagem CSRF.
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cache-Control': 'private, no-cache',
  Vary: 'Cookie',
};

function respond(body: BodyInit | null, init: ResponseInit = {}): Response {
  const res = new Response(body, init);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

const html = (body: string, status = 200): Response =>
  respond(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const redirect = (to: string, cookie?: string): Response => {
  const res = respond(null, { status: 303, headers: { Location: to } });
  if (cookie) res.headers.append('Set-Cookie', cookie);
  return res;
};

async function readForm(request: Request): Promise<URLSearchParams | null> {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/x-www-form-urlencoded')) return null;
  // Lê o corpo com teto de bytes: `request.text()` carregaria o corpo inteiro (até dezenas de MB) na memória do isolate.
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return null;
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return new URLSearchParams(text + decoder.decode());
}

async function handleLogin(request: Request, env: Env, secret: string, base: string): Promise<Response> {
  if (request.method === 'GET') return html(loginPage());
  if (request.method !== 'POST') return respond('Método não permitido', { status: 405, headers: { Allow: 'GET, POST' } });
  if (!isSameOrigin(request)) return respond('Origem inválida', { status: 403 });

  const ip = rateLimitKey(request.headers.get('CF-Connecting-IP') ?? 'desconhecido');
  const now = Date.now();
  if (limiter.isBlocked(ip, now)) return html(loginPage('Muitas tentativas. Aguarde alguns minutos.'), 429);
  // Conta a tentativa ANTES de qualquer await: uma rajada concorrente não passa toda pela checagem acima.
  limiter.recordFailure(ip, now);

  const form = await readForm(request);
  const user = form?.get('user') ?? '';
  const password = form?.get('password') ?? '';
  // Sempre compara usuário e senha (sem curto-circuito) para não revelar qual deles errou.
  // Percorre TODAS as contas sem curto-circuito (nem revela qual usuário existe nem quantos há).
  let who: string | null = null;
  for (const [u, pw] of credentialsOf(env)) {
    const okUser = await safeEqual(user.slice(0, 200), u, secret);
    const okPass = await safeEqual(password.slice(0, 200), pw, secret);
    if (okUser && okPass) who = u;
  }
  // Contas cadastradas no KV: sempre deriva o hash (mesmo sem usuário) para o tempo não revelar quem existe.
  if (!who && env.USERS && form) {
    const name = normalizeUser(user.slice(0, 200));
    const record = name ? await getUser(env.USERS, name) : null;
    if ((await verifyPassword(password.slice(0, 200), record)) && name && record) who = name;
  }

  if (!form || !who || user.length > 200 || password.length > 200) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return html(loginPage('Usuário ou senha inválidos.'), 401);
  }
  limiter.clear(ip);
  return redirect(`${base}/`, sessionCookie(await createSession(secret, now, who)));
}

/** Telas e ações do administrador (conta APP_USER). Cada ação é um POST de formulário com checagem de Origin. */
async function handleAdmin(request: Request, env: Env, url: URL, pathname: string, base: string, admin: string): Promise<Response> {
  const fixed = credentialsOf(env).map(([u]) => u);
  const back = (code: string): Response => redirect(`${base}/admin?m=${code}`);

  if (pathname === '/admin') {
    if (request.method !== 'GET') return respond('Método não permitido', { status: 405, headers: { Allow: 'GET' } });
    const code = url.searchParams.get('m') ?? '';
    const users = env.USERS ? await listUsers(env.USERS) : [];
    return html(adminPage({ base, admin, fixed, users, messageCode: code in ADMIN_MESSAGES ? code : env.USERS ? undefined : 'nokv' }));
  }

  const action = pathname.slice('/admin/'.length);
  if (!['create', 'password', 'delete'].includes(action)) return respond('Não encontrado', { status: 404 });
  if (request.method !== 'POST') return respond('Método não permitido', { status: 405, headers: { Allow: 'POST' } });
  if (!isSameOrigin(request)) return respond('Origem inválida', { status: 403 });
  const kv = env.USERS;
  if (!kv) return back('nokv');
  const form = await readForm(request);
  if (!form) return back('invalid');

  const name = normalizeUser(form.get('user') ?? '');
  if (!name) return back('invalid');
  const password = form.get('password') ?? '';
  const existing = await getUser(kv, name);

  if (action === 'delete') {
    if (!existing) return back('missing');
    await deleteUser(kv, name);
    return back('deleted');
  }
  if (passwordProblem(password)) return back('weak');
  if (action === 'password') {
    if (!existing) return back('missing');
    await putUser(kv, name, await hashPassword(password, Date.now()));
    return back('password');
  }
  if (fixed.some((f) => f.toLowerCase() === name)) return back('reserved');
  if (existing) return back('exists');
  if ((await listUsers(kv)).length >= MAX_USERS) return back('limit');
  await putUser(kv, name, await hashPassword(password, Date.now()));
  return back('created');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.SESSION_SECRET ?? '';
    // Falha fechada: sem configuração completa, nada é servido.
    if (credentialsOf(env).length === 0 || secret.length < MIN_SECRET_LENGTH) {
      return respond('Serviço não configurado', { status: 503 });
    }

    const url = new URL(request.url);
    // Sob o prefixo, o Worker remove-o para rotear e buscar assets; fora dele (workers.dev) opera na raiz.
    const underBase = url.pathname === BASE || url.pathname.startsWith(`${BASE}/`);
    const base = underBase ? BASE : '';
    const pathname = underBase ? url.pathname.slice(BASE.length) || '/' : url.pathname;
    if (underBase && url.pathname === BASE) return redirect(`${BASE}/${url.search}`);
    if (pathname === '/login') return handleLogin(request, env, secret, base);

    if (pathname === '/logout') {
      if (request.method !== 'POST') return respond('Método não permitido', { status: 405, headers: { Allow: 'POST' } });
      if (!isSameOrigin(request)) return respond('Origem inválida', { status: 403 });
      return redirect(`${base}/login`, sessionCookie('', 0));
    }

    const token = readCookie(request.headers.get('Cookie'), COOKIE_NAME);
    const session = await openSession(secret, token, Date.now());
    if (!session) return redirect(`${base}/login`);
    const user = session.user;
    // Conta cadastrada que foi removida perde o acesso já na próxima requisição (a sessão em si não expira antes).
    if (user !== null && !credentialsOf(env).some(([u]) => u === user) && !(env.USERS && (await getUser(env.USERS, user)))) {
      return redirect(`${base}/login`, sessionCookie('', 0));
    }
    const isAdmin = user !== null && !!env.APP_USER && user === env.APP_USER;

    if (pathname === '/whoami') {
      return respond(JSON.stringify({ admin: isAdmin, user }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (!isAdmin) return respond('Acesso restrito ao administrador', { status: 403 });
      return handleAdmin(request, env, url, pathname, base, user!);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respond('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    url.pathname = pathname;
    const asset = await env.ASSETS.fetch(underBase ? new Request(url, request) : request);
    const res = new Response(asset.body, asset);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  },
};
