import { HUMAN, type GameState, type PlayerIndex } from './domain/game';

/** O que mudou para um jogador entre dois estados: base das animações de voo (sem DOM). */
export interface Moves {
  /** Cartas que entraram na mão pela compra; `pile` = pegou o descarte inteiro. */
  drawn: { ids: number[]; source: 'stock' | 'pile' } | null;
  /** Cartas que passaram da mão para jogos da mesa (baixar ou acrescentar). */
  melded: number[];
  /** Carta descartada na jogada, se houve. */
  discarded: number | null;
}

const meldIds = (s: GameState, who: PlayerIndex): Set<number> =>
  new Set(s.players[who].melds.flatMap((m) => m.cards.map((c) => c.id)));

export function planMoves(prev: GameState, next: GameState, who: PlayerIndex): Moves {
  const had = new Set(prev.players[who].hand.map((c) => c.id));
  let drawn: Moves['drawn'] = null;
  if (prev.phase === 'draw' && next.phase === 'play') {
    const ids = next.players[who].hand.filter((c) => !had.has(c.id)).map((c) => c.id);
    if (ids.length > 0) drawn = { ids, source: prev.discard.length > 0 && next.discard.length === 0 ? 'pile' : 'stock' };
  }
  const before = meldIds(prev, who);
  const melded = [...meldIds(next, who)].filter((id) => !before.has(id));
  const discarded = prev.phase === 'play' && next.discard.length > prev.discard.length ? next.discard[next.discard.length - 1]!.id : null;
  return { drawn, melded, discarded };
}

/**
 * Assinatura do que é VISÍVEL da minha área (só as cartas da mão e da mesa, não de quem é a vez). Se não mudou, a tela da minha mão não é refeita:
 * as jogadas do computador não mexem nela (perderiam seleção, leque e arrastar).
 */
export function mineKey(s: GameState): string {
  const me = s.players[HUMAN];
  return JSON.stringify([s.round, me.hand.map((c) => c.id), me.melds.map((m) => [m.id, m.cards.map((c) => c.id)])]);
}
