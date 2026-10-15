import { Solver, shuffle, type Rng } from './solver';

export type DifficultyId = 'easy' | 'medium' | 'hard';

/** Dificuldade medida pelo nº alvo de pistas (heurística; sem graduação por técnica) — igual ao app Android. */
export const DIFFICULTIES: Record<DifficultyId, { label: string; targetClues: number }> = {
  easy: { label: 'Fácil', targetClues: 40 },
  medium: { label: 'Médio', targetClues: 32 },
  hard: { label: 'Difícil', targetClues: 26 },
};

export interface Puzzle {
  givens: number[];
  solution: number[];
  difficulty: DifficultyId;
}

/** Gera solução completa aleatória e remove células mantendo solução única. */
export function generatePuzzle(difficulty: DifficultyId, rng: Rng = Math.random): Puzzle {
  const solution = new Array<number>(81).fill(0);
  if (!new Solver(solution).fillRandom(rng)) throw new Error('falha ao gerar grade completa');

  const puzzle = solution.slice();
  let clues = 81;
  const target = DIFFICULTIES[difficulty].targetClues;
  for (const cell of shuffle([...Array(81).keys()], rng)) {
    if (clues <= target) break;
    const saved = puzzle[cell]!;
    puzzle[cell] = 0;
    if (new Solver(puzzle.slice()).countSolutions(2) === 1) clues--;
    else puzzle[cell] = saved;
  }
  return { givens: puzzle, solution, difficulty };
}
