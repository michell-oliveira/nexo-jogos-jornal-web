import { shuffled, type Rng } from '../../../core/dom';

export type Suit = 'S' | 'H' | 'D' | 'C'; // espadas, copas, ouros, paus
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** Valor 1 (Ás) a 13 (K); o coringa usa 0. O Ás também vale 14 no fim da sequência (ver meld.ts). */
export type Rank = number;
export const JOKER_RANK = 0;

/** `id` é único no jogo (há 2 baralhos): a interface e as ações referenciam cartas por id, nunca por posição. */
export interface Card {
  readonly id: number;
  readonly suit: Suit | null; // null = coringa
  readonly rank: Rank;
}

export const isJoker = (c: Card): boolean => c.suit === null;
/** O 2 e o coringa são curingas (substituem outra carta). */
export const isWildcard = (c: Card): boolean => c.rank === 2 || isJoker(c);

/**
 * Tabela ÚNICA de pontos por carta (a usual do buraco). O owner ainda não fixou os valores:
 * para trocar, basta editar esta função. Usada nas cartas baixadas (+) e nas que sobram na mão (−).
 */
export const cardPoints = (c: Card): number => {
  if (isJoker(c)) return 50;
  if (c.rank === 2) return 20;
  if (c.rank === 1) return 15;
  if (c.rank >= 8) return 10; // 8, 9, 10, J, Q, K
  return 5; // 3 a 7
};

export const DECKS = 2;
export const JOKERS_PER_DECK = 2;

/** 2 baralhos: 104 cartas + 4 coringas = 108. Ids de 0 a 107. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (let d = 0; d < DECKS; d++) {
    for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, suit, rank });
    for (let j = 0; j < JOKERS_PER_DECK; j++) cards.push({ id: id++, suit: null, rank: JOKER_RANK });
  }
  return cards;
}

/** RNG injetável: em teste passe uma semente determinística, em produção `Math.random`. */
export const shuffleDeck = (rng: Rng = Math.random): Card[] => shuffled(buildDeck(), rng);

export const sumPoints = (cards: readonly Card[]): number => cards.reduce((s, c) => s + cardPoints(c), 0);

const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const cardLabel = (c: Card): string =>
  isJoker(c) ? '🃏' : `${RANK_LABEL[c.rank] ?? String(c.rank)}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit!]}`;
