import { beforeEach, describe, expect, it } from 'vitest';
import { readJson, removeKey, setStorageUser, writeJson } from './storage';

function stubLocalStorage(): Map<string, string> {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
  // Object.keys(localStorage) precisa listar as chaves, como no navegador
  return data;
}

describe('armazenamento por usuário', () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = stubLocalStorage();
    setStorageUser('', false);
  });

  it('cada usuário vê só o próprio progresso, inclusive ao remover', () => {
    setStorageUser('michell', false);
    writeJson('jj.sudoku.game.v1', { n: 1 });
    setStorageUser('natalia.oliveira', false);
    expect(readJson('jj.sudoku.game.v1')).toBeNull();
    writeJson('jj.sudoku.game.v1', { n: 2 });
    removeKey('jj.sudoku.game.v1');
    expect(readJson('jj.sudoku.game.v1')).toBeNull();
    setStorageUser('michell', false);
    expect(readJson('jj.sudoku.game.v1')).toEqual({ n: 1 });
    expect([...data.keys()]).toEqual(['jj.u.michell.sudoku.game.v1']);
  });

  it('o admin adota o que foi salvo antes da separação; outro usuário não', () => {
    data.set('jj.sudoku.game.v1', JSON.stringify({ velho: true }));
    setStorageUser('natalia.oliveira', false);
    expect(readJson('jj.sudoku.game.v1')).toBeNull();
    setStorageUser('michell', true);
    expect(readJson('jj.sudoku.game.v1')).toEqual({ velho: true });
    expect(data.has('jj.sudoku.game.v1')).toBe(false);
  });
});
