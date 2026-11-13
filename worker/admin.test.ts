import { describe, expect, it } from 'vitest';
import { createSession, sessionUser, verifySession, COOKIE_NAME } from './auth';
import worker, { type Env } from './index';
import { MAX_USERS, hashPassword, normalizeUser, passwordProblem, verifyPassword, type D1 } from './users';

const SECRET = 'x'.repeat(40);
const NOW = Date.now();

/** D1 de mentira sobre SQLite real em memória (node:sqlite), com o mesmo SQL da migração. Import dinâmico: o tsc não carrega tipos do Node. */
async function fakeDb(): Promise<D1 & { exec(sql: string): void }> {
  const { DatabaseSync } = await import(/* @vite-ignore */ 'node:' + 'sqlite');
  const { readFileSync } = await import(/* @vite-ignore */ 'node:' + 'fs');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_users.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, params: unknown[] = []) => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql) as never, exec: (sql: string) => sqlite.exec(sql) };
}

const env = (db: D1 | null, over: Partial<Env> = {}): Env => ({
  ASSETS: { fetch: async () => new Response('<p>jogo</p>', { headers: { 'Content-Type': 'text/html' } }) },
  APP_USER: 'michell',
  APP_PASSWORD: 'senha-de-teste-longa-123',
  APP_USERS: JSON.stringify({ fixa: 'outra-senha-fixa-123' }),
  SESSION_SECRET: SECRET,
  ...(db ? { DB: db } : {}),
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
  worker.fetch(post('/login', { user, password }, '', 'https://jogos.test'), env(dbShared));

let dbShared: Awaited<ReturnType<typeof fakeDb>>;

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
    const e = env(await fakeDb());
    expect((await worker.fetch(get('/admin', await cookieOf('fixa')), e)).status).toBe(403);
    expect((await worker.fetch(get('/admin', await cookieOf()), e)).status).toBe(403); // sessão v1 sem identidade
    expect((await worker.fetch(get('/admin', await cookieOf('michell')), e)).status).toBe(200);
    expect((await worker.fetch(new Request('https://jogos.test/admin'), e)).status).toBe(303);
    expect((await worker.fetch(post('/admin/create', { user: 'abc', password: 'x'.repeat(12) }, await cookieOf('fixa')), e)).status).toBe(403);
  });

  it('whoami informa se é admin', async () => {
    const e = env(await fakeDb());
    expect(await (await worker.fetch(get('/whoami', await cookieOf('michell')), e)).json()).toEqual({ admin: true, user: 'michell' });
    expect(await (await worker.fetch(get('/whoami', await cookieOf('fixa')), e)).json()).toEqual({ admin: false, user: 'fixa' });
  });

  it('cadastra, entra, troca a senha, e remover bloqueia a sessão aberta', async () => {
    dbShared = await fakeDb();
    const e = env(dbShared);
    const admin = await cookieOf('michell');
    let res = await worker.fetch(post('/admin/create', { user: 'Natalia.Oliveira', password: 'senha-da-natalia-1' }, admin), e);
    expect(res.headers.get('Location')).toBe('/admin?m=created');
    expect(JSON.stringify(await dbShared.prepare('SELECT * FROM users').all())).not.toContain('senha-da-natalia-1');
    expect(await (await worker.fetch(get('/admin', admin), e)).text()).toContain('<td>natalia.oliveira</td>'); // aparece na hora

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
    dbShared = await fakeDb();
    const e = env(dbShared);
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

  it('sem KV configurado: avisa (D1 ausente) e o login dos secrets segue funcionando', async () => {
    const e = env(null);
    const admin = await cookieOf('michell');
    const html = await (await worker.fetch(get('/admin', admin), e)).text();
    expect(html).toContain('não está configurado');
    expect(await (await worker.fetch(get('/admin?m=nokv', admin), e)).text()).toContain('não está configurado'); // link antigo
    expect((await worker.fetch(post('/admin/create', { user: 'abc', password: 'x'.repeat(12) }, admin), e)).headers.get('Location')).toBe('/admin?m=nostorage');
    const res = await worker.fetch(post('/login', { user: 'michell', password: 'senha-de-teste-longa-123' }, ''), e);
    expect(res.status).toBe(303);
  });

  it('limite de usuários, cadastro duplicado concorrente e troca de senha de inexistente', async () => {
    dbShared = await fakeDb();
    const e = env(dbShared);
    const admin = await cookieOf('michell');
    const loc = async (body: Record<string, string>, path = '/admin/create') => (await worker.fetch(post(path, body, admin), e)).headers.get('Location');
    for (let i = 0; i < MAX_USERS; i++) expect(await loc({ user: `user${String(i).padStart(3, '0')}`, password: 'x'.repeat(12) })).toBe('/admin?m=created');
    expect(await loc({ user: 'excedente', password: 'x'.repeat(12) })).toBe('/admin?m=limit');
    expect(await loc({ user: 'user000', password: 'x'.repeat(12) })).toBe('/admin?m=exists'); // existente tem prioridade sobre o limite
    const rows = await dbShared.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    expect(rows?.n).toBe(MAX_USERS);
    // duas criações simultâneas do mesmo nome: só uma vence
    dbShared = await fakeDb();
    const e2 = env(dbShared);
    const [a, b] = await Promise.all([1, 2].map(() => worker.fetch(post('/admin/create', { user: 'corrida', password: 'x'.repeat(12) }, admin), e2)));
    expect([a!.headers.get('Location'), b!.headers.get('Location')].sort()).toEqual(['/admin?m=created', '/admin?m=exists']);
  });

  it('escapa o nome na página (sem XSS por registro adulterado no KV)', async () => {
    const db = await fakeDb();
    db.exec(`INSERT INTO users VALUES ('<img src=x onerror=alert(1)>', 'AA==', 'AA==', 1, ${NOW})`);
    const html = await (await worker.fetch(get('/admin', await cookieOf('michell')), env(db))).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;img');
  });
});
