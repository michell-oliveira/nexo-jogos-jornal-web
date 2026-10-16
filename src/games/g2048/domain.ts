import { randInt, type Rng } from '../../core/ui';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const WIN_VALUE = 2048;

/** Tabuleiro 4x4 imutável: cada jogada devolve um novo. `cells` em ordem de linha (0 = vazia). */
export interface Board {
  cells: number[];
  score: number;
  won: boolean;
  /** Casa da peça nova (transitória, só para animar). */
  spawned: number;
}

/** Índices de uma linha/coluna, do lado de destino do movimento para o lado oposto. */
export function lineIndexes(direction: Direction, line: number): number[] {
  const r = Array.from({ length: SIZE }, (_, i) => i);
  switch (direction) {
    case 'left': return r.map((i) => line * SIZE + i);
    case 'right': return r.reverse().map((i) => line * SIZE + i);
    case 'up': return r.map((i) => i * SIZE + line);
    case 'down': return r.reverse().map((i) => i * SIZE + line);
  }
}

/** Compacta para o início e funde pares iguais adjacentes (cada peça funde uma vez só). */
export function mergeLine(line: number[]): { values: number[]; gained: number } {
  const source = line.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < source.length; i++) {
    const v = source[i]!;
    if (i + 1 < source.length && source[i + 1] === v) {
      out.push(v * 2);
      gained += v * 2;
      i++;
    } else out.push(v);
  }
  while (out.length < SIZE) out.push(0);
  return { values: out, gained };
}

function slide(b: Board, direction: Direction): Board | null {
  const next = [...b.cells];
  let gained = 0;
  let won = b.won;
  for (let line = 0; line < SIZE; line++) {
    const idx = lineIndexes(direction, line);
    const merged = mergeLine(idx.map((i) => b.cells[i]!));
    gained += merged.gained;
    idx.forEach((cell, i) => (next[cell] = merged.values[i]!));
    if (merged.values.some((v) => v >= WIN_VALUE)) won = true;
  }
  if (next.every((v, i) => v === b.cells[i])) return null;
  return { cells: next, score: b.score + gained, won, spawned: -1 };
}

function spawn(b: Board, rng: Rng): Board {
  const empty = b.cells.flatMap((v, i) => (v === 0 ? [i] : []));
  if (empty.length === 0) return b;
  const at = empty[randInt(empty.length, rng)]!;
  const cells = [...b.cells];
  cells[at] = randInt(10, rng) === 0 ? 4 : 2;
  return { ...b, cells, spawned: at };
}

export const startBoard = (rng: Rng = Math.random): Board =>
  spawn(spawn({ cells: new Array<number>(CELLS).fill(0), score: 0, won: false, spawned: -1 }, rng), rng);

/** Desliza; devolve null se nada mudou (não gasta turno), senão o tabuleiro com uma peça nova (2 em 90%, 4 em 10%). */
export function move(b: Board, direction: Direction, rng: Rng = Math.random): Board | null {
  const slid = slide(b, direction);
  return slid && spawn(slid, rng);
}

export const isGameOver = (b: Board): boolean =>
  b.cells.every((v) => v !== 0) && (['up', 'down', 'left', 'right'] as const).every((d) => slide(b, d) === null);
