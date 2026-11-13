import { sumPoints, type Card } from './cards';
import { isCanasta, isCleanCanasta, type Meld } from './meld';

export const CLEAN_CANASTA_BONUS = 200;
export const DIRTY_CANASTA_BONUS = 100;
export const GO_OUT_BONUS = 100;
export const TARGET_SCORE = 3000;

/** Detalhamento da rodada de um jogador (a interface mostra cada parcela). */
export interface RoundScore {
  canastas: number; // bônus de canastras
  melded: number; // valor das cartas baixadas
  goOut: number; // bônus de bater
  handPenalty: number; // valor das cartas que sobraram na mão (positivo; é subtraído)
  total: number;
}

export const canastaBonus = (melds: readonly Meld[]): number =>
  melds.reduce((s, m) => s + (isCleanCanasta(m) ? CLEAN_CANASTA_BONUS : isCanasta(m) ? DIRTY_CANASTA_BONUS : 0), 0);

export const hasCanasta = (melds: readonly Meld[]): boolean => melds.some(isCanasta);

/** canastras + cartas baixadas + bônus de bater − cartas que sobram na mão. */
export function scoreRound(melds: readonly Meld[], hand: readonly Card[], wentOut: boolean): RoundScore {
  const canastas = canastaBonus(melds);
  const melded = melds.reduce((s, m) => s + sumPoints(m.cards), 0);
  const goOut = wentOut ? GO_OUT_BONUS : 0;
  const handPenalty = sumPoints(hand);
  return { canastas, melded, goOut, handPenalty, total: canastas + melded + goOut - handPenalty };
}
