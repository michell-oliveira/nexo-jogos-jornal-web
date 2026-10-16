import { randInt, shuffled, type Rng } from '../../core/ui';
import { WORDS, type Word } from './bank';

export type { Word };
export type WordLevelId = 'easy' | 'medium' | 'hard';

/** Dificuldade pelo tamanho da palavra, comum à Forca e ao Anagrama. */
export const WORD_LEVELS: Record<WordLevelId, { label: string; min: number; max: number }> = {
  easy: { label: 'Fácil', min: 4, max: 5 },
  medium: { label: 'Médio', min: 6, max: 7 },
  hard: { label: 'Difícil', min: 8, max: 10 },
};

export const WORD_LEVEL_IDS = Object.keys(WORD_LEVELS) as WordLevelId[];

export const wordsOf = (level: WordLevelId): Word[] =>
  WORDS.filter((w) => w.text.length >= WORD_LEVELS[level].min && w.text.length <= WORD_LEVELS[level].max);

export const pickWord = (level: WordLevelId, rng: Rng = Math.random): Word => {
  const pool = wordsOf(level);
  return pool[randInt(pool.length, rng)]!;
};

/** `n` palavras distintas do nível (menos, se o banco do nível for menor). */
export const sampleWords = (level: WordLevelId, n: number, rng: Rng = Math.random): Word[] =>
  shuffled(wordsOf(level), rng).slice(0, n);

export const isLevelId = (v: unknown): v is WordLevelId => typeof v === 'string' && v in WORD_LEVELS;

/** Só aceita estruturas com cara de palavra do banco (para validar o que vem do localStorage). */
export const isWordText = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3,12}$/.test(v);
