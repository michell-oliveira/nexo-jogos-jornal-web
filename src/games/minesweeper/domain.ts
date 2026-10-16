import { shuffled, type Rng } from '../../core/ui';

export type MinesLevelId = 'easy' | 'medium' | 'hard';

export const LEVELS: Record<MinesLevelId, { label: string; rows: number; cols: number; mines: number }> = {
  easy: { label: 'Fácil', rows: 8, cols: 8, mines: 8 },
  medium: { label: 'Médio', rows: 9, cols: 9, mines: 13 },
  hard: { label: 'Difícil', rows: 10, cols: 10, mines: 20 },
};

export type MinesStatus = 'playing' | 'won' | 'lost';

/**
 * Partida de Campo Minado. As minas só são sorteadas no primeiro toque (`mines` vazio = não começou),
 * garantindo que a casa tocada e as vizinhas sejam seguras. Índices: `linha * colunas + coluna`.
 * Cada operação devolve um novo estado (ou o mesmo objeto, quando nada muda).
 */
export interface MinesState {
  level: MinesLevelId;
  mines: ReadonlySet<number>;
  opened: ReadonlySet<number>;
  flagged: ReadonlySet<number>;
  status: MinesStatus;
  exploded: number | null;
  seconds: number;
}

export const cellsOf = (l: MinesLevelId): number => LEVELS[l].rows * LEVELS[l].cols;
export const started = (s: MinesState): boolean => s.mines.size > 0;
export const minesLeft = (s: MinesState): number => LEVELS[s.level].mines - s.flagged.size;

export const startMines = (level: MinesLevelId): MinesState => ({
  level, mines: new Set(), opened: new Set(), flagged: new Set(), status: 'playing', exploded: null, seconds: 0,
});

export function neighbors(level: MinesLevelId, index: number): number[] {
  const { rows, cols } = LEVELS[level];
  const row = Math.floor(index / cols);
  const col = index % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) out.push(r * cols + c);
    }
  }
  return out;
}

/** Minas nas 8 casas ao redor. */
export const count = (s: MinesState, index: number): number => neighbors(s.level, index).filter((i) => s.mines.has(i)).length;

/** Passa um segundo; só conta com a partida em andamento e já iniciada. */
export const tick = (s: MinesState): MinesState => (s.status === 'playing' && started(s) ? { ...s, seconds: s.seconds + 1 } : s);

export function toggleFlag(s: MinesState, index: number): MinesState {
  if (s.status !== 'playing' || index < 0 || index >= cellsOf(s.level) || s.opened.has(index)) return s;
  const flagged = new Set(s.flagged);
  if (!flagged.delete(index)) flagged.add(index);
  return { ...s, flagged };
}

function placeMines(level: MinesLevelId, safe: number, rng: Rng): Set<number> {
  const banned = new Set([safe, ...neighbors(level, safe)]);
  const free = Array.from({ length: cellsOf(level) }, (_, i) => i).filter((i) => !banned.has(i));
  return new Set(shuffled(free, rng).slice(0, LEVELS[level].mines));
}

function flood(s: MinesState, start: number, already: ReadonlySet<number>): Set<number> {
  const result = new Set(already);
  const stack = [start];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    if (result.has(cell) || s.flagged.has(cell)) continue;
    result.add(cell);
    if (count(s, cell) === 0) for (const n of neighbors(s.level, cell)) if (!result.has(n)) stack.push(n);
  }
  return result;
}

function open(s: MinesState, targets: number[]): MinesState {
  let now: ReadonlySet<number> = s.opened;
  for (const target of targets) {
    if (s.mines.has(target)) return { ...s, opened: new Set([...now, target]), status: 'lost', exploded: target };
    now = flood(s, target, now);
  }
  const won = now.size === cellsOf(s.level) - s.mines.size;
  return { ...s, opened: now, flagged: won ? s.mines : s.flagged, status: won ? 'won' : 'playing' };
}

/** Abre a casa (e, se for 0, as vizinhas em cascata). Casa marcada ou já aberta não muda. */
export function reveal(s: MinesState, index: number, rng: Rng = Math.random): MinesState {
  if (s.status !== 'playing' || index < 0 || index >= cellsOf(s.level) || s.flagged.has(index) || s.opened.has(index)) return s;
  const base = started(s) ? s : { ...s, mines: placeMines(s.level, index, rng) };
  return open(base, [index]);
}

/** Toque num número aberto com bandeiras suficientes ao redor: abre as demais vizinhas (explode se uma bandeira estiver errada). */
export function chord(s: MinesState, index: number): MinesState {
  if (s.status !== 'playing' || !s.opened.has(index)) return s;
  const around = neighbors(s.level, index);
  const number = count(s, index);
  if (number === 0 || around.filter((i) => s.flagged.has(i)).length !== number) return s;
  const targets = around.filter((i) => !s.flagged.has(i) && !s.opened.has(i));
  return targets.length === 0 ? s : open(s, targets);
}
