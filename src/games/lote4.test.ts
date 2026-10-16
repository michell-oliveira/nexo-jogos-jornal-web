import { describe, expect, it } from 'vitest';
import * as crypto from './cryptogram/domain';
import { PHRASES } from './cryptogram/phrases';
import * as cipher from './wordcipher/domain';
import { WORD_LEVEL_IDS } from './words/shared';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('banco de frases', () => {
  it('só A-Z e espaços, sem repetição, e cada nível tem frases', () => {
    expect(PHRASES.every((p) => /^[A-Z]+( [A-Z]+)*$/.test(p))).toBe(true);
    expect(new Set(PHRASES).size).toBe(PHRASES.length);
    for (const l of crypto.CRYPTO_LEVEL_IDS) expect(crypto.phrasesOf(l).length).toBeGreaterThan(5);
  });
});

describe('Criptograma', () => {
  it('cifra injetiva, pistas corretas e quantidade fiel ao nível', () => {
    for (const level of crypto.CRYPTO_LEVEL_IDS) {
      const s = crypto.startCrypto(level, seeded(3));
      const used = s.numbers.filter((n) => n !== 0);
      expect(new Set(used).size).toBe(used.length);
      expect(s.given.length).toBe(crypto.CRYPTO_LEVELS[level].revealed);
      expect(crypto.wrongNumbers(s).size).toBe(0);
      expect(crypto.isSolved(s)).toBe(false);
    }
  });
  it('digitar, mover letra, apagar, pista e resolver', () => {
    let s = crypto.startCrypto('easy', seeded(5));
    const sol = crypto.solutionOf(s);
    const free = [...sol.keys()].filter((n) => !s.given.includes(n));
    const [a, b] = free as [number, number];
    const wrongLetter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => ![...sol.values()].includes(l))!;
    s = crypto.input(crypto.select(s, a), wrongLetter);
    expect(crypto.wrongNumbers(s)).toEqual(new Set([a]));
    // a mesma letra num outro número sai do primeiro
    s = crypto.input(crypto.select(s, b), wrongLetter);
    expect(s.guesses[a]).toBeUndefined();
    s = crypto.erase(s);
    expect(s.guesses[b]).toBeUndefined();
    // pistas não mudam
    const g = s.given[0]!;
    const onGiven = crypto.select(s, g);
    expect(crypto.input(onGiven, 'Z')).toBe(onGiven);
    expect(crypto.erase(onGiven)).toBe(onGiven);
    for (let i = 0; i < free.length; i++) s = crypto.hint(s);
    expect(crypto.isSolved(s)).toBe(true);
    expect(crypto.hint(s)).toBe(s);
  });
  it('parseSaved faz ida e volta e rejeita adulteração', () => {
    const start = crypto.startCrypto('hard', seeded(8));
    const pick = [...crypto.solutionOf(start).keys()].find((n) => !start.given.includes(n))!;
    const s = crypto.input(crypto.select(start, pick), 'A');
    const raw = JSON.parse(JSON.stringify(s));
    expect(crypto.parseSaved(raw)?.phrase).toBe(s.phrase);
    expect(crypto.parseSaved({ ...raw, phrase: 'NAO EXISTE' })).toBeNull();
    expect(crypto.parseSaved({ ...raw, numbers: raw.numbers.slice(1) })).toBeNull();
    expect(crypto.parseSaved({ ...raw, guesses: { '99': 'A' } })).toBeNull();
    expect(crypto.parseSaved({ ...raw, given: [...raw.given, raw.given[0]] })).toBeNull();
    expect(crypto.parseSaved(null)).toBeNull();
  });
});

/** Digita a palavra da linha casa a casa (casas já reveladas são puladas pelo próprio domínio). */
function typeRow(s: cipher.CipherState, r: number): cipher.CipherState {
  for (let c = 0; c < s.words[r]!.text.length; c++) s = cipher.input(cipher.selectCell(s, r, c), s.words[r]!.text[c]!);
  return s;
}

describe('Palavras Cifradas', () => {
  it('sorteia 5 palavras ligadas, cifra injetiva e números iniciais sem fechar nenhuma palavra', () => {
    for (const level of WORD_LEVEL_IDS) {
      const s = cipher.startCipher(level, true, seeded(11));
      expect(s.words.length).toBe(cipher.WORDS_IN_GRID);
      expect(cipher.isConnected(s.words)).toBe(true);
      const used = s.numbers.filter((n) => n !== 0);
      expect(new Set(used).size).toBe(used.length);
      expect(s.known.length).toBe(cipher.GIVEN[level]);
      expect(cipher.solvedRows(s)).toBe(0);
    }
  });
  it('acertar uma palavra revela seus números nas outras (auto) ou só trava a linha (manual)', () => {
    const auto = typeRow(cipher.startCipher('easy', true, seeded(2)), 0);
    expect(cipher.rowSolved(auto, 0)).toBe(true);
    const manual = typeRow(cipher.startCipher('easy', false, seeded(2)), 0);
    expect(manual.solved).toEqual([0]);
    expect(manual.known.length).toBe(cipher.GIVEN.easy);
  });
  it('dicas são limitadas e a partida pode ser concluída', () => {
    let s = cipher.startCipher('hard', true, seeded(4));
    expect(cipher.hintsLeft(s)).toBe(cipher.HINTS.hard);
    s = cipher.hint(s);
    expect(cipher.hintsLeft(s)).toBe(0);
    expect(cipher.hint(s)).toBe(s);
    for (let r = 0; r < s.words.length && !cipher.isSolved(s); r++) {
      if (cipher.rowSolved(s, r)) continue;
      s = typeRow(s, r);
    }
    expect(cipher.isSolved(s)).toBe(true);
  });
  it('letra errada fica na linha como errada; apagar limpa', () => {
    let s = cipher.startCipher('medium', true, seeded(6));
    s = cipher.nextRow(cipher.selectCell(s, 0, 0));
    const r = s.row;
    const c = s.col;
    const wrong = s.words[r]!.text[c] === 'Z' ? 'Y' : 'Z';
    s = cipher.input(s, wrong);
    expect(s.entries[r]![c]).toBe(wrong);
    s = cipher.erase(cipher.selectCell(s, r, c));
    expect(s.entries[r]![c]).toBe(cipher.EMPTY);
  });
  it('parseSaved faz ida e volta e rejeita adulteração', () => {
    const s = cipher.startCipher('easy', true, seeded(9));
    const raw = JSON.parse(JSON.stringify(cipher.toSaved(s)));
    expect(cipher.parseSaved(raw)?.words.map((w) => w.text)).toEqual(s.words.map((w) => w.text));
    expect(cipher.parseSaved({ ...raw, words: ['A', 'B', 'C', 'D', 'E'] })).toBeNull();
    expect(cipher.parseSaved({ ...raw, entries: ['x', '', '', '', ''] })).toBeNull();
    expect(cipher.parseSaved({ ...raw, row: 9 })).toBeNull();
    expect(cipher.parseSaved({ ...raw, known: [99] })).toBeNull();
    expect(cipher.parseSaved(undefined)).toBeNull();
  });
});
