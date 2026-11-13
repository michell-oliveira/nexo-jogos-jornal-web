import { describe, expect, it } from 'vitest';
import type { Card, Suit } from './domain/cards';
import type { GameState, PlayerState } from './domain/game';
import { mineKey, planMoves } from './flights';

const card = (id: number, suit: Suit | null, rank: number): Card => ({ id, suit, rank });
const player = (hand: Card[], melds: PlayerState['melds'] = []): PlayerState => ({ hand, melds, dead: null, tookDead: false });
const game = (o: Partial<GameState> & { p0?: PlayerState; p1?: PlayerState }): GameState => ({
  stock: [card(90, 'S', 5)], discard: [card(80, 'H', 7), card(81, 'H', 9)],
  players: [o.p0 ?? player([card(1, 'S', 3)]), o.p1 ?? player([card(2, 'D', 4)])],
  current: 0, phase: 'draw', round: 1, matchScore: [0, 0], nextMeldId: 1, result: null, ...o,
});

describe('planMoves', () => {
  it('compra do monte', () => {
    const a = game({});
    const b = game({ phase: 'play', stock: [], p0: player([card(1, 'S', 3), card(90, 'S', 5)]) });
    expect(planMoves(a, b, 0)).toEqual({ drawn: { ids: [90], source: 'stock' }, melded: [], discarded: null });
  });
  it('pega a pilha do descarte', () => {
    const a = game({});
    const b = game({ phase: 'play', discard: [], p0: player([card(1, 'S', 3), card(80, 'H', 7), card(81, 'H', 9)]) });
    expect(planMoves(a, b, 0).drawn).toEqual({ ids: [80, 81], source: 'pile' });
  });
  it('baixar jogo e descartar', () => {
    const a = game({ phase: 'play', p0: player([card(1, 'S', 3), card(3, 'S', 4), card(4, 'S', 5), card(5, 'C', 9)]) });
    const meld = { id: 1, suit: 'S' as Suit, start: 3, cards: [card(1, 'S', 3), card(3, 'S', 4), card(4, 'S', 5)] };
    const mid = game({ phase: 'play', p0: player([card(5, 'C', 9)], [meld]) });
    expect(planMoves(a, mid, 0).melded.sort()).toEqual([1, 3, 4]);
    const end = game({ phase: 'draw', current: 1, discard: [card(80, 'H', 7), card(81, 'H', 9), card(5, 'C', 9)], p0: player([], [meld]) });
    expect(planMoves(mid, end, 0).discarded).toBe(5);
  });
  it('jogada do outro jogador não aparece para mim', () => {
    const a = game({ phase: 'play', current: 1 });
    const b = game({ phase: 'draw', current: 0, discard: [...a.discard, card(2, 'D', 4)], p1: player([]) });
    expect(planMoves(a, b, 0)).toEqual({ drawn: null, melded: [], discarded: 2 });
  });
});

describe('mineKey', () => {
  it('jogadas do computador não mudam a chave da minha área', () => {
    const wait1 = game({ current: 1, phase: 'draw' });
    const wait2 = game({ current: 1, phase: 'play', stock: [], discard: [card(80, 'H', 7)], p1: player([card(2, 'D', 4), card(90, 'S', 5)]) });
    expect(mineKey(wait2)).toBe(mineKey(wait1));
  });
  it('a passagem de vez, sozinha, não refaz minha mão', () => {
    const base = game({});
    expect(mineKey(game({ phase: 'play' }))).toBe(mineKey(base));
    expect(mineKey(game({ current: 1 }))).toBe(mineKey(base));
  });
  it('muda quando minha mão, minha mesa ou a rodada mudam', () => {
    const base = game({});
    expect(mineKey(game({ p0: player([card(1, 'S', 3), card(7, 'S', 4)]) }))).not.toBe(mineKey(base));
    expect(mineKey(game({ round: 2 }))).not.toBe(mineKey(base));
  });
});
