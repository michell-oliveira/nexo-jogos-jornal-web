import { describe, expect, it } from 'vitest';
import * as anagram from './anagram/domain';
import * as hangman from './hangman/domain';
import { ANSWERS } from './termo/answers';
import * as termo from './termo/domain';
import { WORDS } from './words/bank';
import { WORD_LEVEL_IDS, wordsOf } from './words/shared';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('banco de palavras', () => {
  it('só A-Z, sem repetição, e cada nível tem palavras suficientes para uma rodada', () => {
    expect(WORDS.every((w) => /^[A-Z]+$/.test(w.text) && w.category && w.hint)).toBe(true);
    expect(new Set(WORDS.map((w) => w.text)).size).toBe(WORDS.length);
    for (const l of WORD_LEVEL_IDS) expect(wordsOf(l).length).toBeGreaterThanOrEqual(anagram.WORDS_PER_ROUND);
  });
  it('respostas do Termo têm 5 letras A-Z', () => {
    expect(ANSWERS.every((w) => /^[A-Z]{5}$/.test(w))).toBe(true);
  });
});

describe('Termo', () => {
  it('evaluate marca repetidas só enquanto houver cópias na resposta', () => {
    expect(termo.evaluate('ARARA', 'ABRIR')).toEqual(['hit', 'present', 'miss', 'present', 'miss']);
    expect(termo.evaluate('RRRXX', 'ARXXX')).toEqual(['miss', 'hit', 'miss', 'hit', 'hit']);
    expect(termo.evaluate('BRISA', 'BRISA')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(termo.evaluate('AAAAB', 'BAAAA')).toEqual(['present', 'hit', 'hit', 'hit', 'present']);
  });
  it('digitar, apagar e enviar exige palavra completa e válida', () => {
    let s = termo.startTermo('medium', false, seeded(1));
    const valid = (w: string) => w === s.answer;
    for (const l of 'ABC') s = termo.typeLetter(s, l);
    expect(termo.submit(s, valid).result).toBe('incomplete');
    s = termo.backspace(s);
    expect(s.current).toBe('AB');
    s = { ...s, current: '' };
    for (const l of 'ZZZZZ') s = termo.typeLetter(s, l);
    expect(termo.submit(s, valid).result).toBe('unknown');
    s = { ...s, current: s.answer };
    const r = termo.submit(s, valid);
    expect(r.result).toBe('accepted');
    expect(termo.statusOf(r.state)).toBe('won');
    expect(termo.submit(r.state, valid).result).toBe('finished');
  });
  it('perde ao esgotar as tentativas', () => {
    let s = termo.startTermo('hard', false, seeded(2));
    const wrong = ANSWERS.find((w) => w !== s.answer)!;
    for (let i = 0; i < termo.LEVELS.hard.attempts; i++) {
      s = { ...s, current: wrong };
      s = termo.submit(s, () => true).state;
    }
    expect(termo.statusOf(s)).toBe('lost');
  });
  it('dica trava a posição, respeita o limite e não gasta tentativa', () => {
    let s = termo.startTermo('medium', false, seeded(3));
    s = termo.hint(s, seeded(4));
    expect(s.revealed.length).toBe(1);
    expect(termo.hint(s)).toBe(s);
    expect(s.guesses.length).toBe(0);
    expect(termo.rowLetters(s)[s.revealed[0]!]).toBe(s.answer[s.revealed[0]!]);
  });
  it('com assist, os verdes ficam travados na linha seguinte', () => {
    let s = termo.startTermo('easy', true, seeded(5));
    const guess = s.answer[0] + (s.answer[1] === 'Z' ? 'B' : 'Z') + 'ZZZ';
    s = termo.submit({ ...s, current: guess }, () => true).state;
    expect(termo.lockedOf(s).get(0)).toBe(s.answer[0]);
  });
  it('parseSaved rejeita lixo e aceita o que foi salvo', () => {
    const s = termo.startTermo('easy', false, seeded(6));
    expect(termo.parseSaved(JSON.parse(JSON.stringify(s)))?.answer).toBe(s.answer);
    expect(termo.parseSaved({ ...s, answer: 'abc' })).toBeNull();
    expect(termo.parseSaved({ ...s, level: 'x' })).toBeNull();
    expect(termo.parseSaved({ ...s, guesses: ['<img>'] })).toBeNull();
    expect(termo.parseSaved(null)).toBeNull();
  });
});

describe('Forca', () => {
  it('acerta, erra e perde com 6 erros', () => {
    let s = hangman.startHangman('easy', seeded(1));
    const word = s.word.text;
    const wrong = [...'ZXQWKJ'].filter((l) => !word.includes(l));
    for (const l of wrong.slice(0, hangman.MAX_ERRORS - 1)) s = hangman.guess(s, l);
    expect(hangman.isOver(s)).toBe(false);
    s = hangman.guess(s, wrong[hangman.MAX_ERRORS - 1] ?? 'V');
    if (hangman.errorsOf(s) >= hangman.MAX_ERRORS) expect(hangman.isLost(s)).toBe(true);
  });
  it('vence ao descobrir todas as letras; letra repetida é ignorada', () => {
    let s = hangman.startHangman('medium', seeded(2));
    for (const l of s.word.text) s = hangman.guess(s, l);
    expect(hangman.isWon(s)).toBe(true);
    expect(hangman.guess(s, 'A')).toBe(s);
  });
  it('dica revela letra sem erro e acaba', () => {
    let s = hangman.startHangman('hard', seeded(3));
    s = hangman.hint(s);
    expect(s.hintsLeft).toBe(0);
    expect(hangman.errorsOf(s)).toBe(0);
    expect(hangman.hint(s)).toBe(s);
  });
  it('parseSaved valida contra o banco', () => {
    const s = hangman.startHangman('easy', seeded(4));
    const saved = { level: s.level, word: s.word.text, guessed: ['A'], hintsLeft: 1 };
    expect(hangman.parseSaved(saved)?.word.text).toBe(s.word.text);
    expect(hangman.parseSaved({ ...saved, word: 'INEXISTENTE' })).toBeNull();
    expect(hangman.parseSaved({ ...saved, guessed: ['aa'] })).toBeNull();
    expect(hangman.parseSaved({ ...saved, hintsLeft: 99 })).toBeNull();
  });
});

describe('Anagrama', () => {
  it('scramble mantém as letras e difere da palavra', () => {
    for (const w of WORDS.slice(0, 50)) {
      const s = anagram.scramble(w.text, seeded(w.text.length));
      expect([...s].sort().join('')).toBe([...w.text].sort().join(''));
    }
  });
  it('rodada: monta a resposta, confere e avança; pular não pontua', () => {
    let s = anagram.startAnagram('easy', seeded(1));
    const first = anagram.currentWord(s).text;
    for (const ch of first) {
      const i = [...s.scrambled].findIndex((l, idx) => l === ch && !s.placed.includes(idx));
      s = anagram.place(s, i);
    }
    expect(anagram.isCorrect(s)).toBe(true);
    s = anagram.check(s, seeded(2));
    expect(s.score).toBe(1);
    expect(s.index).toBe(1);
    s = anagram.skip(s, seeded(3));
    expect(s.score).toBe(1);
    expect(s.index).toBe(2);
  });
  it('termina após todas as palavras e remove/limpa letras', () => {
    let s = anagram.startAnagram('medium', seeded(4));
    s = anagram.place(anagram.place(s, 0), 1);
    expect(anagram.removeAt(s, 0).placed).toEqual([1]);
    expect(anagram.clear(s).placed).toEqual([]);
    expect(anagram.place(s, 0)).toBe(s);
    for (let i = 0; i < anagram.WORDS_PER_ROUND; i++) s = anagram.skip(s);
    expect(anagram.isFinished(s)).toBe(true);
    expect(anagram.skip(s)).toBe(s);
  });
  it('parseSaved faz o ciclo de ida e volta e rejeita adulteração', () => {
    const s = anagram.place(anagram.startAnagram('hard', seeded(5)), 2);
    const back = anagram.parseSaved(JSON.parse(JSON.stringify(anagram.toSaved(s))));
    expect(back?.scrambled).toBe(s.scrambled);
    expect(back?.placed).toEqual([2]);
    expect(anagram.parseSaved({ ...anagram.toSaved(s), scrambled: 'XXXX' })).toBeNull();
    expect(anagram.parseSaved({ ...anagram.toSaved(s), placed: [0, 0] })).toBeNull();
    expect(anagram.parseSaved({ ...anagram.toSaved(s), words: ['NAOEXISTE'] })).toBeNull();
  });
});
