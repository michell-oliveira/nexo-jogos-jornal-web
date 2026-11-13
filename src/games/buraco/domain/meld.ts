import { isWildcard, SUITS, type Card, type Suit } from './cards';

export const MIN_MELD = 3;
export const CANASTA_SIZE = 7;
/** Ás baixo (A-2-3) ou alto (Q-K-A): as posições vão de 1 a 14, e a 14 é o Ás. */
export const MAX_MELD = 14;

/**
 * Jogo baixado na mesa: sequência do mesmo naipe.
 * `cards[i]` ocupa a posição `start + i` (posição 14 = Ás alto). Guardar a posição de cada carta
 * é o que permite saber qual curinga está "no lugar de quê" e se ele é natural (o 2 na posição 2).
 */
export interface Meld {
  readonly id: number;
  readonly suit: Suit;
  readonly start: number;
  readonly cards: readonly Card[];
}

type Arrangement = Pick<Meld, 'suit' | 'start' | 'cards'>;

const rankAt = (position: number): number => (position === 14 ? 1 : position);

/** Carta é natural quando é do naipe do jogo e é exatamente a carta daquela posição. */
const isNaturalAt = (card: Card, suit: Suit, position: number): boolean =>
  card.suit === suit && card.rank === rankAt(position);

/** Quantos curingas "de verdade" (substituindo outra carta) o jogo tem. */
export const wildCount = (m: Arrangement): number =>
  m.cards.filter((c, i) => !isNaturalAt(c, m.suit, m.start + i)).length;

export const isCanasta = (m: Arrangement): boolean => m.cards.length >= CANASTA_SIZE;
export const isCleanCanasta = (m: Arrangement): boolean => isCanasta(m) && wildCount(m) === 0;

/** Tenta encaixar as cartas em `suit` começando na posição `start`; null se não formar sequência. */
function fit(cards: readonly Card[], suit: Suit, start: number): Arrangement | null {
  const pool = [...cards];
  const slots: (Card | null)[] = [];
  for (let i = 0; i < cards.length; i++) {
    const at = pool.findIndex((c) => isNaturalAt(c, suit, start + i));
    slots.push(at >= 0 ? pool.splice(at, 1)[0]! : null);
  }
  // Sobras só podem ser UM curinga (o 2 ou coringa); qualquer outra sobra quebra a sequência.
  if (pool.length > 1 || !pool.every(isWildcard)) return null;
  const arranged = slots.map((c) => c ?? pool[0]!);
  return { suit, start, cards: arranged };
}

/**
 * Valida e ordena um conjunto de cartas como sequência. `prefer` decide a ambiguidade quando o curinga
 * pode ficar numa ponta (ex.: 3-4-5 + curinga = 2-3-4-5 ou 3-4-5-6); preferimos sempre menos curingas.
 */
export function arrangeSequence(cards: readonly Card[], prefer: 'low' | 'high' = 'low'): Arrangement | null {
  const n = cards.length;
  if (n < MIN_MELD || n > MAX_MELD) return null;
  let best: Arrangement | null = null;
  let bestWilds = Infinity;
  for (const suit of SUITS) {
    for (let start = 1; start + n - 1 <= MAX_MELD; start++) {
      const a = fit(cards, suit, start);
      if (!a) continue;
      const w = wildCount(a);
      const better = w < bestWilds || (w === bestWilds && prefer === 'high' && best !== null);
      if (better) {
        best = a;
        bestWilds = w;
      }
    }
  }
  return best;
}

export const isValidSequence = (cards: readonly Card[]): boolean => arrangeSequence(cards) !== null;
