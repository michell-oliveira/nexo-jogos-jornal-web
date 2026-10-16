export type Rng = () => number;

const ALL_DIGITS = 0x3fe; // bits 1..9
const NO_EMPTY = -1;
const DEAD_END = -2;

export const boxOf = (i: number): number => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

const bitCount = (n: number): number => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Solver por backtracking com bitmasks e heurística MRV. Opera in-place sobre `grid` (81 células, 0 = vazio). */
export class Solver {
  private rows = new Array<number>(9).fill(0);
  private cols = new Array<number>(9).fill(0);
  private boxes = new Array<number>(9).fill(0);

  constructor(private grid: number[]) {
    if (grid.length !== 81) throw new Error('grid deve ter 81 células');
    grid.forEach((v, i) => v !== 0 && this.mark(i, v));
  }

  /** Conta soluções até `limit`; o grid é restaurado ao final. */
  countSolutions(limit = 2): number {
    const cell = this.pickCell();
    if (cell === NO_EMPTY) return 1;
    if (cell === DEAD_END) return 0;
    let total = 0;
    for (const v of this.digitsOf(this.candidates(cell))) {
      this.place(cell, v);
      total += this.countSolutions(limit - total);
      this.clear(cell, v);
      if (total >= limit) break;
    }
    return total;
  }

  /** Preenche o grid com uma solução aleatória. Retorna false se inviável. */
  fillRandom(rng: Rng): boolean {
    const cell = this.pickCell();
    if (cell === NO_EMPTY) return true;
    if (cell === DEAD_END) return false;
    for (const v of shuffle(this.digitsOf(this.candidates(cell)), rng)) {
      this.place(cell, v);
      if (this.fillRandom(rng)) return true;
      this.clear(cell, v);
    }
    return false;
  }

  /** Célula vazia com menos candidatos; NO_EMPTY se completo; DEAD_END se alguma célula não tem candidato. */
  private pickCell(): number {
    let best = NO_EMPTY;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (this.grid[i] !== 0) continue;
      const c = bitCount(this.candidates(i));
      if (c === 0) return DEAD_END;
      if (c < bestCount) {
        best = i;
        bestCount = c;
        if (c === 1) break;
      }
    }
    return best;
  }

  private candidates(i: number): number {
    return ~(this.rows[Math.floor(i / 9)]! | this.cols[i % 9]! | this.boxes[boxOf(i)]!) & ALL_DIGITS;
  }

  private digitsOf(mask: number): number[] {
    const out: number[] = [];
    for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
    return out;
  }

  private place(i: number, v: number): void {
    this.grid[i] = v;
    this.mark(i, v);
  }

  private clear(i: number, v: number): void {
    this.grid[i] = 0;
    const keep = ~(1 << v);
    this.rows[Math.floor(i / 9)]! &= keep;
    this.cols[i % 9]! &= keep;
    this.boxes[boxOf(i)]! &= keep;
  }

  private mark(i: number, v: number): void {
    const bit = 1 << v;
    this.rows[Math.floor(i / 9)]! |= bit;
    this.cols[i % 9]! |= bit;
    this.boxes[boxOf(i)]! |= bit;
  }
}

/** Máscara (bits 1..9) dos dígitos ainda possíveis na célula `i`, dado o estado atual de `values`. */
export function candidateMask(values: readonly number[], i: number): number {
  let used = 0;
  const r = Math.floor(i / 9);
  const c = i % 9;
  const b = boxOf(i);
  for (let j = 0; j < 81; j++) {
    if (j === i) continue;
    if (Math.floor(j / 9) === r || j % 9 === c || boxOf(j) === b) used |= 1 << (values[j] ?? 0);
  }
  return ~used & ALL_DIGITS;
}
