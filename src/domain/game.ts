import { generatePuzzle, type DifficultyId, DIFFICULTIES } from './generator';
import { boxOf, candidateMask, type Rng } from './solver';

export interface Snapshot {
  v: 1;
  difficulty: DifficultyId;
  givens: number[];
  solution: number[];
  values: number[];
  notes: number[];
  elapsed: number;
}

interface Step {
  values: number[];
  notes: number[];
}

const MAX_HISTORY = 500;

const isGrid = (a: unknown, max: number): a is number[] =>
  Array.isArray(a) && a.length === 81 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= max);

/** Estado de uma partida: valores digitados, anotações, desfazer e validação. Sem dependência de DOM. */
export class Game {
  private history: Step[] = [];

  constructor(
    readonly difficulty: DifficultyId,
    readonly givens: readonly number[],
    readonly solution: readonly number[],
    public values: number[] = givens.slice(),
    public notes: number[] = new Array<number>(81).fill(0),
    public elapsed = 0,
  ) {}

  static create(difficulty: DifficultyId, rng?: Rng): Game {
    const p = generatePuzzle(difficulty, rng);
    return new Game(p.difficulty, p.givens, p.solution);
  }

  /** Lê um snapshot salvo; devolve null se estiver corrompido ou de versão desconhecida. */
  static restore(data: unknown): Game | null {
    const s = data as Partial<Snapshot> | null;
    if (!s || s.v !== 1 || !s.difficulty || !(s.difficulty in DIFFICULTIES)) return null;
    if (!isGrid(s.givens, 9) || !isGrid(s.solution, 9) || !isGrid(s.values, 9) || !isGrid(s.notes, 0x3fe)) return null;
    if (typeof s.elapsed !== 'number' || !(s.elapsed >= 0)) return null;
    if (s.givens.some((g, i) => g !== 0 && s.values![i] !== g)) return null;
    return new Game(s.difficulty, s.givens, s.solution, s.values, s.notes, s.elapsed);
  }

  snapshot(): Snapshot {
    return {
      v: 1,
      difficulty: this.difficulty,
      givens: this.givens.slice(),
      solution: this.solution.slice(),
      values: this.values.slice(),
      notes: this.notes.slice(),
      elapsed: this.elapsed,
    };
  }

  isGiven(i: number): boolean {
    return this.givens[i] !== 0;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Coloca `digit` na célula; repetir o mesmo dígito apaga. Falso se a célula for fixa. */
  setValue(i: number, digit: number): boolean {
    if (this.isGiven(i) || digit < 1 || digit > 9) return false;
    this.push();
    if (this.values[i] === digit) {
      this.values[i] = 0;
      return true;
    }
    this.values[i] = digit;
    this.notes[i] = 0;
    this.removeFromPeerNotes(i, digit);
    return true;
  }

  /** Liga/desliga a anotação `digit` numa célula vazia. */
  toggleNote(i: number, digit: number): boolean {
    if (this.isGiven(i) || this.values[i] !== 0 || digit < 1 || digit > 9) return false;
    this.push();
    this.notes[i] = this.notes[i]! ^ (1 << digit);
    return true;
  }

  /** Apaga o valor e as anotações da célula. */
  clear(i: number): boolean {
    if (this.isGiven(i) || (this.values[i] === 0 && this.notes[i] === 0)) return false;
    this.push();
    this.values[i] = 0;
    this.notes[i] = 0;
    return true;
  }

  undo(): boolean {
    const step = this.history.pop();
    if (!step) return false;
    this.values = step.values;
    this.notes = step.notes;
    return true;
  }

  /** Anotações automáticas: dígitos ainda possíveis na célula pelas regras de linha/coluna/bloco. */
  autoNotes(i: number): number {
    return this.values[i] === 0 ? candidateMask(this.values, i) : 0;
  }

  isSolved(): boolean {
    return this.values.every((v, i) => v === this.solution[i]);
  }

  private push(): void {
    this.history.push({ values: this.values.slice(), notes: this.notes.slice() });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  private removeFromPeerNotes(i: number, digit: number): void {
    const clear = ~(1 << digit);
    for (let j = 0; j < 81; j++) {
      if (Math.floor(j / 9) === Math.floor(i / 9) || j % 9 === i % 9 || boxOf(j) === boxOf(i)) {
        this.notes[j]! &= clear;
      }
    }
  }
}
