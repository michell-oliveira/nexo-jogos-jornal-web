import { randInt, type Rng } from '../../core/ui';
import { ANSWERS } from './answers';

export const WORD_LENGTH = 5;

export type TermoLevelId = 'easy' | 'medium' | 'hard';
export const LEVELS: Record<TermoLevelId, { label: string; attempts: number; hints: number }> = {
  easy: { label: 'Fácil', attempts: 7, hints: 2 },
  medium: { label: 'Médio', attempts: 6, hints: 1 },
  hard: { label: 'Difícil', attempts: 5, hints: 1 },
};

export type Mark = 'none' | 'hit' | 'present' | 'miss';
export type TermoStatus = 'playing' | 'won' | 'lost';
export type SubmitResult = 'accepted' | 'incomplete' | 'unknown' | 'finished';

/**
 * Partida do Termo (imutável). `current` guarda só as letras digitadas nas casas livres, da esquerda para a direita.
 * Com `assist`, os acertos de posição (verdes) ficam travados nas linhas seguintes; as dicas (`revealed`) travam sempre.
 */
export interface TermoState {
  level: TermoLevelId;
  answer: string;
  guesses: string[];
  current: string;
  assist: boolean;
  revealed: number[];
}

export function startTermo(level: TermoLevelId, assist = false, rng: Rng = Math.random): TermoState {
  return { level, answer: ANSWERS[randInt(ANSWERS.length, rng)]!, guesses: [], current: '', assist, revealed: [] };
}

/** Letras travadas por posição: verdes anteriores (se `assist`) e dicas usadas. */
export function lockedOf(s: TermoState): Map<number, string> {
  const m = new Map<number, string>();
  if (s.assist) for (const g of s.guesses) for (let i = 0; i < WORD_LENGTH; i++) if (g[i] === s.answer[i]) m.set(i, g[i]!);
  for (const i of s.revealed) m.set(i, s.answer[i]!);
  return m;
}

const freeSlots = (s: TermoState): number => WORD_LENGTH - lockedOf(s).size;

/** A linha em digitação, casa a casa: travadas, depois digitadas, depois vazio (''). */
export function rowLetters(s: TermoState): string[] {
  const fixed = lockedOf(s);
  let next = 0;
  return Array.from({ length: WORD_LENGTH }, (_, i) => fixed.get(i) ?? s.current[next++] ?? '');
}

export const hintsLeft = (s: TermoState): number => LEVELS[s.level].hints - s.revealed.length;

export function statusOf(s: TermoState): TermoStatus {
  if (s.guesses[s.guesses.length - 1] === s.answer) return 'won';
  return s.guesses.length >= LEVELS[s.level].attempts ? 'lost' : 'playing';
}

export const isOver = (s: TermoState): boolean => statusOf(s) !== 'playing';

export function typeLetter(s: TermoState, letter: string): TermoState {
  if (isOver(s) || !/^[A-Z]$/.test(letter) || s.current.length >= freeSlots(s)) return s;
  return { ...s, current: s.current + letter };
}

export function backspace(s: TermoState): TermoState {
  return isOver(s) || !s.current ? s : { ...s, current: s.current.slice(0, -1) };
}

/** Revela uma posição ainda livre (sem gastar tentativa); devolve o mesmo estado se não há dica ou casa livre. */
export function hint(s: TermoState, rng: Rng = Math.random): TermoState {
  if (isOver(s) || hintsLeft(s) <= 0) return s;
  const locked = lockedOf(s);
  const free = Array.from({ length: WORD_LENGTH }, (_, i) => i).filter((i) => !locked.has(i));
  if (free.length === 0) return s;
  const next: TermoState = { ...s, revealed: [...s.revealed, free[randInt(free.length, rng)]!] };
  return { ...next, current: next.current.slice(0, freeSlots(next)) };
}

/** Envia a linha (travadas + digitadas) se estiver completa e a palavra existir no dicionário. */
export function submit(s: TermoState, isValid: (word: string) => boolean): { state: TermoState; result: SubmitResult } {
  if (isOver(s)) return { state: s, result: 'finished' };
  if (s.current.length < freeSlots(s)) return { state: s, result: 'incomplete' };
  const word = rowLetters(s).join('');
  if (!isValid(word)) return { state: s, result: 'unknown' };
  return { state: { ...s, guesses: [...s.guesses, word], current: '' }, result: 'accepted' };
}

/** Compara a tentativa com a resposta; letras repetidas só ganham amarelo enquanto houver cópias na resposta. */
export function evaluate(guess: string, answer: string): Mark[] {
  const result: Mark[] = Array.from({ length: guess.length }, () => 'miss');
  const remaining = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = 'hit';
    else remaining.set(answer[i]!, (remaining.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'hit') continue;
    const left = remaining.get(guess[i]!) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      remaining.set(guess[i]!, left - 1);
    }
  }
  return result;
}

const RANK: Record<Mark, number> = { none: 0, miss: 1, present: 2, hit: 3 };

/** Melhor situação conhecida de cada letra já tentada, para colorir o teclado. */
export function keyMarks(s: TermoState): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  for (const g of s.guesses) {
    evaluate(g, s.answer).forEach((mark, i) => {
      const old = marks.get(g[i]!);
      if (!old || RANK[mark] > RANK[old]) marks.set(g[i]!, mark);
    });
  }
  return marks;
}

/** Valida o que veio do localStorage antes de usar (dado de fora nunca é confiável). */
export function parseSaved(raw: unknown): TermoState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const word = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{5}$/.test(v);
  if (typeof r.level !== 'string' || !(r.level in LEVELS) || !word(r.answer)) return null;
  if (!Array.isArray(r.guesses) || !r.guesses.every(word) || r.guesses.length > LEVELS[r.level as TermoLevelId].attempts) return null;
  if (!Array.isArray(r.revealed) || !r.revealed.every((i) => Number.isInteger(i) && i >= 0 && i < WORD_LENGTH)) return null;
  const s: TermoState = {
    level: r.level as TermoLevelId,
    answer: r.answer,
    guesses: r.guesses as string[],
    current: typeof r.current === 'string' && /^[A-Z]{0,5}$/.test(r.current) ? r.current : '',
    assist: r.assist === true,
    revealed: [...new Set(r.revealed as number[])],
  };
  return { ...s, current: s.current.slice(0, freeSlots(s)) };
}
