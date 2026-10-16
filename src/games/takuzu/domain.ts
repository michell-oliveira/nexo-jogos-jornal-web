import { randInt, shuffled, type Rng } from '../../core/ui';

export const EMPTY = -1;

export type TakuzuLevelId = 'easy' | 'medium' | 'hard';

/** `minGivens`: o gerador para de esconder células ao chegar nesse número (ou antes, se a solução deixar de ser única). */
export const LEVELS: Record<TakuzuLevelId, { label: string; size: number; minGivens: number }> = {
  easy: { label: 'Fácil', size: 6, minGivens: 16 },
  medium: { label: 'Médio', size: 8, minGivens: 30 },
  hard: { label: 'Difícil', size: 8, minGivens: 22 },
};

/**
 * Regras: nunca três iguais seguidos; cada linha/coluna tem n/2 zeros e n/2 uns; sem linhas nem colunas iguais.
 * Grade n×n em linha única; EMPTY marca vazio, 0 e 1 são os valores.
 */
const line = (n: number, isRow: boolean, k: number): number[] =>
  Array.from({ length: n }, (_, i) => (isRow ? k * n + i : i * n + k));
const countOf = (g: readonly number[], ln: readonly number[], v: number): number => ln.filter((i) => g[i] === v).length;
const complete = (g: readonly number[], ln: readonly number[]): boolean => ln.every((i) => g[i] !== EMPTY);
const same = (g: readonly number[], a: readonly number[], b: readonly number[]): boolean => a.every((ai, k) => g[ai] === g[b[k]!]);

/** Índices das células que violam alguma regra no estado atual (parcial ou completo). */
export function conflicts(cells: readonly number[], n: number): Set<number> {
  const bad = new Set<number>();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const v = cells[i]!;
      if (v === EMPTY) continue;
      if (c + 2 < n && cells[i + 1] === v && cells[i + 2] === v) [i, i + 1, i + 2].forEach((x) => bad.add(x));
      if (r + 2 < n && cells[i + n] === v && cells[i + 2 * n] === v) [i, i + n, i + 2 * n].forEach((x) => bad.add(x));
    }
  }
  for (const isRow of [true, false]) {
    for (let a = 0; a < n; a++) {
      const la = line(n, isRow, a);
      if (countOf(cells, la, 0) > n / 2 || countOf(cells, la, 1) > n / 2) la.forEach((x) => bad.add(x));
      for (let b = a + 1; b < n; b++) {
        const lb = line(n, isRow, b);
        if (complete(cells, la) && complete(cells, lb) && same(cells, la, lb)) {
          la.forEach((x) => bad.add(x));
          lb.forEach((x) => bad.add(x));
        }
      }
    }
  }
  return bad;
}

/** Confere só o que a célula `i` (recém-preenchida) pode ter quebrado. */
function canPlace(g: number[], n: number, i: number): boolean {
  const r = Math.floor(i / n);
  const c = i % n;
  const v = g[i]!;
  for (let s = c - 2; s <= c; s++) {
    if (s >= 0 && s + 2 < n && g[r * n + s] === v && g[r * n + s + 1] === v && g[r * n + s + 2] === v) return false;
  }
  for (let s = r - 2; s <= r; s++) {
    if (s >= 0 && s + 2 < n && g[s * n + c] === v && g[(s + 1) * n + c] === v && g[(s + 2) * n + c] === v) return false;
  }
  const row = line(n, true, r);
  const col = line(n, false, c);
  if (countOf(g, row, v) > n / 2 || countOf(g, col, v) > n / 2) return false;
  if (complete(g, row) && Array.from({ length: n }, (_, k) => k).some((k) => k !== r && complete(g, line(n, true, k)) && same(g, row, line(n, true, k)))) return false;
  if (complete(g, col) && Array.from({ length: n }, (_, k) => k).some((k) => k !== c && complete(g, line(n, false, k)) && same(g, col, line(n, false, k)))) return false;
  return true;
}

function fill(g: number[], n: number, rng: Rng): boolean {
  const i = g.indexOf(EMPTY);
  if (i < 0) return true;
  const order = randInt(2, rng) === 0 ? [0, 1] : [1, 0];
  for (const v of order) {
    g[i] = v;
    if (canPlace(g, n, i) && fill(g, n, rng)) return true;
  }
  g[i] = EMPTY;
  return false;
}

function countSol(g: number[], n: number, limit: number): number {
  const i = g.indexOf(EMPTY);
  if (i < 0) return 1;
  let total = 0;
  for (let v = 0; v <= 1; v++) {
    g[i] = v;
    if (canPlace(g, n, i)) total += countSol(g, n, limit - total);
    g[i] = EMPTY;
    if (total >= limit) break;
  }
  return total;
}

/** Quantas soluções a grade tem, contando até `limit` (basta 2 para saber se é única). */
export const countSolutions = (cells: readonly number[], n: number, limit = 2): number => countSol([...cells], n, limit);

/** Grade completa válida e aleatória; `n` par. */
export function randomSolution(n: number, rng: Rng): number[] {
  const g = new Array<number>(n * n).fill(EMPTY);
  if (!fill(g, n, rng)) throw new Error(`Sem solução para n=${n}`);
  return g;
}

/** Partida de Takuzu (imutável): `given` são as células fixas; `history` guarda (índice, valor anterior) para desfazer. */
export interface TakuzuState {
  level: TakuzuLevelId;
  solution: number[];
  given: number[];
  cells: number[];
  history: [number, number][];
}

const MAX_HISTORY = 200;
export const sizeOf = (s: TakuzuState): number => LEVELS[s.level].size;
export const isSolved = (s: TakuzuState): boolean => s.cells.every((v, i) => v === s.solution[i]);
export const toFill = (s: TakuzuState): number => s.cells.length - s.given.length;
export const filled = (s: TakuzuState): number => s.cells.filter((v, i) => !s.given.includes(i) && v !== EMPTY).length;
export const conflictsOf = (s: TakuzuState): Set<number> => conflicts(s.cells, sizeOf(s));

export function startTakuzu(level: TakuzuLevelId, rng: Rng = Math.random): TakuzuState {
  const { size: n, minGivens } = LEVELS[level];
  const solution = randomSolution(n, rng);
  const puzzle = [...solution];
  let givens = n * n;
  for (const index of shuffled(puzzle.map((_, i) => i), rng)) {
    if (givens <= minGivens) break;
    const value = puzzle[index]!;
    puzzle[index] = EMPTY;
    if (countSolutions(puzzle, n) === 1) givens--;
    else puzzle[index] = value;
  }
  const given = puzzle.flatMap((v, i) => (v !== EMPTY ? [i] : []));
  return { level, solution, given, cells: puzzle, history: [] };
}

function set(s: TakuzuState, index: number, value: number): TakuzuState {
  const cells = [...s.cells];
  cells[index] = value;
  return { ...s, cells, history: [...s.history, [index, s.cells[index]!] as [number, number]].slice(-MAX_HISTORY) };
}

/** Toque na célula: vazio, 0, 1, vazio. Células fixas não mudam. */
export function tap(s: TakuzuState, index: number): TakuzuState {
  if (index < 0 || index >= s.cells.length || s.given.includes(index)) return s;
  const cur = s.cells[index]!;
  return set(s, index, cur === 1 ? EMPTY : cur + 1);
}

export function undo(s: TakuzuState): TakuzuState {
  const last = s.history[s.history.length - 1];
  if (!last) return s;
  const cells = [...s.cells];
  cells[last[0]] = last[1];
  return { ...s, cells, history: s.history.slice(0, -1) };
}

/** Preenche com o valor certo uma célula errada ou vazia. Sem nada a corrigir, devolve o mesmo estado. */
export function hint(s: TakuzuState, rng: Rng = Math.random): TakuzuState {
  const candidates = s.cells.flatMap((v, i) => (!s.given.includes(i) && v !== s.solution[i] ? [i] : []));
  if (candidates.length === 0) return s;
  const index = candidates[randInt(candidates.length, rng)]!;
  return set(s, index, s.solution[index]!);
}

/** Valida o que veio do localStorage: nunca confiar em dado salvo. */
export function parseSaved(raw: unknown): TakuzuState | null {
  const r = raw as Partial<TakuzuState> | null;
  if (!r || !(r.level! in LEVELS)) return null;
  const n = LEVELS[r.level!].size;
  const total = n * n;
  const bin = (a: unknown, allowEmpty: boolean): a is number[] =>
    Array.isArray(a) && a.length === total && a.every((v) => v === 0 || v === 1 || (allowEmpty && v === EMPTY));
  if (!bin(r.solution, false) || !bin(r.cells, true)) return null;
  if (conflicts(r.solution, n).size > 0) return null;
  const given = r.given;
  if (!Array.isArray(given) || given.some((i) => !Number.isInteger(i) || i < 0 || i >= total) || new Set(given).size !== given.length) return null;
  if (!given.every((i) => r.cells![i] === r.solution![i])) return null;
  return { level: r.level!, solution: r.solution, given, cells: r.cells, history: [] };
}
