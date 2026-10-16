import { shuffled, type Rng } from '../../core/ui';
import { WORDS } from '../words/bank';
import { isLevelId, wordsOf, type Word, type WordLevelId } from '../words/shared';

export const WORDS_IN_GRID = 5;
export const EMPTY = '.';

/** Dicas de letra e números já revelados ao começar, por nível. */
export const HINTS: Record<WordLevelId, number> = { easy: 3, medium: 2, hard: 1 };
export const GIVEN: Record<WordLevelId, number> = { easy: 3, medium: 2, hard: 1 };
/** Fácil e Médio mostram a dica escrita de cada palavra; Difícil só a categoria. */
export const showsClue = (level: WordLevelId): boolean => level !== 'hard';

/**
 * Palavras cifradas (imutável). Cada letra tem um número fixo de 1 a 26 (`numbers`, índice 0 = A; 0 = ausente) valendo em
 * todas as palavras. `known` são os números descobertos: com `autoReveal`, acertar uma palavra revela os números dela
 * nas outras; sem ele, só a linha acertada (`solved`) trava. `entries` guarda o digitado em cada linha ('.' = vazia).
 */
export interface CipherState {
  level: WordLevelId;
  words: Word[];
  numbers: number[];
  known: number[];
  entries: string[];
  row: number;
  col: number;
  hintsUsed: number;
  autoReveal: boolean;
  solved: number[];
}

const idx = (letter: string): number => letter.charCodeAt(0) - 65;
export const numberAt = (s: CipherState, r: number, c: number): number => s.numbers[idx(s.words[r]!.text[c]!)]!;
export const isKnown = (s: CipherState, r: number, c: number): boolean => s.solved.includes(r) || s.known.includes(numberAt(s, r, c));
export const rowSolved = (s: CipherState, r: number): boolean =>
  s.solved.includes(r) || [...s.words[r]!.text].every((_, c) => s.known.includes(numberAt(s, r, c)));

/** Letra mostrada na casa: a certa se o número já foi descoberto, senão a digitada (ou null). */
export function letterAt(s: CipherState, r: number, c: number): string | null {
  if (isKnown(s, r, c)) return s.words[r]!.text[c]!;
  const e = s.entries[r]![c]!;
  return e === EMPTY ? null : e;
}

/** Linha toda preenchida mas ainda errada. */
export const rowWrong = (s: CipherState, r: number): boolean =>
  !rowSolved(s, r) && [...s.words[r]!.text].every((_, c) => letterAt(s, r, c) !== null);

export const solvedRows = (s: CipherState): number => s.words.filter((_, r) => rowSolved(s, r)).length;
export const isSolved = (s: CipherState): boolean => solvedRows(s) === s.words.length;
export const hintsLeft = (s: CipherState): number => HINTS[s.level] - s.hintsUsed;

/** Letras já descobertas (para colorir o teclado). */
export function knownLetters(s: CipherState): Set<string> {
  const out = new Set<string>();
  s.words.forEach((w, r) => [...w.text].forEach((ch, c) => { if (isKnown(s, r, c)) out.add(ch); }));
  return out;
}

export function selectCell(s: CipherState, r: number, c: number): CipherState {
  const w = s.words[r];
  return !w || c < 0 || c >= w.text.length ? s : { ...s, row: r, col: c };
}

/** Procura a próxima casa editável a partir de `from` na linha `r`. */
function moveToNextEditable(s: CipherState, r: number, from: number, inclusive = false): CipherState {
  const n = s.words[r]!.text.length;
  const start = inclusive ? from : from + 1;
  const range = (a: number, b: number): number[] => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
  const free = (c: number): boolean => !isKnown(s, r, c) && letterAt(s, r, c) === null;
  const editable = (c: number): boolean => !isKnown(s, r, c);
  const target = range(start, n).find(free) ?? range(0, n).find(free) ?? range(start, n).find(editable) ?? range(0, n).find(editable);
  return target === undefined ? { ...s, row: r, col: Math.min(Math.max(from, 0), n - 1) } : { ...s, row: r, col: target };
}

/** Escreve a letra na casa selecionada (se não descoberta); acertar a palavra revela seus números. */
export function input(s: CipherState, letter: string): CipherState {
  if (isSolved(s) || !/^[A-Z]$/.test(letter) || isKnown(s, s.row, s.col)) return s;
  const entries = s.entries.map((e, r) => (r === s.row ? e.slice(0, s.col) + letter + e.slice(s.col + 1) : e));
  let next: CipherState = { ...s, entries };
  const word = s.words[s.row]!.text;
  if ([...word].every((ch, c) => letterAt(next, s.row, c) === ch)) {
    next = s.autoReveal
      ? { ...next, known: [...new Set([...next.known, ...[...word].map((ch) => s.numbers[idx(ch)]!)])] }
      : { ...next, solved: [...next.solved, s.row] };
  }
  return moveToNextEditable(next, s.row, s.col);
}

export function erase(s: CipherState): CipherState {
  if (isSolved(s)) return s;
  const { row, col } = s;
  if (!isKnown(s, row, col) && s.entries[row]![col] !== EMPTY) {
    const entries = s.entries.map((e, r) => (r === row ? e.slice(0, col) + EMPTY + e.slice(col + 1) : e));
    return { ...s, entries };
  }
  for (let c = col - 1; c >= 0; c--) if (!isKnown(s, row, c)) return { ...s, col: c };
  return s;
}

/** Revela o primeiro número ainda desconhecido da palavra selecionada (ou da primeira não resolvida). */
export function hint(s: CipherState): CipherState {
  if (isSolved(s) || hintsLeft(s) <= 0) return s;
  const target = rowSolved(s, s.row) ? s.words.findIndex((_, r) => !rowSolved(s, r)) : s.row;
  const number = [...s.words[target]!.text].map((ch) => s.numbers[idx(ch)]!).find((n) => !s.known.includes(n));
  if (number === undefined) return s;
  return moveToNextEditable({ ...s, known: [...s.known, number], hintsUsed: s.hintsUsed + 1 }, target, 0, true);
}

/** Vai para a primeira linha não resolvida depois da atual (OK do teclado). */
export function nextRow(s: CipherState): CipherState {
  for (let i = 1; i <= s.words.length; i++) {
    const r = (s.row + i) % s.words.length;
    if (!rowSolved(s, r)) return moveToNextEditable(s, r, 0, true);
  }
  return s;
}

export const toggleAutoReveal = (s: CipherState): CipherState => ({ ...s, autoReveal: !s.autoReveal });

/** Todas as palavras ligadas por pelo menos uma letra em comum (direta ou por intermédio de outras). */
export function isConnected(words: readonly Word[]): boolean {
  if (words.length === 0) return false;
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const a = queue.shift()!;
    words.forEach((w, i) => {
      if (!seen.has(i) && [...w.text].some((ch) => words[a]!.text.includes(ch))) { seen.add(i); queue.push(i); }
    });
  }
  return seen.size === words.length;
}

function pickWords(level: WordLevelId, rng: Rng): Word[] {
  const candidates = wordsOf(level);
  let last = shuffled(candidates, rng).slice(0, WORDS_IN_GRID);
  for (let i = 0; i < 300; i++) {
    last = shuffled(candidates, rng).slice(0, WORDS_IN_GRID);
    if (isConnected(last)) return last;
  }
  return last;
}

/** Números que já nascem revelados: as letras mais comuns, sem completar nenhuma palavra sozinhas. */
function initialKnown(words: Word[], numbers: number[], level: WordLevelId, rng: Rng): number[] {
  const freq = new Map<string, number>();
  for (const w of words) for (const ch of new Set(w.text)) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const ordered = shuffled([...freq.keys()], rng).sort((a, b) => freq.get(b)! - freq.get(a)!);
  const picked: string[] = [];
  for (const letter of ordered) {
    if (picked.length >= GIVEN[level]) break;
    const trial = [...picked, letter];
    if (!words.some((w) => [...w.text].every((ch) => trial.includes(ch)))) picked.push(letter);
  }
  return picked.map((l) => numbers[idx(l)]!);
}

export function startCipher(level: WordLevelId, autoReveal = true, rng: Rng = Math.random, words?: Word[]): CipherState {
  const chosen = words ?? pickWords(level, rng);
  const letters = [...new Set(chosen.flatMap((w) => [...w.text]))];
  const pool = shuffled(Array.from({ length: 26 }, (_, i) => i + 1), rng);
  const numbers: number[] = Array(26).fill(0);
  letters.forEach((l, i) => { numbers[idx(l)] = pool[i]!; });
  const base: CipherState = {
    level, words: chosen, numbers, known: [], entries: chosen.map((w) => EMPTY.repeat(w.text.length)),
    row: 0, col: 0, hintsUsed: 0, autoReveal, solved: [],
  };
  return moveToNextEditable({ ...base, known: initialKnown(chosen, numbers, level, rng) }, 0, 0, true);
}

/** Valida o que veio do localStorage; palavras têm de existir no banco e a cifra bater com elas. */
export function parseSaved(raw: unknown): CipherState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isLevelId(r.level) || !Array.isArray(r.words) || r.words.length !== WORDS_IN_GRID) return null;
  const words = r.words.map((t) => WORDS.find((w) => w.text === t));
  if (words.some((w) => !w)) return null;
  const numbers = r.numbers;
  if (!Array.isArray(numbers) || numbers.length !== 26 || !numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 26)) return null;
  const used = new Set((words as Word[]).flatMap((w) => [...w.text]));
  for (let i = 0; i < 26; i++) if (used.has(String.fromCharCode(65 + i)) !== (numbers[i] !== 0)) return null;
  const nonZero = (numbers as number[]).filter((n) => n !== 0);
  if (new Set(nonZero).size !== nonZero.length) return null;
  const known = r.known;
  if (!Array.isArray(known) || !known.every((n) => nonZero.includes(n))) return null;
  const entries = r.entries;
  if (!Array.isArray(entries) || entries.length !== WORDS_IN_GRID) return null;
  for (let i = 0; i < WORDS_IN_GRID; i++) {
    const e = entries[i];
    if (typeof e !== 'string' || e.length !== words[i]!.text.length || !/^[A-Z.]*$/.test(e)) return null;
  }
  const { row, col, hintsUsed } = r;
  if (typeof row !== 'number' || !Number.isInteger(row) || row < 0 || row >= WORDS_IN_GRID) return null;
  if (typeof col !== 'number' || !Number.isInteger(col) || col < 0 || col >= words[row]!.text.length) return null;
  if (typeof hintsUsed !== 'number' || !Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > HINTS[r.level]) return null;
  const solved = r.solved;
  if (!Array.isArray(solved) || !solved.every((n) => Number.isInteger(n) && n >= 0 && n < WORDS_IN_GRID)) return null;
  return {
    level: r.level, words: words as Word[], numbers: numbers as number[], known: known as number[], entries: entries as string[],
    row, col, hintsUsed, autoReveal: r.autoReveal !== false, solved: solved as number[],
  };
}

/** Forma gravada no localStorage: só os textos das palavras. */
export const toSaved = (s: CipherState) => ({ ...s, words: s.words.map((w) => w.text) });
