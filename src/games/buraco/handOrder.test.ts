import { describe, expect, it } from 'vitest';
import type { Card, Suit } from './domain/cards';
import { dropIndex, fanStep, moveId, nextSortMode, reconcileOrder, sortHand } from './handOrder';

const card = (id: number, suit: Suit | null, rank: number): Card => ({ id, suit, rank });
const ids = (cs: readonly Card[]): number[] => cs.map((c) => c.id);

const HAND = [card(1, 'D', 3), card(2, 'S', 9), card(3, null, 0), card(4, 'S', 2), card(5, 'H', 9)];

describe('sortHand', () => {
  it('por naipe: agrupa o naipe e ordena o valor; coringa ao fim', () => {
    expect(ids(sortHand(HAND, 'suit'))).toEqual([4, 2, 5, 1, 3]);
  });
  it('por valor: agrupa o valor, desempata por naipe; coringa ao fim', () => {
    expect(ids(sortHand(HAND, 'rank'))).toEqual([4, 1, 2, 5, 3]);
  });
  it('não altera a mão original', () => {
    const copy = [...HAND];
    sortHand(HAND, 'suit');
    expect(HAND).toEqual(copy);
  });
  it('alterna o modo', () => {
    expect(nextSortMode('suit')).toBe('rank');
    expect(nextSortMode('rank')).toBe('suit');
  });
});

describe('moveId', () => {
  it('move para a frente e para trás', () => {
    expect(moveId([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(moveId([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
  });
  it('limita a posição e ignora id ausente', () => {
    expect(moveId([1, 2, 3], 1, 99)).toEqual([2, 3, 1]);
    expect(moveId([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});

describe('reconcileOrder', () => {
  it('remove quem saiu e põe as novas no fim', () => {
    const hand = [card(5, 'S', 5), card(2, 'S', 2), card(9, 'H', 9)];
    expect(reconcileOrder([2, 7, 5], hand)).toEqual([2, 5, 9]);
  });
  it('ordem vazia = ordem da mão', () => {
    expect(reconcileOrder([], HAND)).toEqual(ids(HAND));
  });
});

describe('geometria do leque', () => {
  it('passo limitado a 34 e encolhe em telas estreitas', () => {
    expect(fanStep(700, 11)).toBe(34);
    expect(fanStep(300, 20)).toBeLessThan(34);
    expect(fanStep(100, 30)).toBeGreaterThanOrEqual(8);
  });
  it('dropIndex: centro = meio; extremos limitados', () => {
    expect(dropIndex(350, 700, 11)).toBe(5);
    expect(dropIndex(-500, 700, 11)).toBe(0);
    expect(dropIndex(5000, 700, 11)).toBe(10);
    expect(dropIndex(10, 700, 1)).toBe(0);
  });
});
