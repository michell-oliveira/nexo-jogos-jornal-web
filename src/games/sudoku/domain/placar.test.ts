import { describe, expect, it } from 'vitest';
import { completedDigits } from './digits';
import { Game } from './game';
import { candidateMask } from './solver';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const newGame = (): Game => Game.create('easy', seeded(7));
const firstEmpty = (g: Game): number => g.values.findIndex((v) => v === 0);

/** Dígito que não é a solução da célula mas também não repete nenhum vizinho (erro "silencioso"). */
const quietWrongDigit = (g: Game, i: number): number | null => {
  const mask = candidateMask(g.values, i);
  for (let d = 1; d <= 9; d++) if (mask & (1 << d) && d !== g.solution[i]) return d;
  return null;
};

/** Dígito que já existe na linha da célula `i` (colocá-lo gera conflito). */
const conflictingDigit = (g: Game, i: number): number => {
  const row = Math.floor(i / 9) * 9;
  for (let j = row; j < row + 9; j++) if (g.values[j] !== 0) return g.values[j]!;
  throw new Error('linha sem dígitos');
};

describe('completedDigits', () => {
  it('lista só os dígitos com 9 ocorrências, certas ou não', () => {
    const values = new Array<number>(81).fill(0);
    for (let i = 0; i < 9; i++) values[i] = 5; // 5 nove vezes (repetidos, no mesmo bloco/linha)
    for (let i = 9; i < 17; i++) values[i] = 3; // 3 só oito vezes
    expect([...completedDigits(values)]).toEqual([5]);
  });

  it('o dígito volta quando uma ocorrência é apagada', () => {
    const values = new Array<number>(81).fill(0);
    for (let i = 0; i < 9; i++) values[i] = 7;
    expect(completedDigits(values).has(7)).toBe(true);
    values[4] = 0;
    expect(completedDigits(values).has(7)).toBe(false);
  });

  it('tabuleiro vazio não conclui nenhum', () => {
    expect(completedDigits(new Array<number>(81).fill(0)).size).toBe(0);
  });
});

describe('erros (mistakes)', () => {
  it('conta 1 por dígito normal que repete linha/coluna/bloco', () => {
    const g = newGame();
    const i = firstEmpty(g);
    expect(g.setValue(i, conflictingDigit(g, i))).toBe(true);
    expect(g.mistakes).toBe(1);
  });

  it('valor errado sem conflito não conta', () => {
    const g = newGame();
    const i = firstEmpty(g);
    const d = quietWrongDigit(g, i);
    if (d === null) return; // célula sem candidato errado: nada a provar
    g.setValue(i, d);
    expect(g.mistakes).toBe(0);
  });

  it('acerto não conta, apagar/desfazer não desconta e anotação não conta', () => {
    const g = newGame();
    const i = firstEmpty(g);
    g.setValue(i, g.solution[i]!);
    expect(g.mistakes).toBe(0);
    g.undo();
    const j = g.values.findIndex((v, k) => v === 0 && k !== i);
    g.toggleNote(j, conflictingDigit(g, j));
    expect(g.mistakes).toBe(0);
    g.setValue(j, conflictingDigit(g, j));
    expect(g.mistakes).toBe(1);
    g.undo();
    g.clear(j);
    expect(g.mistakes).toBe(1);
  });
});

describe('snapshot com mistakes', () => {
  it('grava e lê o contador', () => {
    const g = newGame();
    g.mistakes = 4;
    expect(Game.restore(g.snapshot())?.mistakes).toBe(4);
  });

  it('partida salva antiga (sem mistakes) lê como 0', () => {
    const { mistakes: _omit, ...old } = newGame().snapshot();
    expect(Game.restore(old)?.mistakes).toBe(0);
  });

  it('rejeita mistakes inválido', () => {
    const snap = newGame().snapshot();
    expect(Game.restore({ ...snap, mistakes: -1 })).toBeNull();
    expect(Game.restore({ ...snap, mistakes: 'x' })).toBeNull();
    expect(Game.restore({ ...snap, mistakes: 1.5 })).toBeNull();
  });
});
