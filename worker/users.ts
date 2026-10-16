/**
 * Usuários cadastrados pelo site (Cloudflare KV). Senha nunca é guardada: só salt + hash PBKDF2-SHA-256.
 * Os usuários dos secrets (APP_USER/APP_USERS) continuam valendo e não passam por aqui.
 */

/** Subconjunto do KVNamespace que o Worker usa (evita depender dos tipos do runtime). */
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

/** 100 000 é o teto de iterações do PBKDF2 no runtime do Workers. */
export const PBKDF2_ITERATIONS = 100_000;
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;
export const MAX_USERS = 50;
const PREFIX = 'u:';
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

/** Lê e valida o registro; JSON quebrado ou com forma errada vale como "não existe" (falha fechada). */
function parseRecord(text: string | null): UserRecord | null {
  if (!text) return null;
  try {
    const r = JSON.parse(text) as Partial<UserRecord> | null;
    if (!r || typeof r.salt !== 'string' || typeof r.hash !== 'string' || typeof r.iter !== 'number' || typeof r.createdAt !== 'number') return null;
    return { salt: r.salt, hash: r.hash, iter: r.iter, createdAt: r.createdAt };
  } catch {
    return null;
  }
}

export const getUser = async (kv: KV, name: string): Promise<UserRecord | null> => parseRecord(await kv.get(PREFIX + name));
export const putUser = (kv: KV, name: string, record: UserRecord): Promise<void> => kv.put(PREFIX + name, JSON.stringify(record));
export const deleteUser = (kv: KV, name: string): Promise<void> => kv.delete(PREFIX + name);

export async function listUsers(kv: KV): Promise<{ name: string; createdAt: number }[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) names.push(k.name.slice(PREFIX.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && names.length < 1000);
  const out: { name: string; createdAt: number }[] = [];
  for (const name of names.sort()) {
    const rec = await getUser(kv, name);
    if (rec) out.push({ name, createdAt: rec.createdAt });
  }
  return out;
}
