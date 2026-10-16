import { shuffled, randInt, type Rng } from '../../core/ui';
import { PHRASES } from './phrases';

export type CryptoLevelId = 'easy' | 'medium' | 'hard';

/** Dificuldade: quantas letras já vêm reveladas. O tamanho da frase (só letras) define o nível dela. */
export const CRYPTO_LEVELS: Record<CryptoLevelId, { label: string; revealed: number }> = {
  easy: { label: 'Fácil', revealed: 6 },
  medium: { label: 'Médio', revealed: 4 },
  hard: { label: 'Difícil', revealed: 2 },
};
export const CRYPTO_LEVEL_IDS = Object.keys(CRYPTO_LEVELS) as CryptoLevelId[];
export const isCryptoLevel = (v: unknown): v is CryptoLevelId => typeof v === 'string' && v in CRYPTO_LEVELS;

export const letterCount = (phrase: string): number => phrase.replace(/ /g, '').length;

export function levelOfLetterCount(count: number): CryptoLevelId {
  return count <= 24 ? 'easy' : count <= 32 ? 'medium' : 'hard';
}

export const phrasesOf = (level: CryptoLevelId): string[] =>
  PHRASES.filter((p) => levelOfLetterCount(letterCount(p)) === level);

/**
 * Partida de criptograma (imutável). `numbers[i]` é o número (1..26) da letra de índice i (0 = A; 0 = letra ausente).
 * `given` são os números revelados como pista; `guesses` o palpite atual por número (inclui as pistas);
 * `selected` o número tocado.
 */
export interface CryptoState {
  level: CryptoLevelId;
  phrase: string;
  numbers: number[];
  given: number[];
  guesses: Record<number, string>;
  selected: number | null;
}

const idx = (letter: string): number => letter.charCodeAt(0) - 65;
export const numberOf = (s: CryptoState, letter: string): number => s.numbers[idx(letter)]!;

/** Número -> letra correta. */
export function solutionOf(s: CryptoState): Map<number, string> {
  const m = new Map<number, string>();
  for (const ch of s.phrase) if (ch !== ' ') m.set(numberOf(s, ch), ch);
  return m;
}

export const solvedLetters = (s: CryptoState): number => {
  let n = 0;
  solutionOf(s).forEach((letter, num) => { if (s.guesses[num] === letter) n++; });
  return n;
};
export const isSolved = (s: CryptoState): boolean => solvedLetters(s) === solutionOf(s).size;

/** Números com palpite errado (pistas nunca erram). */
export function wrongNumbers(s: CryptoState): Set<number> {
  const sol = solutionOf(s);
  const out = new Set<number>();
  for (const [k, letter] of Object.entries(s.guesses)) {
    const n = Number(k);
    if (!s.given.includes(n) && sol.get(n) !== letter) out.add(n);
  }
  return out;
}

export function startCrypto(level: CryptoLevelId, rng: Rng = Math.random, phrase?: string): CryptoState {
  const pool = phrasesOf(level);
  const chosen = phrase ?? pool[randInt(pool.length, rng)]!;
  const letters = [...new Set(chosen.replace(/ /g, ''))];
  const nums = shuffled(Array.from({ length: 26 }, (_, i) => i + 1), rng);
  const numbers: number[] = Array(26).fill(0);
  letters.forEach((l, i) => { numbers[idx(l)] = nums[i]!; });
  const revealed = shuffled(letters, rng).slice(0, Math.min(CRYPTO_LEVELS[level].revealed, letters.length - 1));
  const given = revealed.map((l) => numbers[idx(l)]!);
  const guesses: Record<number, string> = {};
  revealed.forEach((l) => { guesses[numbers[idx(l)]!] = l; });
  return { level, phrase: chosen, numbers, given, guesses, selected: null };
}

/** Seleciona o número; tocar no já selecionado desfaz a seleção. */
export const select = (s: CryptoState, n: number): CryptoState =>
  isSolved(s) ? s : { ...s, selected: n === s.selected ? null : n };

function withoutLetter(s: CryptoState, letter: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, g] of Object.entries(s.guesses)) {
    if (g !== letter || s.given.includes(Number(k))) out[Number(k)] = g;
  }
  return out;
}

/** Atribui a letra ao número selecionado; a letra sai de qualquer outro número (exceto pistas). */
export function input(s: CryptoState, letter: string): CryptoState {
  const n = s.selected;
  if (isSolved(s) || n === null || s.given.includes(n) || !solutionOf(s).has(n) || !/^[A-Z]$/.test(letter)) return s;
  return { ...s, guesses: { ...withoutLetter(s, letter), [n]: letter } };
}

export function erase(s: CryptoState): CryptoState {
  const n = s.selected;
  if (isSolved(s) || n === null || s.given.includes(n) || s.guesses[n] === undefined) return s;
  const guesses = { ...s.guesses };
  delete guesses[n];
  return { ...s, guesses };
}

/** Revela o número selecionado (se ainda errado) ou o primeiro que falta. */
export function hint(s: CryptoState): CryptoState {
  const sol = solutionOf(s);
  const missing = (n: number): boolean => s.guesses[n] !== sol.get(n);
  const target = s.selected !== null && sol.has(s.selected) && missing(s.selected)
    ? s.selected
    : [...sol.keys()].find(missing);
  if (target === undefined) return s;
  const letter = sol.get(target)!;
  return { ...s, guesses: { ...withoutLetter(s, letter), [target]: letter }, given: [...s.given, target], selected: null };
}

/** Valida o que veio do localStorage: a frase tem de existir no banco e a cifra ser consistente com ela. */
export function parseSaved(raw: unknown): CryptoState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isCryptoLevel(r.level) || typeof r.phrase !== 'string' || !PHRASES.includes(r.phrase)) return null;
  const numbers = r.numbers;
  if (!Array.isArray(numbers) || numbers.length !== 26 || !numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 26)) return null;
  const used = new Set(r.phrase.replace(/ /g, ''));
  for (let i = 0; i < 26; i++) {
    const present = used.has(String.fromCharCode(65 + i));
    if (present !== (numbers[i] !== 0)) return null;
  }
  const nonZero = (numbers as number[]).filter((n) => n !== 0);
  if (new Set(nonZero).size !== nonZero.length) return null;
  const valid = new Set(nonZero);
  const given = r.given;
  if (!Array.isArray(given) || !given.every((n) => valid.has(n)) || new Set(given).size !== given.length) return null;
  const g = r.guesses;
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const guesses: Record<number, string> = {};
  for (const [k, v] of Object.entries(g)) {
    if (!valid.has(Number(k)) || typeof v !== 'string' || !/^[A-Z]$/.test(v)) return null;
    guesses[Number(k)] = v;
  }
  const selected = r.selected;
  if (selected !== null && !(typeof selected === 'number' && valid.has(selected))) return null;
  const state: CryptoState = { level: r.level, phrase: r.phrase, numbers: numbers as number[], given: given as number[], guesses, selected };
  // pistas precisam estar com a letra certa
  const sol = solutionOf(state);
  if (state.given.some((n) => guesses[n] !== sol.get(n))) return null;
  return state;
}
