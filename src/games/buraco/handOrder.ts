import { isJoker, type Card } from './domain/cards';

/** Ordem de organização da mão: agrupar por naipe ou por valor. */
export type SortMode = 'suit' | 'rank';

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
const suitKey = (c: Card): number => (isJoker(c) ? 9 : SUIT_ORDER[c.suit!]!);
const rankKey = (c: Card): number => (isJoker(c) ? 99 : c.rank);

/** Ordena uma cópia da mão (coringas ao fim). Função pura: a interface só guarda a ordem de ids. */
export function sortHand(cards: readonly Card[], mode: SortMode): Card[] {
  const by = mode === 'suit'
    ? (a: Card, b: Card): number => suitKey(a) - suitKey(b) || rankKey(a) - rankKey(b) || a.id - b.id
    : (a: Card, b: Card): number => rankKey(a) - rankKey(b) || suitKey(a) - suitKey(b) || a.id - b.id;
  return [...cards].sort(by);
}

export const nextSortMode = (m: SortMode): SortMode => (m === 'suit' ? 'rank' : 'suit');

/** Move o id para a posição `to` (0..n-1), as demais abrem espaço. Id ausente: devolve a ordem igual. */
export function moveId(order: readonly number[], id: number, to: number): number[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const next = order.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}

/**
 * Reconcilia a ordem do jogador com a mão real: some quem saiu; cartas novas entram no fim
 * (na ordem de `hand`), sem desmanchar o que o jogador organizou.
 */
export function reconcileOrder(order: readonly number[], hand: readonly Card[]): number[] {
  const ids = new Set(hand.map((c) => c.id));
  const kept = order.filter((id) => ids.has(id));
  const have = new Set(kept);
  return [...kept, ...hand.filter((c) => !have.has(c.id)).map((c) => c.id)];
}

// ---- geometria do leque (pura, testável sem DOM)

export const CARD_W = 44;

/**
 * Distância horizontal entre cartas vizinhas do leque, limitada pela largura disponível.
 * No máximo metade da carta (leque bem fechado, só o canto do índice aparece), como numa mão real.
 */
export const fanStep = (width: number, n: number, cardW = CARD_W): number =>
  Math.max(8, Math.min(cardW / 2, (width - cardW - 8) / Math.max(n - 1, 1)));

export const FAN_MAX_RISE = 38;

/**
 * Deslocamento vertical (px, ≤ 0) da carta na posição `k` (0 = centro, negativo à esquerda) num leque de `n`:
 * as pontas ficam na linha de base e o centro sobe, no máximo FAN_MAX_RISE. Assim o leque nunca desce
 * para fora da caixa da mão (antes, com mão cheia, as pontas cobriam os botões abaixo).
 */
export function fanY(k: number, n: number): number {
  const kmax = (n - 1) / 2;
  if (kmax <= 0) return 0;
  const depth = Math.min(1.1, FAN_MAX_RISE / (kmax * kmax));
  return (k * k - kmax * kmax) * depth;
}

/** Posição (0..n-1) que o ponteiro em `px` (relativo ao leque) indica ao arrastar. */
export function dropIndex(px: number, width: number, n: number, cardW = CARD_W): number {
  if (n <= 1) return 0;
  const idx = Math.round((px - width / 2) / fanStep(width, n, cardW) + (n - 1) / 2);
  return Math.max(0, Math.min(n - 1, idx));
}

// ---- zoom do jogo (-50% .. +50%, 0 = tamanho atual)

export const ZOOM_MIN = -50;
export const ZOOM_MAX = 50;
export const ZOOM_STEP = 5;

/** Valor salvo/digitado → percentual válido (inteiro no passo, dentro dos limites); inválido → 0. */
export function clampZoom(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(n / ZOOM_STEP) * ZOOM_STEP));
}

/** Percentual do controle → fator multiplicador do tamanho (0 → 1, +50 → 1,5, −50 → 0,5). */
export const zoomFactor = (pct: number): number => 1 + clampZoom(pct) / 100;
