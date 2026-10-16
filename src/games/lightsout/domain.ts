import { randInt, shuffled, type Rng } from '../../core/ui';

export const SIZE = 5;
export const CELLS = SIZE * SIZE;

export type LightsLevelId = 'easy' | 'medium' | 'hard';

/** `scramble`: quantos toques aleatórios embaralham o tabuleiro apagado (então sempre tem solução). */
export const LEVELS: Record<LightsLevelId, { label: string; scramble: number }> = {
  easy: { label: 'Fácil', scramble: 4 },
  medium: { label: 'Médio', scramble: 8 },
  hard: { label: 'Difícil', scramble: 14 },
};

/**
 * Partida de Lights Out 5x5. Tocar numa célula inverte ela e as 4 vizinhas.
 * `need` são as células que ainda precisam de um toque para resolver (tocar duas vezes desfaz): base da dica.
 */
export interface LightsState {
  level: LightsLevelId;
  lit: boolean[];
  need: number[];
  moves: number;
}

export const litCount = (s: LightsState): number => s.lit.filter(Boolean).length;
export const isSolved = (s: LightsState): boolean => litCount(s) === 0;

/** Inverte a célula e as vizinhas (cima, baixo, esquerda, direita). */
export function flip(lit: readonly boolean[], index: number): boolean[] {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const affected = [index];
  if (row > 0) affected.push(index - SIZE);
  if (row < SIZE - 1) affected.push(index + SIZE);
  if (col > 0) affected.push(index - 1);
  if (col < SIZE - 1) affected.push(index + 1);
  const next = [...lit];
  for (const i of affected) next[i] = !next[i];
  return next;
}

const toggled = (set: readonly number[], index: number): number[] =>
  set.includes(index) ? set.filter((i) => i !== index) : [...set, index];

export function startLights(level: LightsLevelId, rng: Rng = Math.random): LightsState {
  let state: LightsState = { level, lit: new Array<boolean>(CELLS).fill(false), need: [], moves: 0 };
  const order = shuffled(Array.from({ length: CELLS }, (_, i) => i), rng).slice(0, LEVELS[level].scramble);
  for (const i of order) state = { ...state, lit: flip(state.lit, i), need: toggled(state.need, i) };
  return { ...state, moves: 0 };
}

export function tap(s: LightsState, index: number): LightsState {
  if (index < 0 || index >= CELLS || isSolved(s)) return s;
  return { ...s, lit: flip(s.lit, index), need: toggled(s.need, index), moves: s.moves + 1 };
}

/** Uma célula que ainda precisa de toque, ou null se não há nada a indicar. */
export function hint(s: LightsState, rng: Rng = Math.random): number | null {
  return s.need.length > 0 && !isSolved(s) ? s.need[randInt(s.need.length, rng)]! : null;
}
