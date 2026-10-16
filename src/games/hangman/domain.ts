import type { Rng } from '../../core/ui';
import { isLevelId, isWordText, pickWord, type Word, type WordLevelId } from '../words/shared';
import { WORDS } from '../words/bank';

export const MAX_ERRORS = 6;
export const HINTS: Record<WordLevelId, number> = { easy: 2, medium: 1, hard: 1 };

/** Partida da Forca (imutável): a palavra, as letras já tentadas e quantas dicas restam. */
export interface HangmanState {
  level: WordLevelId;
  word: Word;
  guessed: string[];
  hintsLeft: number;
}

export function startHangman(level: WordLevelId, rng: Rng = Math.random): HangmanState {
  return { level, word: pickWord(level, rng), guessed: [], hintsLeft: HINTS[level] };
}

export const wrongLetters = (s: HangmanState): string[] => s.guessed.filter((l) => !s.word.text.includes(l)).sort();
export const errorsOf = (s: HangmanState): number => wrongLetters(s).length;
export const isWon = (s: HangmanState): boolean => [...s.word.text].every((l) => s.guessed.includes(l));
export const isLost = (s: HangmanState): boolean => errorsOf(s) >= MAX_ERRORS;
export const isOver = (s: HangmanState): boolean => isWon(s) || isLost(s);

/** Letras da palavra reveladas ('' onde ainda falta descobrir); ao perder, mostra tudo. */
export const shown = (s: HangmanState): string[] =>
  [...s.word.text].map((l) => (s.guessed.includes(l) || isLost(s) ? l : ''));

export function guess(s: HangmanState, letter: string): HangmanState {
  if (isOver(s) || !/^[A-Z]$/.test(letter) || s.guessed.includes(letter)) return s;
  return { ...s, guessed: [...s.guessed, letter] };
}

/** Revela uma letra ainda escondida (a primeira da palavra); não conta como erro. */
export function hint(s: HangmanState): HangmanState {
  if (isOver(s) || s.hintsLeft === 0) return s;
  const next = [...s.word.text].find((l) => !s.guessed.includes(l));
  return next ? { ...s, guessed: [...s.guessed, next], hintsLeft: s.hintsLeft - 1 } : s;
}

/** Valida o que veio do localStorage; a palavra tem de existir no banco (não se confia em texto salvo). */
export function parseSaved(raw: unknown): HangmanState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isLevelId(r.level) || !isWordText(r.word)) return null;
  const word = WORDS.find((w) => w.text === r.word);
  if (!word) return null;
  if (!Array.isArray(r.guessed) || !r.guessed.every((l) => typeof l === 'string' && /^[A-Z]$/.test(l))) return null;
  const hintsLeft = typeof r.hintsLeft === 'number' && Number.isInteger(r.hintsLeft) ? r.hintsLeft : -1;
  if (hintsLeft < 0 || hintsLeft > HINTS[r.level]) return null;
  return { level: r.level, word, guessed: [...new Set(r.guessed as string[])], hintsLeft };
}
