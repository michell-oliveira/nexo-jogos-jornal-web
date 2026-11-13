/**
 * Usuários cadastrados pelo site (Cloudflare D1, tabela `users`: migrations/0001_users.sql). Senha nunca é guardada: só salt + hash PBKDF2-SHA-256.
 * Os usuários dos secrets (APP_USER/APP_USERS) continuam valendo e não passam por aqui.
 */

/** Subconjunto do D1Database que o Worker usa (injetável nos testes; evita depender dos tipos do runtime). */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1 {
  prepare(sql: string): D1Statement;
}

/** 100 000 é o teto de iterações do PBKDF2 no runtime do Workers. */
export const PBKDF2_ITERATIONS = 100_000;
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;
export const MAX_USERS = 50;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const enc = new TextEncoder();

export interface UserRecord {
  salt: string;
  hash: string;
  iter: number;
  createdAt: number;
}

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (text: string): Uint8Array<ArrayBuffer> | null => {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
};

/** Nome em minúsculas, 3 a 40 caracteres de [a-z0-9._-]; null se inválido. */
export function normalizeUser(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return USERNAME_RE.test(name) ? name : null;
}

/** Devolve o motivo da recusa, ou null se a senha serve. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > MAX_PASSWORD) return `A senha pode ter no máximo ${MAX_PASSWORD} caracteres.`;
  return null;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password: string, nowMs: number): Promise<UserRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: toB64(await derive(password, salt, PBKDF2_ITERATIONS)), iter: PBKDF2_ITERATIONS, createdAt: nowMs };
}

const DUMMY_SALT = new Uint8Array(16) as Uint8Array<ArrayBuffer>;

/**
 * Confere a senha em tempo constante. Com `record` nulo (usuário inexistente) faz o mesmo trabalho de derivação,
 * para o tempo de resposta não revelar quais usuários existem.
 */
export async function verifyPassword(password: string, record: UserRecord | null): Promise<boolean> {
  const salt = record ? fromB64(record.salt) : null;
  const expected = record ? fromB64(record.hash) : null;
  const iter = record && Number.isInteger(record.iter) && record.iter > 0 && record.iter <= PBKDF2_ITERATIONS ? record.iter : PBKDF2_ITERATIONS;
  const got = await derive(password, salt ?? DUMMY_SALT, iter);
  if (!record || !salt || !expected || expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= (got[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

interface Row {
  salt: string;
  hash: string;
  iter: number;
  created_at: number;
}
const toRecord = (r: Row): UserRecord => ({ salt: r.salt, hash: r.hash, iter: r.iter, createdAt: r.created_at });

export async function getUser(db: D1, name: string): Promise<UserRecord | null> {
  const row = await db.prepare('SELECT salt, hash, iter, created_at FROM users WHERE name = ?').bind(name).first<Row>();
  return row ? toRecord(row) : null;
}

/** Cria ou substitui o registro (upsert). Para cadastro novo use `createUser`, que é atômico e respeita o limite. */
export async function putUser(db: D1, name: string, r: UserRecord): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (name, salt, hash, iter, created_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(name) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, iter = excluded.iter',
    )
    .bind(name, r.salt, r.hash, r.iter, r.createdAt)
    .run();
}

export type CreateResult = 'created' | 'exists' | 'limit';

/**
 * Cadastro atômico: um único INSERT que não faz nada se o nome já existe ou se o limite foi atingido
 * (sem a janela "checa e depois grava" que permitiria corrida). Quem não inseriu é desambiguado depois.
 */
export async function createUser(db: D1, name: string, r: UserRecord): Promise<CreateResult> {
  const res = await db
    .prepare(
      'INSERT INTO users (name, salt, hash, iter, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM users) < ? ' +
        'ON CONFLICT(name) DO NOTHING',
    )
    .bind(name, r.salt, r.hash, r.iter, r.createdAt, MAX_USERS)
    .run();
  if (res.meta.changes > 0) return 'created';
  return (await getUser(db, name)) ? 'exists' : 'limit';
}

/** Troca salt/hash só se o usuário existe; devolve false quando não existe. */
export async function setPassword(db: D1, name: string, r: UserRecord): Promise<boolean> {
  const res = await db.prepare('UPDATE users SET salt = ?, hash = ?, iter = ? WHERE name = ?').bind(r.salt, r.hash, r.iter, name).run();
  return res.meta.changes > 0;
}

/** Remove; devolve false quando o usuário não existia. */
export async function deleteUser(db: D1, name: string): Promise<boolean> {
  return (await db.prepare('DELETE FROM users WHERE name = ?').bind(name).run()).meta.changes > 0;
}

export async function listUsers(db: D1): Promise<{ name: string; createdAt: number }[]> {
  const { results } = await db.prepare('SELECT name, created_at FROM users ORDER BY name LIMIT 1000').all<{ name: string; created_at: number }>();
  return results.map((r) => ({ name: r.name, createdAt: r.created_at }));
}
