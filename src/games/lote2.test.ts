import { describe, expect, it } from 'vitest';
import * as match from './numbermatch/domain';
import * as takuzu from './takuzu/domain';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('Takuzu', () => {
  it('grade gerada é válida, fiel ao nível e tem solução única', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const s = takuzu.startTakuzu(level, seeded(7));
      const n = takuzu.sizeOf(s);
      expect(takuzu.conflicts(s.solution, n).size).toBe(0);
      expect(s.solution.every((v) => v === 0 || v === 1)).toBe(true);
      expect(takuzu.countSolutions(s.cells, n)).toBe(1);
      expect(s.given.length).toBeGreaterThanOrEqual(takuzu.LEVELS[level].minGivens);
      expect(s.given.every((i) => s.cells[i] === s.solution[i])).toBe(true);
    }
  });

  it('conflitos: três iguais seguidos e linhas completas repetidas', () => {
    const E = takuzu.EMPTY;
    const row = [0, 0, 0, E, E, E, ...new Array<number>(30).fill(E)];
    expect([...takuzu.conflicts(row, 6)].sort()).toEqual([0, 1, 2]);
    const dup = new Array<number>(36).fill(E);
    [0, 1, 0, 1, 1, 0].forEach((v, i) => { dup[i] = v; dup[6 + i] = v; });
    expect(takuzu.conflicts(dup, 6).has(0)).toBe(true);
    expect(takuzu.conflicts(dup, 6).has(6)).toBe(true);
  });

  it('toque alterna vazio→0→1→vazio, fixa não muda, desfazer volta, dica acerta', () => {
    let s = takuzu.startTakuzu('easy', seeded(11));
    const free = s.cells.findIndex((v, i) => !s.given.includes(i) && v === takuzu.EMPTY);
    const fixed = s.given[0]!;
    expect(takuzu.tap(s, fixed)).toBe(s);
    s = takuzu.tap(takuzu.tap(s, free), free);
    expect(s.cells[free]).toBe(1);
    s = takuzu.tap(s, free);
    expect(s.cells[free]).toBe(takuzu.EMPTY);
    expect(takuzu.undo(s).cells[free]).toBe(1);
    const hinted = takuzu.hint(s, seeded(2));
    const changed = hinted.cells.findIndex((v, i) => v !== s.cells[i]);
    expect(hinted.cells[changed]).toBe(s.solution[changed]);
  });

  it('resolve ao preencher a solução e parseSaved rejeita dados adulterados', () => {
    const s = takuzu.startTakuzu('easy', seeded(5));
    const done = { ...s, cells: [...s.solution] };
    expect(takuzu.isSolved(done)).toBe(true);
    const saved = JSON.parse(JSON.stringify({ level: s.level, solution: s.solution, given: s.given, cells: s.cells }));
    expect(takuzu.parseSaved(saved)).not.toBeNull();
    expect(takuzu.parseSaved({ ...saved, level: 'x' })).toBeNull();
    expect(takuzu.parseSaved({ ...saved, solution: saved.solution.slice(1) })).toBeNull();
    expect(takuzu.parseSaved({ ...saved, given: [999] })).toBeNull();
  });
});

describe('Number Match', () => {
  const board = (cells: number[], addsLeft = 5): match.MatchBoard => ({ cells, addsLeft, selected: null });

  it('inicia com 27 dígitos de 1 a 9 e 5 rodadas', () => {
    const b = match.startMatch(seeded(3));
    expect(b.cells).toHaveLength(27);
    expect(b.cells.every((v) => v >= 1 && v <= 9)).toBe(true);
    expect(b.addsLeft).toBe(5);
  });

  it('par: iguais ou soma 10, com casas vazias no meio; bloqueado por número no caminho', () => {
    const row = board([3, 0, 3, 5, 5, 7, 4, 6, 1]);
    expect(match.canPair(row, 0, 2)).toBe(true); // iguais com vazio no meio
    expect(match.canPair(row, 2, 7 - 5 + 5)).toBe(false); // 3 e 6 não casam
    expect(match.canPair(row, 3, 4)).toBe(true); // 5 e 5 adjacentes
    expect(match.canPair(row, 5, 6)).toBe(false); // 7 e 4 não somam 10
    expect(match.canPair(row, 0, 5)).toBe(false); // 3 e 7 somam 10 mas há números entre eles
    expect(match.canPair(row, 4, 4)).toBe(false);
  });

  it('enxerga fim de linha com começo da próxima e a mesma coluna', () => {
    const cells = new Array<number>(18).fill(0);
    cells[8] = 4;
    cells[9] = 6; // sequência de leitura
    expect(match.canPair(board(cells), 8, 9)).toBe(true);
    const col = new Array<number>(27).fill(0);
    col[2] = 7;
    col[20] = 3; // mesma coluna, linha 0 e linha 2, vazio no meio
    expect(match.canPair(board(col), 2, 20)).toBe(true);
    col[11] = 1;
    expect(match.canPair(board(col), 2, 20)).toBe(false);
  });

  it('select: seleciona, troca, desfaz, remove par e apaga linha vazia (vitória)', () => {
    let b = board([4, 6, 0, 0, 0, 0, 0, 0, 0]);
    b = match.select(b, 0);
    expect(b.selected).toBe(0);
    b = match.select(b, 0);
    expect(b.selected).toBeNull();
    b = match.select(match.select(b, 0), 1);
    expect(match.isWon(b)).toBe(true);
    expect(b.cells).toEqual([]);
  });

  it('addNumbers copia os números restantes no fim e gasta uma rodada', () => {
    const b = board([1, 2, 3, 0, 0, 0, 0, 0, 0]);
    const next = match.addNumbers(b)!;
    expect(next.addsLeft).toBe(4);
    expect(next.cells).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0]);
    expect(match.addNumbers(board([1, 2, 3], 0))).toBeNull();
    expect(match.addNumbers(board([0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it('sem saída: sem pares e sem rodadas; dica retorna um par válido', () => {
    const stuck = board([1, 2, 3, 4, 8, 9, 1 + 0, 0, 0].map((v, i) => (i === 6 ? 7 : v)).slice(0, 9), 0);
    expect(match.findPair(stuck)).toBeNull();
    expect(match.isStuck(stuck)).toBe(true);
    const ok = board([4, 6], 0);
    expect(match.findPair({ ...ok, cells: [4, 6, 0, 0, 0, 0, 0, 0, 0] })).toEqual([0, 1]);
  });
});
