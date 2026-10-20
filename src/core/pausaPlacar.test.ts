// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClock } from './clock';
import { createGame, type GameDefinition } from './gameShell';
import { addScore, formatDate, loadScores, MAX_SCORES, nextSort, parseScores, sortScores, type ScoreEntry } from './scoreboard';
import { readJson, writeJson } from './storage';

const entry = (o: Partial<ScoreEntry> = {}): ScoreEntry => ({ date: 1, seconds: 60, errors: 0, level: 'easy', ...o });
const LEVELS = ['easy', 'medium', 'hard'];

describe('Clock pause/resume', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pausa mantendo segundos e retoma com o mesmo ouvinte', () => {
    const clock = createClock();
    const ticks: number[] = [];
    clock.start(10, (s) => ticks.push(s));
    vi.advanceTimersByTime(2000);
    clock.pause();
    expect(clock.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(ticks).toEqual([11, 12]);
    clock.resume();
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([11, 12, 13]);
    expect(clock.seconds).toBe(13);
  });

  it('resume sem start, ou depois de stop, não faz nada', () => {
    const clock = createClock();
    clock.resume();
    expect(clock.running).toBe(false);
    clock.start(0, () => {});
    clock.stop();
    clock.resume();
    expect(clock.running).toBe(false);
  });
});

describe('placar: armazenamento', () => {
  beforeEach(() => localStorage.clear());

  it('parse tolera lixo e descarta entradas inválidas', () => {
    expect(parseScores(null)).toEqual([]);
    expect(parseScores('x')).toEqual([]);
    expect(parseScores({})).toEqual([]);
    expect(parseScores([entry(), null, 3, { date: 'a' }, { ...entry(), seconds: -1 }, { ...entry(), level: 7 }])).toEqual([entry()]);
  });

  it('grava na chave do jogo e lê de volta', () => {
    addScore('sudoku', entry({ date: 5 }));
    expect(readJson('jj.sudoku.scores.v1')).toEqual([entry({ date: 5 })]);
    expect(loadScores('sudoku')).toHaveLength(1);
    expect(loadScores('outro')).toEqual([]);
  });

  it('ler lixo gravado devolve lista vazia', () => {
    localStorage.setItem('jj.sudoku.scores.v1', '{quebrado');
    expect(loadScores('sudoku')).toEqual([]);
  });

  it('guarda no máximo 200, descartando as mais antigas', () => {
    for (let d = 1; d <= MAX_SCORES + 5; d++) addScore('sudoku', entry({ date: d }));
    const all = loadScores('sudoku');
    expect(all).toHaveLength(MAX_SCORES);
    expect(Math.min(...all.map((e) => e.date))).toBe(6);
  });
});

describe('placar: ordenação', () => {
  const rows = [
    entry({ date: 1, seconds: 300, errors: 2, level: 'hard' }),
    entry({ date: 2, seconds: 100, errors: 5, level: 'easy' }),
    entry({ date: 3, seconds: 200, errors: 0, level: 'medium' }),
  ];
  const order = (key: 'date' | 'seconds' | 'errors' | 'level', dir: 1 | -1): number[] =>
    sortScores(rows, { key, dir }, LEVELS).map((e) => e.date);

  it('ordena pelos 4 campos nos dois sentidos', () => {
    expect(order('date', 1)).toEqual([1, 2, 3]);
    expect(order('date', -1)).toEqual([3, 2, 1]);
    expect(order('seconds', 1)).toEqual([2, 3, 1]);
    expect(order('errors', 1)).toEqual([3, 1, 2]);
    expect(order('errors', -1)).toEqual([2, 1, 3]);
  });

  it('dificuldade segue a ordem dos níveis, não a alfabética', () => {
    expect(order('level', 1)).toEqual([2, 3, 1]); // easy, medium, hard (alfabético seria easy, hard, medium)
    expect(order('level', -1)).toEqual([1, 3, 2]);
  });

  it('nível desconhecido vai para o fim e não altera o original', () => {
    const copy = [...rows];
    const out = sortScores([...rows, entry({ date: 9, level: '???' })], { key: 'level', dir: 1 }, LEVELS);
    expect(out.at(-1)?.date).toBe(9);
    expect(rows).toEqual(copy);
  });

  it('clicar na mesma coluna inverte; coluna nova começa crescente', () => {
    expect(nextSort({ key: 'date', dir: -1 }, 'date')).toEqual({ key: 'date', dir: 1 });
    expect(nextSort({ key: 'date', dir: 1 }, 'date')).toEqual({ key: 'date', dir: -1 });
    expect(nextSort({ key: 'date', dir: -1 }, 'errors')).toEqual({ key: 'errors', dir: 1 });
  });

  it('formata a data como dd/mm/aaaa hh:mm', () => {
    expect(formatDate(new Date(2026, 9, 5, 7, 3).getTime())).toBe('05/10/2026 07:03');
  });
});

describe('shell: pausa e placar', () => {
  interface Counter { level: 'easy' | 'hard'; n: number; errors: number }
  const def = (over: Partial<GameDefinition<Counter, 'easy' | 'hard'>> = {}): GameDefinition<Counter, 'easy' | 'hard'> => ({
    meta: { id: 'counter', title: 'Contador', description: 't', icon: '1' },
    help: '<p>x</p>',
    levels: [{ id: 'easy', label: 'Fácil' }, { id: 'hard', label: 'Difícil' }],
    newGame: (level) => ({ level, n: 0, errors: 1 }),
    levelOf: (s) => s.level,
    save: { key: 'jj.counter.game.v1', parse: (r) => (r as Counter | null), serialize: (s) => s, isOver: (s) => s.n >= 3 },
    resumeLabel: (s) => `${s.n}`,
    pausable: true,
    scores: { metrics: (s) => ({ seconds: 42, errors: s.errors }) },
    mountView: (body, host) => {
      const b = document.createElement('button');
      b.id = 'inc';
      b.addEventListener('click', () => host.update({ ...host.state(), n: host.state().n + 1 }));
      body.appendChild(b);
      host.clock.start(0, () => {});
      return { render: () => {} };
    },
    finish: () => ({ title: 'Fim', html: '<p>ok</p>' }),
    ...over,
  });
  const ctx = { prefs: { theme: 'system' as const, popup: true, autoNotes: false, hlMatch: true, hlLines: true, hlBox: true }, savePrefs: () => {} };
  const mount = (d = def()) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    createGame(d).mount(root, ctx);
    return root;
  };
  const byText = (root: HTMLElement, t: string): HTMLButtonElement =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
  const start = (root: HTMLElement): void => byText(root, 'Fácil').click();
  const inc = (root: HTMLElement): void => (root.querySelector('#inc') as HTMLButtonElement).click();

  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    writeJson('jj.counter.help.v1', true);
    location.hash = '#/counter';
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('Pausar para o cronômetro e cobre; Continuar retoma', () => {
    const root = mount();
    start(root);
    const cover = root.querySelector('.pauseCover') as HTMLElement;
    expect(cover.hidden).toBe(true);
    byText(root, 'Pausar').click();
    expect(cover.hidden).toBe(false);
    expect(cover.textContent).toContain('Jogo pausado');
    expect(byText(root, 'Continuar')).toBeTruthy();
    expect((root.querySelector('#inc') as HTMLElement).inert).toBe(true);
    byText(cover, 'Continuar').click();
    expect(cover.hidden).toBe(true);
    expect(byText(root, 'Pausar')).toBeTruthy();
    expect((root.querySelector('#inc') as HTMLElement).inert).toBe(false);
  });

  it('sem pausable não há botão; sair para o menu limpa a pausa', () => {
    const plain = mount(def({ pausable: false }));
    start(plain);
    expect(byText(plain, 'Pausar')).toBeUndefined();

    document.body.replaceChildren();
    const root = mount();
    start(root);
    byText(root, 'Pausar').click();
    byText(root, 'Menu').click();
    start(root);
    expect(byText(root, 'Pausar')).toBeTruthy();
    expect((root.querySelector('.pauseCover') as HTMLElement).hidden).toBe(true);
  });

  it('grava a partida uma única vez ao terminar e não grava antes', () => {
    const root = mount();
    start(root);
    inc(root);
    inc(root);
    expect(loadScoresOf()).toHaveLength(0);
    inc(root);
    expect(loadScoresOf()).toHaveLength(1);
    expect(loadScoresOf()[0]).toMatchObject({ seconds: 42, errors: 1, level: 'easy' });
    inc(root); // commit repetido depois do fim
    expect(loadScoresOf()).toHaveLength(1);
    expect(root.querySelectorAll('.scoreboard tbody tr')).toHaveLength(1);
  });

  it('botão Placar mostra/oculta e lembra a escolha por jogo', () => {
    const root = mount();
    start(root);
    const sb = root.querySelector('.scoreboard') as HTMLElement;
    expect(sb.hidden).toBe(false);
    expect(byText(root, 'Placar').textContent).toBe('Placar ▾');
    byText(root, 'Placar').click();
    expect(sb.hidden).toBe(true);
    expect(byText(root, 'Placar').textContent).toBe('Placar ▸');

    byText(root, 'Menu').click();
    start(root);
    expect((root.querySelector('.scoreboard') as HTMLElement).hidden).toBe(true);
  });

  it('sem scores não há botão nem tabela', () => {
    const root = mount(def({ scores: undefined }));
    start(root);
    expect(byText(root, 'Placar')).toBeUndefined();
    expect(root.querySelector('.scoreboard')).toBeNull();
  });

  const loadScoresOf = (): ScoreEntry[] => loadScores('counter');
});
