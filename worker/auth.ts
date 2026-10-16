/**
 * Autenticação do Worker: sessão em cookie assinado (HMAC-SHA-256), comparação em tempo constante
 * e limite de tentativas. Sem estado no servidor: trocar `SESSION_SECRET` invalida todas as sessões.
 */

const enc = new TextEncoder();

export const COOKIE_NAME = '__Host-jj_session';
export const SESSION_SECONDS = 30 * 24 * 3600;
export const MIN_SECRET_LENGTH = 32;

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
};

const hmacKey = (secret: string, usage: KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);

/**
 * Cria o valor do cookie de sessão. Sem usuário: `v1.<expira em s>.<assinatura>` (formato antigo).
 * Com usuário: `v2.<expira em s>.<usuário em base64url>.<assinatura>`, para o Worker saber quem é (ex.: admin).
 */
export async function createSession(secret: string, nowMs: number, user?: string): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const payload = user === undefined ? `v1.${exp}` : `v2.${exp}.${b64url(enc.encode(user))}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Valida o token (formato, expiração, assinatura em tempo constante) e devolve o usuário (null no v1). */
export async function openSession(secret: string, token: string | undefined, nowMs: number): Promise<{ user: string | null } | null> {
  if (!token || token.length > 600) return null;
  const parts = token.split('.');
  const version = parts[0];
  if (!((version === 'v1' && parts.length === 3) || (version === 'v2' && parts.length === 4))) return null;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp <= Math.floor(nowMs / 1000)) return null;
  const sig = fromB64url(parts[parts.length - 1] ?? '');
  if (!sig) return null;
  const payload = parts.slice(0, -1).join('.');
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), sig, enc.encode(payload)))) return null;
  if (version === 'v1') return { user: null };
  const raw = fromB64url(parts[2] ?? '');
  if (!raw) return null;
  try {
    return { user: new TextDecoder('utf-8', { fatal: true }).decode(raw) };
  } catch {
    return null;
  }
}

export async function verifySession(secret: string, token: string | undefined, nowMs: number): Promise<boolean> {
  return (await openSession(secret, token, nowMs)) !== null;
}

/** Usuário da sessão válida; `null` se a sessão é inválida ou do formato antigo (sem identidade). */
export async function sessionUser(secret: string, token: string | undefined, nowMs: number): Promise<string | null> {
  return (await openSession(secret, token, nowMs))?.user ?? null;
}

/** Compara dois textos sem vazar o tamanho nem o ponto da diferença: compara os HMACs de ambos. */
export async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret, ['sign']);
  const [x, y] = await Promise.all([crypto.subtle.sign('HMAC', key, enc.encode(a)), crypto.subtle.sign('HMAC', key, enc.encode(b))]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= (xa[i] ?? 0) ^ (ya[i] ?? 0);
  return diff === 0;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export const sessionCookie = (value: string, maxAge = SESSION_SECONDS): string =>
  `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;

/** Proteção CSRF dos POSTs: o `Origin` precisa ser exatamente o do próprio site. */
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === new URL(request.url).origin;
};

/** Chave do limitador: IPv4 inteiro; IPv6 pelo prefixo /64 (quem tem um /64 gira bilhões de endereços). */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [headText = '', tailText] = ip.toLowerCase().split('::');
  const head = headText ? headText.split(':') : [];
  const tail = tailText ? tailText.split(':') : [];
  const gap = tailText === undefined ? 0 : Math.max(8 - head.length - tail.length, 0);
  return [...head, ...new Array<string>(gap).fill('0'), ...tail]
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':');
}

/** Limite de falhas por chave (IP) numa janela. Em memória: vale por instância do Worker. */
export class FailureLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private max = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, nowMs: number): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    if (e.resetAt <= nowMs) {
      this.entries.delete(key);
      return false;
    }
    return e.count >= this.max;
  }

  recordFailure(key: string, nowMs: number): void {
    if (this.entries.size > 5000) this.prune(nowMs);
    const e = this.entries.get(key);
    if (!e || e.resetAt <= nowMs) this.entries.set(key, { count: 1, resetAt: nowMs + this.windowMs });
    else e.count++;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private prune(nowMs: number): void {
    for (const [k, v] of this.entries) if (v.resetAt <= nowMs) this.entries.delete(k);
    if (this.entries.size > 5000) this.entries.clear();
  }
}
