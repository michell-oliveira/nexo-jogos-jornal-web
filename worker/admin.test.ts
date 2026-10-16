import { describe, expect, it } from 'vitest';
import { createSession, sessionUser, verifySession, COOKIE_NAME } from './auth';
import worker, { type Env } from './index';
import { hashPassword, normalizeUser, passwordProblem, verifyPassword, type KV } from './users';

const SECRET = 'x'.repeat(40);
const NOW = Date.now();

function fakeKv(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
}

const env = (kv: KV | null = fakeKv(), over: Partial<Env> = {}): Env => ({
  ASSETS: { fetch: async () => new Response('<p>jogo</p>', { headers: { 'Content-Type': 'text/html' } }) },
  APP_USER: 'michell',
  APP_PASSWORD: 'senha-de-teste-longa-123',
  APP_USERS: JSON.stringify({ fixa: 'outra-senha-fixa-123' }),
  SESSION_SECRET: SECRET,
  ...(kv ? { USERS: kv } : {}),
  ...over,
});

const cookieOf = async (user?: string) => `${COOKIE_NAME}=${await createSession(SECRET, NOW, user)}`;
const get = (path: string, cookie: string) => new Request(`https://jogos.test${path}`, { headers: { Cookie: cookie } });
const post = (path: string, body: Record<string, string>, cookie: string, origin = 'https://jogos.test') =>
  new Request(`https://jogos.test${path}`, {
    method: 'POST',
    body: new URLSearchParams(body).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, Cookie: cookie },
  });
const login = (user: string, password: string) =>
  worker.fetch(post('/login', { user, password }, '', 'https://jogos.test'), env(kvShared));

let kvShared = fakeKv();

describe('sessão v2', () => {
  it('carrega o usuário, aceita v1 sem identidade e rejeita adulteração', async () => {
    const t = await createSession(SECRET, NOW, 'natália.o');
    expect(await sessionUser(SECRET, t, NOW)).toBe('natália.o');
    expect(await verifySession(SECRET, t, NOW)).toBe(true);
    const v1 = await createSession(SECRET, NOW);
    expect(await sessionUser(SECRET, v1, NOW)).toBeNull();
    expect(await verifySession(SECRET, v1, NOW)).toBe(true);
    const parts = t.split('.');
    parts[2] = btoa('michell').replace(/=+$/, '');
    expect(await verifySession(SECRET, parts.join('.'), NOW)).toBe(false);
  });
});

describe('senhas (PBKDF2)', () => {
  it('confere a certa, recusa a errada e o usuário inexistente', async () => {
    const rec = await hashPassword('uma-senha-bem-longa', NOW);
    expect(rec.hash).not.toContain('uma-senha');
    expect(await verifyPassword('uma-senha-bem-longa', rec)).toBe(true);
    expect(await verifyPassword('uma-senha-bem-longA', rec)).toBe(false);
    expect(await verifyPassword('qualquer', null)).toBe(false);
  });
  it('valida nome e tamanho da senha', () => {
    expect(normalizeUser('  Natalia.Oliveira ')).toBe('natalia.oliveira');
    for (const bad of ['', 'ab', '-abc', 'com espaço', 'a/b', 'x'.repeat(41), '<script>']) expect(normalizeUser(bad)).toBeNull();
    expect(passwordProblem('curta')).not.toBeNull();
    expect(passwordProblem('x'.repeat(12))).toBeNull();
    expect(passwordProblem('x'.repeat(201))).not.toBeNull();
  });
});

describe('administração de usuários', () => {
  it('só o admin acessa; outros recebem 403', async () => {
    const e = env();
    expect((await worker.fetch(get('/admin', await cookieOf('fixa')), e)).status).toBe(403);
    expect((await worker.fetch(get('/admin', await cookieOf()), e)).status).toBe(403); // sessão v1 sem identidade
    expect((await worker.fetch(get('/admin', await cookieOf('michell')), e)).status).toBe(200);
    expect((await worker.fetch(new Request('https://jogos.test/admin'), e)).status).toBe(303);
    expect((await worker.fetch(post('/admin/create', { user: 'abc', password: 'x'.repeat(12) }, await cookieOf('fixa')), e)).status).toBe(403);
  });

  it('whoami informa se é admin', async () => {
    const e = env();
    expect(await (await worker.fetch(get('/whoami', await cookieOf('michell')), e)).json()).toEqual({ admin: true, user: 'michell' });
    expect(await (await worker.fetch(get('/whoami', await cookieOf('fixa')), e)).json()).toEqual({ admin: false, user: 'fixa' });
  });

  it('cadastra, entra, troca a senha, e remover bloqueia a sessão aberta', async () => {
    kvShared = fakeKv();
    const e = env(kvShared);
    const admin = await cookieOf('michell');
    let res = await worker.fetch(post('/admin/create', { user: 'Natalia.Oliveira', password: 'senha-da-natalia-1' }, admin), e);
    expect(res.headers.get('Location')).toBe('/admin?m=created');
    expect(JSON.stringify([...kvShared.data.values()])).not.toContain('senha-da-natalia-1');

    res = await login('natalia.oliveira', 'senha-da-natalia-1');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/');
    const setCookie = res.headers.get('Set-Cookie')!;
    const natCookie = setCookie.split(';')[0]!;
    expect((await worker.fetch(get('/', natCookie), e)).status).toBe(200);
    expect((await worker.fetch(get('/admin', natCookie), e)).status).toBe(403);
    expect((await login('natalia.oliveira', 'senha-errada-errada')).status).toBe(401);

    res = await worker.fetch(post('/admin/password', { user: 'natalia.oliveira', password: 'nova-senha-da-nat-2' }, admin), e);
    expect(res.headers.get('Location')).toBe('/admin?m=password');
    expect((await login('natalia.oliveira', 'senha-da-natalia-1')).status).toBe(401);
    expect((await login('natalia.oliveira', 'nova-senha-da-nat-2')).status).toBe(303);

    res = await worker.fetch(post('/admin/delete', { user: 'natalia.oliveira' }, admin), e);
    expect(res.headers.get('Location')).toBe('/admin?m=deleted');
    expect((await worker.fetch(get('/', natCookie), e)).status).toBe(303); // sessão já aberta deixa de valer
    expect((await login('natalia.oliveira', 'nova-senha-da-nat-2')).status).toBe(401);
  });

  it('recusa nome inválido, senha fraca, duplicado, conta fixa e Origin estranha', async () => {
    kvShared = fakeKv();
    const e = env(kvShared);
    const admin = await cookieOf('michell');
    const code = async (body: Record<string, string>, path = '/admin/create') =>
      (await worker.fetch(post(path, body, admin), e)).headers.get('Location');
    expect(await code({ user: 'a b', password: 'x'.repeat(12) })).toBe('/admin?m=invalid');
    expect(await code({ user: 'maria', password: 'curta' })).toBe('/admin?m=weak');
    expect(await code({ user: 'maria', password: 'x'.repeat(12) })).toBe('/admin?m=created');
    expect(await code({ user: 'maria', password: 'x'.repeat(12) })).toBe('/admin?m=exists');
    expect(await code({ user: 'michell', password: 'x'.repeat(12) })).toBe('/admin?m=reserved');
    expect(await code({ user: 'FIXA', password: 'x'.repeat(12) })).toBe('/admin?m=reserved');
    expect(await code({ user: 'ninguem', password: 'x'.repeat(12) }, '/admin/password')).toBe('/admin?m=missing');
    expect(await code({ user: 'ninguem' }, '/admin/delete')).toBe('/admin?m=missing');
    expect((await worker.fetch(post('/admin/create', { user: 'zed', password: 'x'.repeat(12) }, admin, 'https://evil.test'), e)).status).toBe(403);
    expect((await worker.fetch(post('/admin/outra', {}, admin), e)).status).toBe(404);
  });

  it('sem KV configurado: avisa e o login dos secrets segue funcionando', async () => {
    const e = env(null);
    const admin = await cookieOf('michell');
    const html = await (await worker.fetch(get('/admin', admin), e)).text();
    expect(html).toContain('não está configurado');
    expect((await worker.fetch(post('/admin/create', { user: 'abc', password: 'x'.repeat(12) }, admin), e)).headers.get('Location')).toBe('/admin?m=nokv');
    const res = await worker.fetch(post('/login', { user: 'michell', password: 'senha-de-teste-longa-123' }, ''), e);
    expect(res.status).toBe(303);
  });

  it('escapa o nome na página (sem XSS por registro adulterado no KV)', async () => {
    const kv = fakeKv();
    kv.data.set('u:<img src=x onerror=alert(1)>', JSON.stringify({ salt: 'AA==', hash: 'AA==', iter: 1, createdAt: NOW }));
    const html = await (await worker.fetch(get('/admin', await cookieOf('michell')), env(kv))).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;img');
  });
});
