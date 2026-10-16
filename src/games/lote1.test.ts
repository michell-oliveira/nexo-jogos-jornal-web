import { describe, expect, it } from 'vitest';
import * as g2048 from './g2048/domain';
import * as lights from './lightsout/domain';
import * as mines from './minesweeper/domain';

/** RNG determinístico (LCG) para testes reproduzíveis. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('2048', () => {
  it('mergeLine funde pares uma vez só e compacta', () => {
    expect(g2048.mergeLine([2, 2, 2, 2])).toEqual({ values: [4, 4, 0, 0], gained: 8 });
    expect(g2048.mergeLine([2, 2, 4, 0])).toEqual({ values: [4, 4, 0, 0], gained: 4 });
    expect(g2048.mergeLine([0, 2, 0, 2])).toEqual({ values: [4, 0, 0, 0], gained: 4 });
    expect(g2048.mergeLine([4, 2, 2, 4]).values).toEqual([4, 4, 4, 0]);
  });

  it('tabuleiro inicial tem 2 peças e jogada inválida devolve null', () => {
    const b = g2048.startBoard(seeded(1));
    expect(b.cells.filter((v) => v !== 0)).toHaveLength(2);
    const stuck: g2048.Board = { cells: [2, 0, 0, 0, ...new Array<number>(12).fill(0)], score: 0, won: false, spawned: -1 };
    expect(g2048.move(stuck, 'left')).toBeNull();
    expect(g2048.move(stuck, 'right')).not.toBeNull();
  });

  it('move soma pontos, marca vitória e cria 1 peça nova', () => {
    const cells = new Array<number>(16).fill(0);
    cells[0] = 1024;
    cells[1] = 1024;
    const next = g2048.move({ cells, score: 0, won: false, spawned: -1 }, 'left', seeded(3))!;
    expect(next.score).toBe(2048);
    expect(next.won).toBe(true);
    expect(next.cells[0]).toBe(2048);
    expect(next.cells.filter((v) => v !== 0)).toHaveLength(2);
  });

  it('fim de jogo só com tabuleiro cheio e sem fusões', () => {
    const full = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    expect(g2048.isGameOver({ cells: full, score: 0, won: false, spawned: -1 })).toBe(true);
    const mergeable = [...full];
    mergeable[1] = 2;
    expect(g2048.isGameOver({ cells: mergeable, score: 0, won: false, spawned: -1 })).toBe(false);
  });
});

describe('Lights Out', () => {
  it('flip inverte a célula e as vizinhas (canto tem 3)', () => {
    const off = new Array<boolean>(25).fill(false);
    expect(lights.flip(off, 0).filter(Boolean)).toHaveLength(3);
    expect(lights.flip(off, 12).filter(Boolean)).toHaveLength(5);
  });

  it('toda partida tem solução: tocar nas células de `need` apaga tudo', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        let s = lights.startLights(level, seeded(seed));
        expect(lights.isSolved(s)).toBe(false);
        for (const i of [...s.need]) s = lights.tap(s, i);
        expect(lights.isSolved(s)).toBe(true);
        expect(s.need).toHaveLength(0);
      }
    }
  });

  it('dica aponta uma célula de need; resolvido não tem dica nem aceita toque', () => {
    const s = lights.startLights('easy', seeded(5));
    expect(s.need).toContain(lights.hint(s, seeded(1)));
    const solved = s.need.reduce((acc, i) => lights.tap(acc, i), s);
    expect(lights.hint(solved)).toBeNull();
    expect(lights.tap(solved, 0)).toBe(solved);
  });
});

describe('Campo Minado', () => {
  it('primeiro toque é seguro (casa e vizinhas) e sorteia o total de minas', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = mines.reveal(mines.startMines('easy'), 27, seeded(seed));
      expect(s.status).toBe('playing');
      expect(s.mines.size).toBe(8);
      expect(s.mines.has(27)).toBe(false);
      for (const n of mines.neighbors('easy', 27)) expect(s.mines.has(n)).toBe(false);
    }
  });

  it('vizinhos: canto 3, borda 5, miolo 8', () => {
    expect(mines.neighbors('easy', 0)).toHaveLength(3);
    expect(mines.neighbors('easy', 3)).toHaveLength(5);
    expect(mines.neighbors('easy', 27)).toHaveLength(8);
  });

  const withMines = (list: number[]): mines.MinesState => ({ ...mines.startMines('easy'), mines: new Set(list) });

  it('abrir mina perde; cascata abre zeros; vitória marca todas as minas', () => {
    const lost = mines.reveal(withMines([0, 63]), 0);
    expect(lost.status).toBe('lost');
    expect(lost.exploded).toBe(0);

    const board = mines.reveal(withMines([63]), 0);
    expect(board.opened.size).toBe(63); // tudo menos a mina; 0 está longe da mina, cascata abre quase tudo
    expect(board.status).toBe('won');
    expect(board.flagged.has(63)).toBe(true);
  });

  it('bandeira bloqueia abrir; chord abre vizinhas só com bandeiras suficientes', () => {
    let s = mines.reveal(withMines([0, 63]), 1); // 1 vizinha de 0 => número 1
    expect(mines.count(s, 1)).toBe(1);
    s = mines.toggleFlag(s, 0);
    expect(mines.reveal(s, 0)).toBe(s); // marcada: não abre
    const after = mines.chord(s, 1);
    expect(after.status).not.toBe('lost'); // a cascata dos zeros pode até vencer a partida
    expect(after.opened.has(8)).toBe(true);
    expect(mines.chord(mines.toggleFlag(s, 0), 1).opened.has(8)).toBe(false); // sem bandeira: nada muda
  });

  it('chord com bandeira errada explode', () => {
    let s = mines.reveal(withMines([0, 63]), 1);
    s = mines.toggleFlag(s, 8); // bandeira na casa errada
    expect(mines.chord(s, 1).status).toBe('lost');
  });

  it('tick só conta em partida iniciada e em andamento', () => {
    const fresh = mines.startMines('easy');
    expect(mines.tick(fresh)).toBe(fresh);
    const running = mines.reveal(fresh, 27, seeded(2));
    expect(mines.tick(running).seconds).toBe(1);
  });
});
