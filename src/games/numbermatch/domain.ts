import { randInt, type Rng } from '../../core/ui';

export const COLS = 9;
export const MAX_ADDS = 5;
const START_CELLS = 27;

/**
 * Tabuleiro do Number Match (imutável). `cells` guarda os dígitos em ordem de leitura, 9 por linha
 * (0 = casa vazia). Linhas totalmente vazias são removidas, então tabuleiro sem casas = vitória.
 */
export interface MatchBoard {
  cells: number[];
  addsLeft: number;
  selected: number | null;
}

export const isWon = (b: MatchBoard): boolean => b.cells.length === 0;
export const remaining = (b: MatchBoard): number => b.cells.filter((v) => v !== 0).length;
/** Sem pares possíveis e sem rodadas extras: partida sem saída. */
export const isStuck = (b: MatchBoard): boolean => !isWon(b) && b.addsLeft === 0 && findPair(b) === null;

const column = (i: number): number => i % COLS;

function clearBetween(cells: readonly number[], lo: number, hi: number, step: number): boolean {
  for (let i = lo + step; i < hi; i += step) if (cells[i] !== 0) return false;
  return true;
}

/**
 * Duas casas formam par se tiverem o mesmo número ou somarem 10 e se "enxergarem": em sequência de leitura
 * (mesma linha ou fim de uma linha com o começo da seguinte), mesma coluna ou mesma diagonal,
 * sempre com apenas casas vazias entre elas.
 */
export function canPair(b: MatchBoard, a: number, c: number): boolean {
  if (a === c) return false;
  const x = b.cells[a];
  const y = b.cells[c];
  if (x === undefined || y === undefined || x === 0 || y === 0) return false;
  if (x !== y && x + y !== 10) return false;
  const lo = Math.min(a, c);
  const hi = Math.max(a, c);
  const d = hi - lo;
  return (
    clearBetween(b.cells, lo, hi, 1) ||
    (d % COLS === 0 && clearBetween(b.cells, lo, hi, COLS)) ||
    (d % (COLS + 1) === 0 && column(hi) - column(lo) === d / (COLS + 1) && clearBetween(b.cells, lo, hi, COLS + 1)) ||
    (d % (COLS - 1) === 0 && column(lo) - column(hi) === d / (COLS - 1) && clearBetween(b.cells, lo, hi, COLS - 1))
  );
}

/** Primeiro par disponível (dica e detecção de partida sem saída). */
export function findPair(b: MatchBoard): [number, number] | null {
  for (let a = 0; a < b.cells.length; a++) {
    if (b.cells[a] === 0) continue;
    for (let c = a + 1; c < b.cells.length; c++) if (canPair(b, a, c)) return [a, c];
  }
  return null;
}

export function dropEmptyRows(cells: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < cells.length; i += COLS) {
    const row = cells.slice(i, i + COLS);
    if (row.some((v) => v !== 0)) out.push(...row);
  }
  return out;
}

/** Toca numa casa: seleciona, desfaz a seleção, remove o par ou troca a seleção se não formar par. */
export function select(b: MatchBoard, index: number): MatchBoard {
  if ((b.cells[index] ?? 0) === 0) return b;
  const first = b.selected;
  if (first === null) return { ...b, selected: index };
  if (first === index) return { ...b, selected: null };
  if (!canPair(b, first, index)) return { ...b, selected: index };
  const next = [...b.cells];
  next[first] = 0;
  next[index] = 0;
  return { ...b, cells: dropEmptyRows(next), selected: null };
}

/** Copia os números que sobraram para o fim do tabuleiro. Null se não há rodadas ou números. */
export function addNumbers(b: MatchBoard): MatchBoard | null {
  if (b.addsLeft === 0) return null;
  const tail = b.cells.filter((v) => v !== 0);
  if (tail.length === 0) return null;
  const pad = (len: number): number[] => new Array<number>((COLS - (len % COLS)) % COLS).fill(0);
  let end = b.cells.length;
  while (end > 0 && b.cells[end - 1] === 0) end--;
  const base = b.cells.slice(0, end);
  // base pode terminar no meio de uma linha: completa a linha antes de começar a cópia
  return { cells: [...base, ...pad(base.length), ...tail, ...pad(tail.length)], addsLeft: b.addsLeft - 1, selected: null };
}

export const startMatch = (rng: Rng = Math.random): MatchBoard => ({
  cells: Array.from({ length: START_CELLS }, () => 1 + randInt(9, rng)),
  addsLeft: MAX_ADDS,
  selected: null,
});

export function parseSaved(raw: unknown): MatchBoard | null {
  const r = raw as Partial<MatchBoard> | null;
  if (!r || !Array.isArray(r.cells) || r.cells.length % COLS !== 0 || r.cells.length > 2000) return null;
  if (!r.cells.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)) return null;
  const adds = Number(r.addsLeft);
  if (!Number.isInteger(adds) || adds < 0 || adds > MAX_ADDS) return null;
  return { cells: r.cells, addsLeft: adds, selected: null };
}
