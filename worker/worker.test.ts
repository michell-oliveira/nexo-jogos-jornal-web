import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
import { COOKIE_NAME, FailureLimiter, SESSION_SECONDS, createSession, isSameOrigin, rateLimitKey, readCookie, safeEqual, verifySession } from './auth';

const SECRET = 'x'.repeat(40);
const NOW = 1_800_000_000_000;

const env = (over: Partial<Env> = {}): Env => ({
  ASSETS: { fetch: async () => new Response('<p>jogo</p>', { headers: { 'Content-Type': 'text/html' } }) },
  APP_USER: 'michell',
  APP_PASSWORD: 'senha-de-teste-longa-123',
  SESSION_SECRET: SECRET,
  ...over,
});

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`https://jogos.test${path}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://jogos.test', ...headers },
  });

describe('sessão', () => {
  it('aceita sessão válida', async () => {
    expect(await verifySession(SECRET, await createSession(SECRET, NOW), NOW + 1000)).toBe(true);
  });

  it('rejeita expirada, adulterada, outro segredo e lixo', async () => {
    const t = await createSession(SECRET, NOW);
    expect(await verifySession(SECRET, t, NOW + (SESSION_SECONDS + 5) * 1000)).toBe(false);
    const [v, exp, sig] = t.split('.');
    expect(await verifySession(SECRET, `${v}.${Number(exp) + 99999}.${sig}`, NOW)).toBe(false);
    expect(await verifySession('y'.repeat(40), t, NOW)).toBe(false);
    for (const bad of [undefined, '', 'v1', 'v1.1.2.3', 'v2.9999999999.abc', 'v1.abc.def', `${v}.${exp}.@@@`, 'a'.repeat(300)]) {
      expect(await verifySession(SECRET, bad, NOW)).toBe(false);
    }
  });

  it('safeEqual compara textos de tamanhos diferentes', async () => {
    expect(await safeEqual('abc', 'abc', SECRET)).toBe(true);
    expect(await safeEqual('abc', 'abcd', SECRET)).toBe(false);
    expect(await safeEqual('', 'abc', SECRET)).toBe(false);
  });

  it('lê cookie por nome exato', () => {
    expect(readCookie(`a=1; ${COOKIE_NAME}=tok; b=2`, COOKIE_NAME)).toBe('tok');
    expect(readCookie(`x${COOKIE_NAME}=tok`, COOKIE_NAME)).toBeUndefined();
    expect(readCookie(null, COOKIE_NAME)).toBeUndefined();
  });

  it('CSRF: exige Origin idêntico', () => {
    expect(isSameOrigin(post('/login', ''))).toBe(true);
    expect(isSameOrigin(post('/login', '', { Origin: 'https://evil.test' }))).toBe(false);
    expect(isSameOrigin(new Request('https://jogos.test/login', { method: 'POST' }))).toBe(false);
  });
});

describe('limite de tentativas', () => {
  it('chave IPv6 usa o prefixo /64', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2');
    expect(rateLimitKey('2001:db8:1:2::9')).toBe('2001:db8:1:2');
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0');
    expect(rateLimitKey('::1')).toBe('0:0:0:0');
    expect(rateLimitKey('2001:DB8:0:0:1::')).toBe('2001:db8:0:0');
  });

  it('bloqueia após 5 falhas e libera depois da janela', () => {
    const l = new FailureLimiter(5, 1000);
    for (let i = 0; i < 5; i++) l.recordFailure('ip', 0);
    expect(l.isBlocked('ip', 500)).toBe(true);
    expect(l.isBlocked('outro', 500)).toBe(false);
    expect(l.isBlocked('ip', 1001)).toBe(false);
  });
});

describe('Worker', () => {
  it('sem sessão: redireciona para /login e não serve o jogo', async () => {
    const res = await worker.fetch(new Request('https://jogos.test/'), env());
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login');
    const asset = await worker.fetch(new Request('https://jogos.test/assets/index.js'), env());
    expect(asset.status).toBe(303);
  });

  it('falha fechada sem configuração', async () => {
    for (const e of [env({ APP_USER: '' }), env({ APP_PASSWORD: undefined }), env({ SESSION_SECRET: 'curto' })]) {
      expect((await worker.fetch(new Request('https://jogos.test/login'), e)).status).toBe(503);
    }
  });

  it('login correto cria cookie seguro e libera o jogo', async () => {
    const res = await worker.fetch(post('/login', 'user=michell&password=senha-de-teste-longa-123'), env());
    expect(res.status).toBe(303);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-jj_session=v1\./);
    for (const f of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(cookie).toContain(f);
    const game = await worker.fetch(new Request('https://jogos.test/', { headers: { Cookie: cookie.split(';')[0]! } }), env());
    expect(game.status).toBe(200);
    expect(await game.text()).toContain('jogo');
    expect(game.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(game.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('login errado: 401 genérico, sem cookie', async () => {
    for (const body of ['user=michell&password=errada', 'user=outro&password=senha-de-teste-longa-123', '']) {
      const res = await worker.fetch(post('/login', body, { 'CF-Connecting-IP': `ip-${body.length}` }), env());
      expect(res.status).toBe(401);
      expect(res.headers.get('Set-Cookie')).toBeNull();
      expect(await res.text()).toContain('Usuário ou senha inválidos.');
    }
  });

  it('login de outra origem é recusado; método e tipo inválidos também', async () => {
    expect((await worker.fetch(post('/login', 'user=a&password=b', { Origin: 'https://evil.test' }), env())).status).toBe(403);
    expect((await worker.fetch(new Request('https://jogos.test/login', { method: 'PUT' }), env())).status).toBe(405);
    const json = post('/login', '{}', { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'ip-json' });
    expect((await worker.fetch(json, env())).status).toBe(401);
  });

  it('bloqueia o IP após 5 falhas, mesmo com a senha certa', async () => {
    const h = { 'CF-Connecting-IP': 'ip-brute' };
    for (let i = 0; i < 5; i++) await worker.fetch(post('/login', 'user=x&password=y', h), env());
    const res = await worker.fetch(post('/login', 'user=michell&password=senha-de-teste-longa-123', h), env());
    expect(res.status).toBe(429);
  });

  it('rajada concorrente não escapa do limite (tentativa contada antes dos awaits)', async () => {
    const h = { 'CF-Connecting-IP': 'ip-burst' };
    const rs = await Promise.all(Array.from({ length: 12 }, () => worker.fetch(post('/login', 'user=x&password=y', h), env())));
    expect(rs.filter((r) => r.status === 401).length).toBe(5);
    expect(rs.filter((r) => r.status === 429).length).toBe(7);
  });

  it('corpo grande é recusado sem ser lido por inteiro', async () => {
    const h = { 'CF-Connecting-IP': 'ip-big' };
    const big = `user=michell&password=senha-de-teste-longa-123&x=${'a'.repeat(5000)}`;
    expect((await worker.fetch(post('/login', big, h), env())).status).toBe(401);
    const chunked = new Request('https://jogos.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://jogos.test', 'CF-Connecting-IP': 'ip-big2' },
      body: new ReadableStream({ start: (c) => { c.enqueue(new TextEncoder().encode(big)); c.close(); } }),
      duplex: 'half',
    } as RequestInit);
    expect((await worker.fetch(chunked, env())).status).toBe(401);
  });

  it('caminhos parecidos com /login não dão acesso sem sessão', async () => {
    for (const p of ['/login/', '//login', '/LOGIN', '/%6cogin', '/index.html', '/logout/', '/login%2f']) {
      const res = await worker.fetch(new Request(`https://jogos.test${p}`), env());
      expect([303, 404]).toContain(res.status);
      expect(await res.text()).not.toContain('jogo');
    }
    const head = await worker.fetch(new Request('https://jogos.test/', { method: 'HEAD' }), env());
    expect(head.status).toBe(303);
    const bad = { Cookie: `${COOKIE_NAME}=v1.9999999999.AAAA; ${COOKIE_NAME}=` };
    expect((await worker.fetch(new Request('https://jogos.test/', { headers: bad }), env())).status).toBe(303);
  });

  it('logout só por POST da própria origem e apaga o cookie', async () => {
    expect((await worker.fetch(new Request('https://jogos.test/logout'), env())).status).toBe(405);
    expect((await worker.fetch(post('/logout', '', { Origin: 'https://evil.test' }), env())).status).toBe(403);
    const res = await worker.fetch(post('/logout', ''), env());
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('com sessão, só GET/HEAD chegam aos arquivos', async () => {
    const login = await worker.fetch(post('/login', 'user=michell&password=senha-de-teste-longa-123', { 'CF-Connecting-IP': 'ip-ok' }), env());
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    const res = await worker.fetch(new Request('https://jogos.test/', { method: 'POST', headers: { Cookie: cookie } }), env());
    expect(res.status).toBe(405);
  });
});
