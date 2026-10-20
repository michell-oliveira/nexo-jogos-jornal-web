import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { DIFFICULTIES, generatePuzzle, type DifficultyId } from './generator';
import { computeHighlights, findConflicts } from './highlight';
import { Solver, candidateMask } from './solver';

/** RNG determinístico para testes reproduzíveis. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const validSolution = (g: readonly number[]): boolean => {
  const groups: number[][] = [];
  for (let k = 0; k < 9; k++) {
    groups.push(Array.from({ length: 9 }, (_, j) => g[k * 9 + j]!));
    groups.push(Array.from({ length: 9 }, (_, j) => g[j * 9 + k]!));
    groups.push(
      Array.from({ length: 9 }, (_, j) => g[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]!),
    );
  }
  return groups.every((grp) => new Set(grp).size === 9 && grp.every((v) => v >= 1 && v <= 9));
};

describe('gerador', () => {
  for (const d of Object.keys(DIFFICULTIES) as DifficultyId[]) {
    it(`${d}: solução válida, pistas = alvo e solução única`, () => {
      const p = generatePuzzle(d, seeded(42));
      expect(validSolution(p.solution)).toBe(true);
      expect(p.givens.filter((v) => v !== 0).length).toBe(DIFFICULTIES[d].targetClues);
      p.givens.forEach((v, i) => v !== 0 && expect(v).toBe(p.solution[i]));
      expect(new Solver(p.givens.slice()).countSolutions(2)).toBe(1);
    });
  }

  it('gera puzzle difícil em tempo aceitável', () => {
    const t = performance.now();
    generatePuzzle('hard', seeded(7));
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe('destaque', () => {
  const values = new Array<number>(81).fill(0);
  values[0] = 5; // linha 0, col 0, bloco 0
  values[40] = 5; // linha 4, col 4, bloco 4

  const count = (h: string[], k: string): number => h.filter((x) => x === k).length;

  it('célula com dígito: match nos iguais, lines em linha/coluna, box no resto do bloco', () => {
    const h = computeHighlights(values, 0);
    expect(h[0]).toBe('none'); // a própria selecionada
    expect(h[40]).toBe('match');
    expect(h[8]).toBe('lines'); // linha 0
    expect(h[36]).toBe('lines'); // coluna 0 e linha 4 ficam em lines
    expect(h[10]).toBe('box'); // bloco 0, fora de linha/coluna
    expect(h[80]).toBe('none');
    expect(count(h, 'lines')).toBe(16);
    expect(count(h, 'box')).toBe(4);
  });

  it('célula vazia: sem match; lines e box continuam', () => {
    const h = computeHighlights(values, 41);
    expect(count(h, 'match')).toBe(0);
    expect(count(h, 'lines')).toBe(16);
    expect(count(h, 'box')).toBe(4);
  });

  it('sem seleção não destaca nada', () => {
    expect(computeHighlights(values, -1).every((x) => x === 'none')).toBe(true);
  });

  it('cada interruptor desligado remove só o seu destaque', () => {
    const all = { match: true, lines: true, box: true };
    const noMatch = computeHighlights(values, 0, { ...all, match: false });
    expect(count(noMatch, 'match')).toBe(0);
    expect(noMatch[40]).toBe('none');
    expect(count(noMatch, 'lines')).toBe(16);
    const noLines = computeHighlights(values, 0, { ...all, lines: false });
    expect(count(noLines, 'lines')).toBe(0);
    expect(noLines[8]).toBe('none');
    expect(noLines[1]).toBe('box'); // cruzamento cai na cor do bloco
    expect(noLines[40]).toBe('match');
    expect(count(noLines, 'box')).toBe(8);
    const noBox = computeHighlights(values, 0, { ...all, box: false });
    expect(count(noBox, 'box')).toBe(0);
    expect(noBox[10]).toBe('none');
    expect(count(noBox, 'lines')).toBe(16);
    expect(computeHighlights(values, 0, { match: false, lines: false, box: false }).every((x) => x === 'none')).toBe(true);
  });

  it('prioridade: match vence lines e box; lines vence box', () => {
    const v = new Array<number>(81).fill(0);
    v[0] = 5;
    v[1] = 5; // mesma linha e bloco da selecionada
    const h = computeHighlights(v, 0);
    expect(h[1]).toBe('match');
    expect(h[2]).toBe('lines'); // bloco 0 e linha 0: lines vence
    expect(h[10]).toBe('box');
  });

  it('detecta conflitos', () => {
    const v = new Array<number>(81).fill(0);
    v[0] = 3;
    v[8] = 3; // mesma linha
    v[40] = 3; // sem relação com as outras
    const c = findConflicts(v);
    expect([c[0], c[8], c[40]]).toEqual([true, true, false]);
  });
});

describe('partida', () => {
  const make = () => Game.create('easy', seeded(1));
  const empty = (g: Game) => g.values.findIndex((v) => v === 0);

  it('não altera célula fixa', () => {
    const g = make();
    expect(g.setValue(g.givens.findIndex((v) => v !== 0), 1)).toBe(false);
  });

  it('preenche, repete para apagar e desfaz', () => {
    const g = make();
    const i = empty(g);
    g.setValue(i, 4);
    expect(g.values[i]).toBe(4);
    g.setValue(i, 4);
    expect(g.values[i]).toBe(0);
    g.undo();
    expect(g.values[i]).toBe(4);
    g.undo();
    expect(g.values[i]).toBe(0);
    expect(g.canUndo).toBe(false);
  });

  it('anotações: alterna e some ao preencher a célula', () => {
    const g = make();
    const i = empty(g);
    g.toggleNote(i, 2);
    g.toggleNote(i, 7);
    expect(g.notes[i]).toBe((1 << 2) | (1 << 7));
    g.toggleNote(i, 2);
    expect(g.notes[i]).toBe(1 << 7);
    g.setValue(i, 1);
    expect(g.notes[i]).toBe(0);
  });

  it('preencher remove o dígito das anotações das vizinhas', () => {
    const g = make();
    const i = empty(g);
    const j = g.values.findIndex((v, k) => v === 0 && k !== i && (Math.floor(k / 9) === Math.floor(i / 9)));
    g.toggleNote(j, 6);
    g.setValue(i, 6);
    expect(g.notes[j]! & (1 << 6)).toBe(0);
  });

  it('anotação automática exclui dígitos da linha/coluna/bloco', () => {
    const v = new Array<number>(81).fill(0);
    v[1] = 1;
    v[9] = 2;
    v[10] = 3;
    const m = candidateMask(v, 0);
    expect([m & 2, m & 4, m & 8]).toEqual([0, 0, 0]);
    expect(m & (1 << 9)).not.toBe(0);
  });

  it('resolve preenchendo com a solução', () => {
    const g = make();
    expect(g.isSolved()).toBe(false);
    g.values.forEach((v, i) => v === 0 && g.setValue(i, g.solution[i]!));
    expect(g.isSolved()).toBe(true);
  });

  it('snapshot ida e volta; rejeita lixo', () => {
    const g = make();
    g.setValue(empty(g), 5);
    g.elapsed = 123;
    const r = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(r?.values).toEqual(g.values);
    expect(r?.elapsed).toBe(123);
    expect(Game.restore(null)).toBeNull();
    expect(Game.restore({ v: 2 })).toBeNull();
    expect(Game.restore({ ...g.snapshot(), values: [1, 2] })).toBeNull();
    const tampered = g.snapshot();
    const gi = g.givens.findIndex((x) => x !== 0);
    tampered.values[gi] = (tampered.values[gi]! % 9) + 1;
    expect(Game.restore(tampered)).toBeNull();
  });
});
