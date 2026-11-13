import type { Rng } from '../../../core/dom';
import { shuffleDeck, type Card } from './cards';
import { arrangeSequence, type Meld } from './meld';
import { hasCanasta, scoreRound, TARGET_SCORE, type RoundScore } from './scoring';

export const HAND_SIZE = 11;
export type PlayerIndex = 0 | 1; // 0 = humano, 1 = computador
export const HUMAN: PlayerIndex = 0;
export const COMPUTER: PlayerIndex = 1;
export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export interface PlayerState {
  readonly hand: readonly Card[];
  readonly melds: readonly Meld[];
  /** Morto ainda intacto (11 cartas) ou null depois de pego. */
  readonly dead: readonly Card[] | null;
  readonly tookDead: boolean;
}

/** `draw` = precisa comprar/pegar o lixo; `play` = baixa, acrescenta e descarta; `over` = rodada encerrada. */
export type Phase = 'draw' | 'play' | 'over';

export interface RoundResult {
  /** Quem bateu; null quando o monte acabou. */
  readonly wentOut: PlayerIndex | null;
  readonly scores: readonly [RoundScore, RoundScore];
}

export interface GameState {
  readonly stock: readonly Card[];
  /** Pilha de descarte; a última é o topo. */
  readonly discard: readonly Card[];
  readonly players: readonly [PlayerState, PlayerState];
  readonly current: PlayerIndex;
  readonly phase: Phase;
  readonly round: number;
  readonly matchScore: readonly [number, number];
  readonly nextMeldId: number;
  readonly result: RoundResult | null;
}

/** Toda ação devolve estado novo (imutável) ou o motivo da recusa; assim IA e interface usam o mesmo caminho. */
export type Result = { ok: true; state: GameState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: GameState): Result => ({ ok: true, state });

// ---------------------------------------------------------------- início

function dealRound(rng: Rng, round: number, matchScore: readonly [number, number]): GameState {
  const deck = [...shuffleDeck(rng)];
  const take = (n: number): Card[] => deck.splice(0, n);
  const player = (): PlayerState => ({ hand: take(HAND_SIZE), melds: [], dead: take(HAND_SIZE), tookDead: false });
  const p0 = player();
  const p1 = player();
  const top = take(1);
  return {
    stock: deck,
    discard: top,
    players: [p0, p1],
    current: round % 2 === 1 ? HUMAN : COMPUTER, // alterna quem começa a cada rodada
    phase: 'draw',
    round,
    matchScore,
    nextMeldId: 1,
    result: null,
  };
}

export const newGame = (rng: Rng = Math.random): GameState => dealRound(rng, 1, [0, 0]);

/** Próxima rodada, mantendo o placar acumulado. Só vale com a rodada encerrada. */
export function nextRound(state: GameState, rng: Rng = Math.random): Result {
  if (state.phase !== 'over') return fail('A rodada ainda não terminou.');
  return ok(dealRound(rng, state.round + 1, state.matchScore));
}

/** Vencedor da partida (≥ 3000 pontos; maior total decide). Empate no limite → null, joga-se mais uma rodada. */
export function matchWinner(state: GameState): PlayerIndex | null {
  const [a, b] = state.matchScore;
  if (a < TARGET_SCORE && b < TARGET_SCORE) return null;
  if (a === b) return null;
  return a > b ? 0 : 1;
}

// ---------------------------------------------------------------- utilitários internos

const withPlayer = (state: GameState, p: PlayerIndex, patch: Partial<PlayerState>): GameState => {
  const players: [PlayerState, PlayerState] = [state.players[0], state.players[1]];
  players[p] = { ...players[p], ...patch };
  return { ...state, players };
};

/** Separa da mão as cartas pedidas (por id). null se houver id repetido ou que não está na mão. */
function pickFromHand(hand: readonly Card[], ids: readonly number[]): { picked: Card[]; rest: Card[] } | null {
  if (new Set(ids).size !== ids.length) return null;
  const picked = ids.map((id) => hand.find((c) => c.id === id));
  if (picked.some((c) => !c)) return null;
  const set = new Set(ids);
  return { picked: picked as Card[], rest: hand.filter((c) => !set.has(c.id)) };
}

function finishRound(state: GameState, wentOut: PlayerIndex | null): GameState {
  const scoreOf = (p: PlayerIndex): RoundScore =>
    scoreRound(state.players[p].melds, state.players[p].hand, wentOut === p);
  const scores: [RoundScore, RoundScore] = [scoreOf(0), scoreOf(1)];
  const matchScore: [number, number] = [state.matchScore[0] + scores[0].total, state.matchScore[1] + scores[1].total];
  return { ...state, phase: 'over', matchScore, result: { wentOut, scores } };
}

/**
 * Chamado após qualquer ação que pode ter esvaziado a mão.
 * - Mão vazia e morto ainda não pego → pega o morto e continua.
 * - Mão vazia com morto já pego → bate (exige canastra; sem ela a ação é recusada).
 */
function settleHand(state: GameState, p: PlayerIndex, melding = false): Result {
  const me = state.players[p];
  // Sem canastra e com o morto já pego, sobrar 1 carta é beco sem saída (não pode descartá-la nem bater).
  if (melding && me.hand.length === 1 && me.tookDead && !hasCanasta(me.melds))
    return fail('Sem canastra, não deixe só uma carta na mão: você não poderia descartá-la nem bater.');
  if (me.hand.length > 0) return ok(state);
  if (!me.tookDead && me.dead) return ok(withPlayer(state, p, { hand: me.dead, dead: null, tookDead: true }));
  if (!hasCanasta(me.melds)) return fail('Para bater é preciso ter ao menos uma canastra.');
  return ok(finishRound(state, p));
}

const guard = (state: GameState, phase: Phase): string | null =>
  state.phase === 'over' ? 'A rodada terminou.' : state.phase !== phase ? (phase === 'draw' ? 'Você já comprou nesta jogada.' : 'Compre antes de jogar.') : null;

// ---------------------------------------------------------------- ações

/** Compra uma carta do monte. Com o monte vazio a rodada termina (sem batedor). */
export function drawFromStock(state: GameState): Result {
  const err = guard(state, 'draw');
  if (err) return fail(err);
  const [card, ...rest] = state.stock;
  if (!card) return ok(finishRound(state, null));
  const p = state.current;
  const next = withPlayer({ ...state, stock: rest, phase: 'play' }, p, { hand: [...state.players[p].hand, card] });
  return ok(next);
}

/** Pega a pilha inteira do descarte para a mão. */
export function takeDiscardPile(state: GameState): Result {
  const err = guard(state, 'draw');
  if (err) return fail(err);
  if (state.discard.length === 0) return fail('O descarte está vazio.');
  const p = state.current;
  return ok(withPlayer({ ...state, discard: [], phase: 'play' }, p, { hand: [...state.players[p].hand, ...state.discard] }));
}

/** Baixa um jogo novo (3+ cartas da mão que formem sequência do mesmo naipe). */
export function playMeld(state: GameState, ids: readonly number[], prefer: 'low' | 'high' = 'low'): Result {
  const err = guard(state, 'play');
  if (err) return fail(err);
  const p = state.current;
  const split = pickFromHand(state.players[p].hand, ids);
  if (!split) return fail('Cartas inválidas.');
  const arr = arrangeSequence(split.picked, prefer);
  if (!arr) return fail('Isso não é uma sequência válida (3+ cartas do mesmo naipe, no máximo um curinga).');
  const meld: Meld = { id: state.nextMeldId, ...arr };
  const next = withPlayer({ ...state, nextMeldId: state.nextMeldId + 1 }, p, {
    hand: split.rest,
    melds: [...state.players[p].melds, meld],
  });
  return settleHand(next, p, true);
}

/** Acrescenta cartas da mão a um jogo da PRÓPRIA mesa; o resultado precisa continuar sendo uma sequência válida. */
export function addToMeld(state: GameState, meldId: number, ids: readonly number[], prefer: 'low' | 'high' = 'low'): Result {
  const err = guard(state, 'play');
  if (err) return fail(err);
  const p = state.current;
  const me = state.players[p];
  const meld = me.melds.find((m) => m.id === meldId);
  if (!meld) return fail('Jogo não encontrado na sua mesa.');
  const split = pickFromHand(me.hand, ids);
  if (!split || ids.length === 0) return fail('Cartas inválidas.');
  const arr = arrangeSequence([...meld.cards, ...split.picked], prefer);
  if (!arr || arr.suit !== meld.suit) return fail('Essas cartas não cabem nesse jogo.');
  const updated: Meld = { id: meld.id, ...arr };
  const next = withPlayer(state, p, {
    hand: split.rest,
    melds: me.melds.map((m) => (m.id === meldId ? updated : m)),
  });
  return settleHand(next, p, true);
}

/** Descarta uma carta e passa a vez. Se for a última da mão: pega o morto (e a vez passa) ou bate. */
export function discardCard(state: GameState, cardId: number): Result {
  const err = guard(state, 'play');
  if (err) return fail(err);
  const p = state.current;
  const split = pickFromHand(state.players[p].hand, [cardId]);
  if (!split) return fail('Carta inválida.');
  const discarded = split.picked[0]!;
  const next = withPlayer({ ...state, discard: [...state.discard, discarded] }, p, { hand: split.rest });
  const settled = settleHand(next, p);
  if (!settled.ok || settled.state.phase === 'over') return settled;
  return ok({ ...settled.state, current: other(p), phase: 'draw' });
}
