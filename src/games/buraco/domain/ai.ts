import { cardPoints, isWildcard, type Card } from './cards';
import {
  addToMeld,
  discardCard,
  drawFromStock,
  playMeld,
  takeDiscardPile,
  type GameState,
  type PlayerIndex,
  type Result,
} from './game';
import { arrangeSequence, CANASTA_SIZE, MAX_MELD, MIN_MELD, wildCount, type Meld } from './meld';

/**
 * IA simples e determinística (sem RNG): compra o descarte só se formar jogo, baixa jogos cedo,
 * acrescenta nos jogos que já tem e descarta a carta menos útil.
 * Fica em funções puras sobre `GameState` e usa as MESMAS ações da interface (se a IA tentar algo ilegal,
 * a regra recusa), então não há um "segundo conjunto de regras" para a IA.
 */

const rankAt = (position: number): number => (position === 14 ? 1 : position);

/** Conjuntos de cartas da mão que formam um jogo novo: naturais em sequência, com no máximo um curinga tapando buraco. */
export function candidateMelds(hand: readonly Card[]): Card[][] {
  const wilds = hand.filter(isWildcard);
  const found: { cards: Card[]; wilds: number }[] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const bySlot = new Map<number, Card>();
    for (const c of hand) if (c.suit === suit && !isWildcard(c)) bySlot.set(c.rank, c);
    for (let start = 1; start <= MAX_MELD - MIN_MELD + 1; start++) {
      for (let end = start + MIN_MELD - 1; end <= MAX_MELD; end++) {
        const slots = Array.from({ length: end - start + 1 }, (_, i) => bySlot.get(rankAt(start + i)));
        const missing = slots.filter((s) => !s).length;
        if (missing > 1 || (missing === 1 && wilds.length === 0)) continue;
        const cards = slots.filter((s): s is Card => !!s);
        if (new Set(cards.map((c) => c.id)).size !== cards.length) continue; // Ás usado nas duas pontas
        if (missing === 1) cards.push(wilds[0]!);
        if (arrangeSequence(cards)) found.push({ cards, wilds: missing });
      }
    }
  }
  // Melhor primeiro: sem curinga, depois o maior.
  return found.sort((a, b) => a.wilds - b.wilds || b.cards.length - a.cards.length).map((f) => f.cards);
}

/** Primeira carta da mão que cabe num jogo da mesa; naturais vêm antes de curingas para não gastar curinga à toa. */
function findAddition(hand: readonly Card[], melds: readonly Meld[]): { meld: Meld; card: Card } | null {
  const ordered = [...hand].sort((a, b) => Number(isWildcard(a)) - Number(isWildcard(b)));
  for (const card of ordered) {
    for (const meld of melds) {
      const arr = arrangeSequence([...meld.cards, card]);
      if (!arr || arr.suit !== meld.suit) continue;
      // Gastar curinga só vale para fechar canastra (6 → 7 cartas); senão ele é guardado.
      if (wildCount(arr) > wildCount(meld) && meld.cards.length < CANASTA_SIZE - 1) continue;
      return { meld, card };
    }
  }
  return null;
}

/** Quanto menor, mais descartável. Curingas e cartas que combinam com a mão/mesa são guardados. */
function usefulness(card: Card, hand: readonly Card[], melds: readonly Meld[]): number {
  if (isWildcard(card)) return 100;
  let score = 0;
  if (melds.some((m) => arrangeSequence([...m.cards, card])?.suit === m.suit)) score += 50;
  for (const other of hand) {
    if (other.id === card.id || other.suit !== card.suit || isWildcard(other)) continue;
    const gap = Math.min(Math.abs(other.rank - card.rank), 13 - Math.abs(other.rank - card.rank));
    if (gap === 0) score -= 3; // repetida: uma delas sobra
    else if (gap === 1) score += 10;
    else if (gap === 2) score += 5;
  }
  return score - cardPoints(card) / 10; // empate: descarta a de maior valor (menos pontos presos na mão)
}

const leastUseful = (state: GameState, p: PlayerIndex): Card[] => {
  const { hand, melds } = state.players[p];
  return [...hand].sort((a, b) => usefulness(a, hand, melds) - usefulness(b, hand, melds));
};

/** O descarte vale a pena se a carta do topo formar jogo novo com a mão ou couber num jogo já baixado. */
function pileHelps(state: GameState, p: PlayerIndex): boolean {
  const top = state.discard[state.discard.length - 1];
  if (!top) return false;
  const { hand, melds } = state.players[p];
  if (findAddition([top], melds)) return true;
  return candidateMelds([...hand, top]).some((m) => m.some((c) => c.id === top.id));
}

/** Uma única ação da IA (a interface pode animar passo a passo). Devolve o resultado da regra. */
export function aiStep(state: GameState): Result {
  const p = state.current;
  if (state.phase === 'draw') return pileHelps(state, p) ? takeDiscardPile(state) : drawFromStock(state);

  const { hand, melds } = state.players[p];
  const add = findAddition(hand, melds);
  if (add) {
    const r = addToMeld(state, add.meld.id, [add.card.id]);
    if (r.ok) return r;
  }
  for (const cards of candidateMelds(hand)) {
    const r = playMeld(state, cards.map((c) => c.id));
    if (r.ok) return r;
  }
  // Descarte: a regra pode recusar o último card sem canastra; nesse caso tenta a próxima.
  let last: Result = { ok: false, error: 'Sem carta para descartar.' };
  for (const card of leastUseful(state, p)) {
    last = discardCard(state, card.id);
    if (last.ok) return last;
  }
  return last;
}

/** Joga o turno inteiro (compra → jogos → descarte). Para quando a vez passa ou a rodada acaba. */
export function playAiTurn(state: GameState): GameState {
  const turn = state.current;
  let s = state;
  for (let guard = 0; guard < 60 && s.phase !== 'over' && s.current === turn; guard++) {
    const r = aiStep(s);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}
