import { shuffled, type Rng } from '../../core/ui';
import { WORDS } from '../words/bank';
import { isLevelId, sampleWords, type Word, type WordLevelId } from '../words/shared';

export const WORDS_PER_ROUND = 10;

/**
 * Rodada do Anagrama (imutável): palavras em sequência. `scrambled` são as letras embaralhadas da palavra atual e
 * `placed` os índices delas já colocados na resposta, em ordem.
 */
export interface AnagramState {
  level: WordLevelId;
  words: Word[];
  index: number;
  score: number;
  scrambled: string;
  placed: number[];
  hintShown: boolean;
}

/** Embaralha garantindo (quando possível) uma ordem diferente da palavra. */
export function scramble(text: string, rng: Rng = Math.random): string {
  for (let i = 0; i < 20; i++) {
    const s = shuffled([...text], rng).join('');
    if (s !== text) return s;
  }
  return text.slice(1) + text.slice(0, 1);
}

export function startAnagram(level: WordLevelId, rng: Rng = Math.random): AnagramState {
  const words = sampleWords(level, WORDS_PER_ROUND, rng);
  return { level, words, index: 0, score: 0, scrambled: scramble(words[0]!.text, rng), placed: [], hintShown: false };
}

export const isFinished = (s: AnagramState): boolean => s.index >= s.words.length;
export const currentWord = (s: AnagramState): Word => s.words[s.index]!;
export const answerOf = (s: AnagramState): string => s.placed.map((i) => s.scrambled[i]).join('');
export const isFull = (s: AnagramState): boolean => s.placed.length === s.scrambled.length;
export const isCorrect = (s: AnagramState): boolean => !isFinished(s) && isFull(s) && answerOf(s) === currentWord(s).text;
/** No nível Fácil a dica aparece sempre; nos outros, só depois de pedida. */
export const hintVisible = (s: AnagramState): boolean => s.hintShown || s.level === 'easy';

export function place(s: AnagramState, position: number): AnagramState {
  if (isFinished(s) || position < 0 || position >= s.scrambled.length || s.placed.includes(position)) return s;
  return { ...s, placed: [...s.placed, position] };
}

/** Tira da resposta a letra que está na casa `slot` da resposta. */
export function removeAt(s: AnagramState, slot: number): AnagramState {
  if (isFinished(s) || slot < 0 || slot >= s.placed.length) return s;
  return { ...s, placed: s.placed.filter((_, i) => i !== slot) };
}

export const clear = (s: AnagramState): AnagramState => (isFinished(s) ? s : { ...s, placed: [] });
export const showHint = (s: AnagramState): AnagramState => (isFinished(s) ? s : { ...s, hintShown: true });

export function reshuffle(s: AnagramState, rng: Rng = Math.random): AnagramState {
  return isFinished(s) ? s : { ...s, scrambled: scramble(currentWord(s).text, rng), placed: [] };
}

function advance(s: AnagramState, score: number, rng: Rng): AnagramState {
  const index = s.index + 1;
  const scrambled = index < s.words.length ? scramble(s.words[index]!.text, rng) : '';
  return { ...s, index, score, scrambled, placed: [], hintShown: false };
}

/** Se a resposta estiver certa, soma o ponto e vai para a próxima palavra; senão devolve o mesmo estado. */
export const check = (s: AnagramState, rng: Rng = Math.random): AnagramState =>
  isCorrect(s) ? advance(s, s.score + 1, rng) : s;

export const skip = (s: AnagramState, rng: Rng = Math.random): AnagramState =>
  isFinished(s) ? s : advance(s, s.score, rng);

/** Valida o que veio do localStorage; as palavras têm de existir no banco e as letras bater com a palavra atual. */
export function parseSaved(raw: unknown): AnagramState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isLevelId(r.level) || !Array.isArray(r.words) || r.words.length === 0 || r.words.length > WORDS_PER_ROUND) return null;
  const words = r.words.map((t) => WORDS.find((w) => w.text === t));
  if (words.some((w) => !w)) return null;
  const index = r.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= words.length) return null;
  const score = r.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > index) return null;
  const word = words[index]!.text;
  const scrambled = r.scrambled;
  if (typeof scrambled !== 'string' || [...scrambled].sort().join('') !== [...word].sort().join('')) return null;
  const placed = r.placed;
  if (!Array.isArray(placed) || !placed.every((i) => Number.isInteger(i) && i >= 0 && i < scrambled.length)) return null;
  if (new Set(placed).size !== placed.length) return null;
  return { level: r.level, words: words as Word[], index, score, scrambled, placed: placed as number[], hintShown: r.hintShown === true };
}

/** Forma gravada no localStorage: só os textos das palavras. */
export const toSaved = (s: AnagramState) => ({
  level: s.level, words: s.words.map((w) => w.text), index: s.index, score: s.score,
  scrambled: s.scrambled, placed: s.placed, hintShown: s.hintShown,
});
