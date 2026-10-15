import {
  COOKIE_NAME,
  FailureLimiter,
  MIN_SECRET_LENGTH,
  createSession,
  isSameOrigin,
  rateLimitKey,
  readCookie,
  safeEqual,
  sessionCookie,
  verifySession,
} from './auth';
import { loginPage } from './loginPage';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  APP_USER?: string;
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
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

async function handleLogin(request: Request, env: Env, secret: string): Promise<Response> {
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
  const okUser = await safeEqual(user.slice(0, 200), env.APP_USER ?? '', secret);
  const okPass = await safeEqual(password.slice(0, 200), env.APP_PASSWORD ?? '', secret);

  if (!form || !okUser || !okPass || user.length > 200 || password.length > 200) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return html(loginPage('Usuário ou senha inválidos.'), 401);
  }
  limiter.clear(ip);
  return redirect('/', sessionCookie(await createSession(secret, now)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.SESSION_SECRET ?? '';
    // Falha fechada: sem configuração completa, nada é servido.
    if (!env.APP_USER || !env.APP_PASSWORD || secret.length < MIN_SECRET_LENGTH) {
      return respond('Serviço não configurado', { status: 503 });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/login') return handleLogin(request, env, secret);

    if (pathname === '/logout') {
      if (request.method !== 'POST') return respond('Método não permitido', { status: 405, headers: { Allow: 'POST' } });
      if (!isSameOrigin(request)) return respond('Origem inválida', { status: 403 });
      return redirect('/login', sessionCookie('', 0));
    }

    const token = readCookie(request.headers.get('Cookie'), COOKIE_NAME);
    if (!(await verifySession(secret, token, Date.now()))) return redirect('/login');

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respond('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const asset = await env.ASSETS.fetch(request);
    const res = new Response(asset.body, asset);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  },
};
