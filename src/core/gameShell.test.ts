// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, type GameDefinition } from './gameShell';
import { persistedFlag } from './option';
import { createRecordBook } from './records';
import { readJson, writeJson } from './storage';

interface Counter { level: 'easy' | 'hard'; n: number; auto: boolean }
type Level = Counter['level'];

const GAME_KEY = 'jj.counter.game.v1';
const HELP_KEY = 'jj.counter.help.v1';
const BEST_KEY = (l: Level): string => `jj.counter.best.${l}.v1`;

// ---- helpers ----
function makeDef(overrides: Partial<GameDefinition<Counter, Level>> = {}): GameDefinition<Counter, Level> {
  return {
    meta: { id: 'counter', title: 'Contador', description: 'teste', icon: '1' },
    help: '<p>ajuda</p>',
    levels: [{ id: 'easy', label: 'Fácil' }, { id: 'hard', label: 'Difícil', detail: 'mais difícil' }],
    newGame: (level, o) => ({ level, n: 0, auto: o.auto === true }),
    levelOf: (s) => s.level,
    save: {
      key: GAME_KEY,
      parse: (raw) => (raw && typeof (raw as Counter).n === 'number' ? (raw as Counter) : null),
      serialize: (s) => s,
      isOver: (s) => s.n >= 3,
    },
    resumeLabel: (s) => `${s.level} · ${s.n}/3`,
    options: { auto: persistedFlag('jj.counter.auto.v1', true) },
    records: createRecordBook<Level>(BEST_KEY, (v) => `${v} toques`),
    statusText: (s) => `${s.n}/3`,
    mountView: (body, host) => {
      const b = document.createElement('button');
      b.id = 'inc';
      b.addEventListener('click', () => host.update({ ...host.state(), n: host.state().n + 1 }));
      body.appendChild(b);
      return { render: (s) => { b.textContent = String(s.n); } };
    },
    finish: (s, ctx) => ({ title: 'Fim', html: `<p>${ctx.submitRecord(s.n) ? 'recorde' : 'ok'}</p>` }),
    ...overrides,
  };
}

const mountGame = (def = makeDef()) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const dispose = createGame(def).mount(root, { prefs: { theme: "system", popup: true, autoNotes: false, hlMatch: true, hlLines: true, hlBox: true }, savePrefs: () => {} });
  return { root, dispose };
};
const byText = (root: HTMLElement, text: string): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const click = (root: HTMLElement, text: string): void => byText(root, text).click();
const inc = (root: HTMLElement): void => (root.querySelector('#inc') as HTMLButtonElement).click();

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  writeJson(HELP_KEY, true); // a ajuda da 1ª abertura é testada à parte
  location.hash = '#/counter';
});

describe('menu', () => {
  it('lista níveis, Como jogar e Voltar; sem Continuar quando não há partida', () => {
    const { root } = mountGame();
    expect(byText(root, 'Fácil')).toBeTruthy();
    expect(byText(root, 'mais difícil')).toBeTruthy();
    expect(byText(root, 'Como jogar')).toBeTruthy();
    expect(byText(root, 'Voltar aos jogos')).toBeTruthy();
    expect(byText(root, 'Continuar')).toBeUndefined();
  });

  it('abre a ajuda sozinha só na primeira vez', () => {
    localStorage.clear();
    const first = mountGame();
    expect(first.root.querySelector('dialog.win')).toBeTruthy();
    expect(readJson(HELP_KEY)).toBeNull();
    (first.root.querySelector('dialog .winBtns button') as HTMLButtonElement).click();
    expect(readJson(HELP_KEY)).toBe(true);
    const second = mountGame();
    expect(second.root.querySelector('dialog.win')).toBeNull();
  });

  it('"← Voltar aos jogos" zera o hash', () => {
    const { root } = mountGame();
    click(root, 'Voltar aos jogos');
    expect(location.hash).toBe('');
  });

  it('mostra o recorde do nível', () => {
    writeJson(BEST_KEY('easy'), 7);
    const { root } = mountGame();
    expect(byText(root, 'Fácil').textContent).toContain('Recorde: 7 toques');
  });
});

describe('jogar e continuar', () => {
  it('nova partida passa as opções persistidas ao newGame e salva a cada jogada', () => {
    writeJson('jj.counter.auto.v1', false);
    const { root } = mountGame();
    click(root, 'Fácil');
    inc(root);
    expect(readJson(GAME_KEY)).toEqual({ level: 'easy', n: 1, auto: false });
    expect(root.querySelector('.shellStatus')!.textContent).toBe('1/3');
  });

  it('Menu guarda a partida e o menu oferece Continuar com o rótulo do jogo', () => {
    const { root } = mountGame();
    click(root, 'Difícil');
    inc(root);
    click(root, 'Menu');
    click(root, 'Continuar — hard · 1/3');
    expect(root.querySelector('#inc')!.textContent).toBe('1');
  });

  it('retoma partida salva em sessão anterior (mesma chave e formato)', () => {
    writeJson(GAME_KEY, { level: 'easy', n: 2, auto: true });
    const { root } = mountGame();
    click(root, 'Continuar');
    expect(root.querySelector('#inc')!.textContent).toBe('2');
  });

  it('progresso corrompido é ignorado', () => {
    writeJson(GAME_KEY, { lixo: true });
    expect(byText(mountGame().root, 'Continuar')).toBeUndefined();
  });

  it('Novo jogo descarta a partida salva', () => {
    writeJson(GAME_KEY, { level: 'easy', n: 2, auto: true });
    const { root } = mountGame();
    click(root, 'Fácil');
    expect(readJson(GAME_KEY)).toBeNull();
  });
});

describe('fim de jogo', () => {
  const playToEnd = (root: HTMLElement): void => { click(root, 'Fácil'); inc(root); inc(root); inc(root); };

  it('limpa o progresso, abre o diálogo e registra recorde', () => {
    const { root } = mountGame();
    playToEnd(root);
    expect(readJson(GAME_KEY)).toBeNull();
    expect(root.querySelector('dialog h2')!.textContent).toBe('Fim');
    expect(root.querySelector('dialog .winBody')!.textContent).toBe('recorde');
    expect(readJson(BEST_KEY('easy'))).toBe(3);
  });

  it('não informa recorde quando não melhorou', () => {
    writeJson(BEST_KEY('easy'), 2);
    const { root } = mountGame();
    playToEnd(root);
    expect(root.querySelector('dialog .winBody')!.textContent).toBe('ok');
    expect(readJson(BEST_KEY('easy'))).toBe(2);
  });

  it('"Novo jogo" do diálogo recomeça no mesmo nível', () => {
    const { root } = mountGame();
    playToEnd(root);
    (root.querySelector('dialog .winBtns .primary') as HTMLButtonElement).click();
    expect(root.querySelector('#inc')!.textContent).toBe('0');
  });

  it('"Menu" do diálogo volta ao menu sem Continuar', () => {
    const { root } = mountGame();
    playToEnd(root);
    (root.querySelectorAll('dialog .winBtns button')[1] as HTMLButtonElement).click();
    expect(byText(root, 'Fácil')).toBeTruthy();
    expect(byText(root, 'Continuar')).toBeUndefined();
  });
});

describe('desmontagem', () => {
  it('para o cronômetro, destrói a view e esvazia o root', () => {
    let destroyed = false;
    const def = makeDef({
      mountView: (body) => { body.appendChild(document.createElement('i')); return { render: () => {}, destroy: () => { destroyed = true; } }; },
      onOpen: (_s, host) => host.clock.start(0, () => {}),
    });
    const { root, dispose } = mountGame(def);
    click(root, 'Fácil');
    dispose();
    expect(destroyed).toBe(true);
    expect(root.childElementCount).toBe(0);
  });
});
