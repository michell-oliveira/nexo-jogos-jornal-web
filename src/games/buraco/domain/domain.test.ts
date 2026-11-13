import { describe, expect, it } from 'vitest';
import { aiStep, candidateMelds, playAiTurn } from './ai';
import { buildDeck, cardPoints, shuffleDeck, type Card, type Suit } from './cards';
import {
  addToMeld,
  discardCard,
  drawFromStock,
  matchWinner,
  roundWinner,
  newGame,
  nextRound,
  playMeld,
  takeDiscardPile,
  type GameState,
  type PlayerState,
  type Result,
} from './game';
import { arrangeSequence, isCleanCanasta, wildCount } from './meld';
import { scoreRound } from './scoring';

// ------------------------------------------------------------------ helpers de teste

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let nextId = 1000;
/** Carta de teste: 'H5' = 5♥, 'SA' = Ás♠, 'SK'... ; 'JK' = coringa. */
const c = (code: string): Card => {
  if (code === 'JK') return { id: nextId++, suit: null, rank: 0 };
  const rank = { A: 1, J: 11, Q: 12, K: 13 }[code.slice(1)] ?? Number(code.slice(1));
  return { id: nextId++, suit: code[0] as Suit, rank };
};
const cs = (...codes: string[]): Card[] => codes.map(c);
const ids = (cards: readonly Card[]): number[] => cards.map((x) => x.id);

const player = (over: Partial<PlayerState> = {}): PlayerState => ({ hand: [], melds: [], dead: null, tookDead: false, ...over });

/** Estado montado à mão, vez do humano já na fase de jogo. */
const scenario = (p0: Partial<PlayerState>, extra: Partial<GameState> = {}): GameState => ({
  stock: cs('H3', 'H4', 'D9', 'D8'),
  discard: cs('C9'),
  players: [player(p0), player({ hand: cs('C3', 'D5'), dead: cs('C4'), tookDead: false })],
  current: 0,
  phase: 'play',
  round: 1,
  matchScore: [0, 0],
  nextMeldId: 1,
  result: null,
  ...extra,
});

const must = (r: Result): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

// ------------------------------------------------------------------ baralho e pontos

describe('baralho', () => {
  it('tem 108 cartas com ids únicos (2 baralhos + 4 coringas) e embaralha com seed', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((x) => x.id)).size).toBe(108);
    expect(deck.filter((x) => x.suit === null)).toHaveLength(4);
    expect(ids(shuffleDeck(seeded(7)))).toEqual(ids(shuffleDeck(seeded(7))));
    expect(ids(shuffleDeck(seeded(7)))).not.toEqual(ids(shuffleDeck(seeded(8))));
  });

  it('tabela de pontos usual', () => {
    expect([c('JK'), c('H2'), c('SA'), c('SK'), c('H8'), c('H7'), c('H3')].map(cardPoints)).toEqual([50, 20, 15, 10, 10, 5, 5]);
  });
});

// ------------------------------------------------------------------ sequências

describe('sequência', () => {
  it('aceita sequência pura, Ás baixo e Ás alto', () => {
    expect(arrangeSequence(cs('H5', 'H3', 'H4'))?.start).toBe(3);
    expect(arrangeSequence(cs('HA', 'H2', 'H3'))?.start).toBe(1);
    expect(arrangeSequence(cs('HQ', 'HK', 'HA'))?.start).toBe(12);
  });

  it('recusa menos de 3, naipes misturados, buraco sem curinga e carta repetida', () => {
    expect(arrangeSequence(cs('H5', 'H6'))).toBeNull();
    expect(arrangeSequence(cs('H5', 'H6', 'S7'))).toBeNull();
    expect(arrangeSequence(cs('H5', 'H6', 'H8'))).toBeNull();
    expect(arrangeSequence(cs('H5', 'H6', 'H6', 'H7'))).toBeNull();
  });

  it('curinga (coringa ou 2) tapa um buraco; dois curingas são recusados', () => {
    const a = arrangeSequence(cs('H5', 'JK', 'H7'))!;
    expect(a.cards[1]!.suit).toBeNull();
    expect(wildCount(a)).toBe(1);
    expect(arrangeSequence(cs('H5', 'S2', 'H7'))).not.toBeNull();
    expect(arrangeSequence(cs('H5', 'JK', 'S2', 'H8'))).toBeNull();
  });

  it('2 do mesmo naipe na posição 2 é natural (não conta como curinga)', () => {
    const a = arrangeSequence(cs('HA', 'H2', 'H3', 'JK'))!;
    expect(wildCount(a)).toBe(1); // o coringa; o 2♥ é natural
    expect(wildCount(arrangeSequence(cs('HA', 'H2', 'H3'))!)).toBe(0);
  });

  it('curinga na ponta: prefer decide o lado e prefere sempre o menor nº de curingas', () => {
    expect(arrangeSequence(cs('H3', 'H4', 'H5', 'JK'), 'low')!.start).toBe(2);
    expect(arrangeSequence(cs('H3', 'H4', 'H5', 'JK'), 'high')!.start).toBe(3);
    // 2♥ do mesmo naipe pode ser natural: 2-3-4 sem curinga
    expect(wildCount(arrangeSequence(cs('H2', 'H3', 'H4'))!)).toBe(0);
  });
});

// ------------------------------------------------------------------ início

describe('início de rodada', () => {
  it('dá 11 cartas, morto de 11, 1 carta no descarte e o resto no monte', () => {
    const g = newGame(seeded(1));
    expect(g.players.map((p) => p.hand.length)).toEqual([11, 11]);
    expect(g.players.map((p) => p.dead?.length)).toEqual([11, 11]);
    expect(g.discard).toHaveLength(1);
    expect(g.stock).toHaveLength(108 - 44 - 1);
    expect(g.phase).toBe('draw');
  });
});

// ------------------------------------------------------------------ turno

describe('turno', () => {
  it('exige comprar antes de jogar e não deixa comprar duas vezes', () => {
    const g = newGame(seeded(2));
    expect(playMeld(g, []).ok).toBe(false);
    expect(discardCard(g, g.players[0].hand[0]!.id).ok).toBe(false);
    const d = must(drawFromStock(g));
    expect(d.players[0].hand).toHaveLength(12);
    expect(drawFromStock(d).ok).toBe(false);
    expect(takeDiscardPile(d).ok).toBe(false);
  });

  it('pegar o lixo leva a pilha inteira', () => {
    const g = scenario({ hand: cs('H9') }, { phase: 'draw', discard: cs('C9', 'D2', 'S5') });
    const t = must(takeDiscardPile(g));
    expect(t.players[0].hand).toHaveLength(4);
    expect(t.discard).toHaveLength(0);
    expect(takeDiscardPile({ ...g, discard: [] }).ok).toBe(false);
  });

  it('descartar passa a vez e a carta vai ao topo', () => {
    const hand = cs('H9', 'S3');
    const g = must(discardCard(scenario({ hand }), hand[0]!.id));
    expect(g.current).toBe(1);
    expect(g.phase).toBe('draw');
    expect(g.discard.at(-1)!.id).toBe(hand[0]!.id);
  });

  it('baixar jogo tira da mão; carta que não está na mão ou id repetido é recusado', () => {
    const run = cs('H5', 'H6', 'H7');
    const g = scenario({ hand: [...run, ...cs('S9', 'S3')] });
    const m = must(playMeld(g, ids(run)));
    expect(m.players[0].hand).toHaveLength(2);
    expect(m.players[0].melds).toHaveLength(1);
    expect(playMeld(g, [...ids(run), 99999]).ok).toBe(false);
    expect(playMeld(g, [run[0]!.id, run[0]!.id, run[1]!.id]).ok).toBe(false);
    expect(playMeld(g, ids(cs('H5'))).ok).toBe(false);
  });

  it('acrescentar só vale se continuar sequência e só na própria mesa', () => {
    const run = cs('H5', 'H6', 'H7');
    const h8 = c('H8');
    const s2 = c('S9');
    let g = must(playMeld(scenario({ hand: [...run, h8, s2, c('D3')] }), ids(run)));
    const id = g.players[0].melds[0]!.id;
    expect(addToMeld(g, id, [s2.id]).ok).toBe(false);
    expect(addToMeld(g, 77, [h8.id]).ok).toBe(false);
    g = must(addToMeld(g, id, [h8.id]));
    expect(g.players[0].melds[0]!.cards).toHaveLength(4);
  });
});

// ------------------------------------------------------------------ morto e bater

describe('morto e bater', () => {
  it('esvaziar a mão baixando pega o morto e continua; descartar a última também pega o morto', () => {
    const run = cs('H5', 'H6', 'H7');
    const dead = cs('S3', 'S4', 'S9');
    const g = must(playMeld(scenario({ hand: run, dead }), ids(run)));
    expect(g.phase).toBe('play');
    expect(g.players[0].tookDead).toBe(true);
    expect(g.players[0].hand).toHaveLength(3);

    const last = c('D9');
    const g2 = must(discardCard(scenario({ hand: [last], dead }), last.id));
    expect(g2.players[0].hand).toHaveLength(3);
    expect(g2.current).toBe(1);
  });

  it('bater exige canastra: sem ela a ação é recusada', () => {
    const last = c('D9');
    const g = scenario({ hand: [last], tookDead: true, melds: [{ id: 1, suit: 'H', start: 3, cards: cs('H3', 'H4', 'H5') }] });
    expect(discardCard(g, last.id).ok).toBe(false);
  });

  it('sem canastra e morto pego, não deixa sobrar só 1 carta ao baixar (beco sem saída)', () => {
    const run = cs('H5', 'H6', 'H7');
    const g = scenario({ hand: [...run, c('D9')], tookDead: true });
    expect(playMeld(g, ids(run)).ok).toBe(false);
  });

  it('com canastra, descartar a última carta bate, pontua e soma ao acumulado', () => {
    const seven = cs('H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'); // canastra limpa
    const last = c('D9');
    const g = scenario({
      hand: [last],
      tookDead: true,
      melds: [{ id: 1, suit: 'H', start: 3, cards: seven }],
    });
    const done = must(discardCard(g, last.id));
    expect(done.phase).toBe('over');
    expect(done.result!.wentOut).toBe(0);
    // 200 canastra + (5*5 [3..7] + 10 + 10 = 45) + 100 bater − 0
    expect(done.result!.scores[0]).toMatchObject({ canastas: 200, melded: 45, goOut: 100, handPenalty: 0, total: 345 });
    expect(done.matchScore[0]).toBe(345);
    expect(done.matchScore[1]).toBe(done.result!.scores[1].total);
    expect(drawFromStock(done).ok).toBe(false);
  });

  it('monte vazio ao comprar encerra a rodada sem batedor', () => {
    const g = scenario({ hand: cs('H9') }, { phase: 'draw', stock: [] });
    const done = must(drawFromStock(g));
    expect(done.phase).toBe('over');
    expect(done.result!.wentOut).toBeNull();
  });
});

// ------------------------------------------------------------------ pontuação e partida

describe('pontuação', () => {
  it('canastra limpa 200, suja 100; cartas baixadas somam, mão subtrai', () => {
    const clean = { id: 1, suit: 'H' as const, start: 3, cards: cs('H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9') };
    const dirty = { id: 2, suit: 'S' as const, start: 3, cards: cs('S3', 'S4', 'JK', 'S6', 'S7', 'S8', 'S9') };
    expect(isCleanCanasta(clean)).toBe(true);
    expect(isCleanCanasta(dirty)).toBe(false);
    const s = scoreRound([clean, dirty], cs('SK', 'JK'), false);
    expect(s.canastas).toBe(300);
    expect(s.handPenalty).toBe(60);
    expect(s.goOut).toBe(0);
    expect(s.total).toBe(300 + s.melded - 60);
  });

  it('vencedor da partida: ≥3000, maior total; empate segue', () => {
    const base = newGame(seeded(3));
    expect(matchWinner({ ...base, matchScore: [2999, 100] })).toBeNull();
    expect(matchWinner({ ...base, matchScore: [3100, 2000] })).toBe(0);
    expect(matchWinner({ ...base, matchScore: [3000, 3400] })).toBe(1);
    expect(matchWinner({ ...base, matchScore: [3000, 3000] })).toBeNull();
  });

  it('vencedor da rodada: maior pontuação da rodada; empate ou sem resultado → null', () => {
    const base = newGame(seeded(3));
    const sc = (total: number) => ({ canastas: 0, melded: 0, goOut: 0, handPenalty: 0, total });
    const over = (a: number, b: number) => ({ ...base, phase: 'over' as const, result: { wentOut: null, scores: [sc(a), sc(b)] as [ReturnType<typeof sc>, ReturnType<typeof sc>] } });
    expect(roundWinner(base)).toBeNull();
    expect(roundWinner(over(1025, 535))).toBe(0);
    expect(roundWinner(over(-40, 120))).toBe(1);
    expect(roundWinner(over(300, 300))).toBeNull();
  });

  it('nextRound só com rodada encerrada, mantém placar e alterna quem começa', () => {
    const g = newGame(seeded(4));
    expect(nextRound(g).ok).toBe(false);
    const r2 = must(nextRound({ ...g, phase: 'over', matchScore: [300, 120] }, seeded(5)));
    expect(r2.round).toBe(2);
    expect(r2.matchScore).toEqual([300, 120]);
    expect(r2.current).not.toBe(g.current);
  });
});

// ------------------------------------------------------------------ IA

describe('IA', () => {
  it('candidateMelds acha sequências e usa curinga só para tapar buraco', () => {
    const hand = cs('H5', 'H6', 'H7', 'S9', 'S11'.replace('S11', 'SJ'), 'JK');
    const found = candidateMelds(hand);
    expect(found[0]).toHaveLength(3); // H5-H6-H7 sem curinga vem primeiro
    expect(found.some((m) => m.some((x) => x.suit === null))).toBe(true); // S9-JK-SJ
  });

  it('só pega o descarte quando ele forma jogo; senão compra do monte', () => {
    const useful = scenario({}, { current: 1, phase: 'draw', discard: cs('H7') });
    const withPair = { ...useful, players: [useful.players[0], player({ hand: cs('H5', 'H6', 'S9'), dead: cs('C4') })] as GameState['players'] };
    expect(must(aiStep(withPair)).discard).toHaveLength(0);
    const useless = { ...withPair, discard: cs('D9') };
    const r = must(aiStep(useless));
    expect(r.discard).toHaveLength(1);
    expect(r.stock.length).toBe(useless.stock.length - 1);
  });

  it('baixa jogo cedo e descarta a carta menos útil (isolada) em vez do curinga', () => {
    const hand = cs('H5', 'H6', 'H7', 'JK', 'SK', 'D3', 'C9');
    const g = scenario({}, { current: 1, phase: 'play', players: [player(), player({ hand, dead: cs('C4') })] });
    const after = playAiTurn(g);
    expect(after.players[1].melds).toHaveLength(1);
    expect(after.current).toBe(0);
    expect(after.discard.at(-1)!.rank).toBe(13); // SK isolado e de maior valor, não o coringa
    expect(after.players[1].hand.some((x) => x.suit === null)).toBe(true);
  });

  it('IA contra IA termina a rodada sem travar nem quebrar regra (várias sementes)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let g = newGame(seeded(seed));
      for (let i = 0; i < 600 && g.phase !== 'over'; i++) {
        const before = g;
        g = playAiTurn(g);
        if (g === before) throw new Error(`IA travada na semente ${seed}`);
      }
      expect(g.phase).toBe('over');
      const total = g.stock.length + g.discard.length + g.players.reduce(
        (n, p) => n + p.hand.length + (p.dead?.length ?? 0) + p.melds.reduce((m, x) => m + x.cards.length, 0), 0);
      expect(total).toBe(108); // nenhuma carta some ou duplica
    }
  });
});
