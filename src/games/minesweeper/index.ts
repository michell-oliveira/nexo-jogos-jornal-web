import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, fmtTime, helpController, loadBest, recordBest, renderMenu } from '../../core/ui';
import {
  LEVELS, cellsOf, chord, count, minesLeft, reveal, started, startMines, tick, toggleFlag,
  type MinesLevelId, type MinesState,
} from './domain';

const GAME_KEY = 'jj.minesweeper.game.v1';
const bestKey = (l: MinesLevelId): string => `jj.minesweeper.best.${l}.v1`;
const IDS = Object.keys(LEVELS) as MinesLevelId[];
const LONG_PRESS_MS = 420;

const isIndexList = (v: unknown, max: number): v is number[] =>
  Array.isArray(v) && v.every((i) => Number.isInteger(i) && i >= 0 && i < max);

function loadSaved(): MinesState | null {
  const r = readJson(GAME_KEY) as (Record<string, unknown> & { level?: MinesLevelId }) | null;
  if (!r || !IDS.includes(r.level as MinesLevelId)) return null;
  const level = r.level as MinesLevelId;
  const max = cellsOf(level);
  if (!isIndexList(r.mines, max) || !isIndexList(r.opened, max) || !isIndexList(r.flagged, max)) return null;
  if (r.mines.length !== LEVELS[level].mines) return null;
  return {
    level, mines: new Set(r.mines), opened: new Set(r.opened), flagged: new Set(r.flagged),
    status: 'playing', exploded: null, seconds: Number(r.seconds) || 0,
  };
}

const serialize = (s: MinesState) => ({
  level: s.level, mines: [...s.mines], opened: [...s.opened], flagged: [...s.flagged], seconds: s.seconds,
});

function mount(root: HTMLElement): () => void {
  let game: MinesState | null = null;
  let flagMode = false;
  let timerId = 0;
  const help = helpController(
    root, 'minesweeper', 'Como jogar',
    `<p>Abra todas as casas que <strong>não</strong> têm mina. O número mostra quantas minas há nas 8 casas ao redor.</p>
     <p>Toque para abrir. <strong>Segure</strong> (ou clique com o botão direito) para marcar uma bandeira; ou ligue o modo bandeira. Tocar num número com bandeiras suficientes abre as vizinhas restantes.</p>
     <p>A primeira casa aberta é sempre segura.</p>`,
  );

  const stopTimer = (): void => {
    window.clearInterval(timerId);
    timerId = 0;
  };

  function showMenu(): void {
    stopTimer();
    if (game && game.status === 'playing' && started(game)) writeJson(GAME_KEY, serialize(game));
    game = null;
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar partida — ${LEVELS[saved.level].label} · ${fmtTime(saved.seconds)}`,
        onContinue: () => show(saved),
      },
      levels: IDS.map((id) => {
        const best = loadBest(bestKey(id));
        const { rows, cols, mines } = LEVELS[id];
        return { id, label: LEVELS[id].label, detail: `${rows}×${cols} · ${mines} minas${best ? ` · Recorde: ${fmtTime(best)}` : ''}` };
      }),
      onStart: (id) => {
        removeKey(GAME_KEY);
        show(startMines(id as MinesLevelId));
      },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function show(s: MinesState): void {
    stopTimer();
    game = s;
    flagMode = false;
    const { cols } = LEVELS[s.level];
    root.innerHTML = `
      <section class="mines">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span>${LEVELS[s.level].label}</span><span id="left"></span><span id="timer"></span></div>
        <div id="board" class="minesBoard" role="grid" aria-label="Campo minado" style="--cols:${cols}"></div>
        <div class="controls"></div>
      </section>`;
    const board = root.querySelector<HTMLElement>('#board')!;
    for (let i = 0; i < cellsOf(s.level); i++) {
      const b = el('button', 'mcell');
      b.type = 'button';
      attachCell(b, i);
      board.appendChild(b);
    }
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    const flagBtn = button('🚩 Bandeira', 'btn', () => {
      flagMode = !flagMode;
      flagBtn.classList.toggle('on', flagMode);
      flagBtn.setAttribute('aria-pressed', String(flagMode));
    });
    flagBtn.setAttribute('aria-pressed', 'false');
    root.querySelector('.controls')!.append(
      flagBtn,
      button('Reiniciar', 'btn', () => game && (removeKey(GAME_KEY), show(startMines(game.level)))),
      button('Como jogar', 'btn', help.open),
    );
    render();
    timerId = window.setInterval(onTick, 1000);
  }

  /** Toque curto abre/marca; segurar ou botão direito marca sempre. */
  function attachCell(b: HTMLButtonElement, i: number): void {
    let timer = 0;
    let longDone = false;
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      longDone = false;
      timer = window.setTimeout(() => {
        longDone = true;
        apply(toggleFlag, i);
      }, LONG_PRESS_MS);
    });
    const cancel = (): void => window.clearTimeout(timer);
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('click', () => {
      if (longDone) {
        longDone = false;
        return;
      }
      if (!game) return;
      if (flagMode) apply(toggleFlag, i);
      else if (game.opened.has(i)) apply(chord, i);
      else apply((s, idx) => reveal(s, idx), i);
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      apply(toggleFlag, i);
    });
  }

  function apply(fn: (s: MinesState, i: number) => MinesState, i: number): void {
    if (!game) return;
    const next = fn(game, i);
    if (next === game) return;
    game = next;
    if (next.status === 'playing') {
      if (started(next)) writeJson(GAME_KEY, serialize(next));
    } else finish(next);
    render();
  }

  function finish(s: MinesState): void {
    stopTimer();
    removeKey(GAME_KEY);
    if (s.status === 'won') {
      const time = Math.max(s.seconds, 1);
      const record = recordBest(bestKey(s.level), time);
      dialog(root, {
        title: 'Campo limpo!',
        html: `<p>Você terminou em ${fmtTime(time)}${record ? ' — novo recorde!' : ''}.</p>`,
        buttons: [{ label: 'Jogar outro', primary: true, action: () => show(startMines(s.level)) }, { label: 'Menu', action: showMenu }],
      });
    } else {
      dialog(root, {
        title: 'Boom!',
        html: '<p>Você pisou numa mina.</p>',
        buttons: [{ label: 'Tentar de novo', primary: true, action: () => show(startMines(s.level)) }, { label: 'Menu', action: showMenu }],
      });
    }
  }

  function onTick(): void {
    if (!game) return;
    const next = tick(game);
    if (next === game) return;
    game = next;
    if (next.seconds % 5 === 0) writeJson(GAME_KEY, serialize(next));
    root.querySelector('#timer')!.textContent = fmtTime(next.seconds);
  }

  function render(): void {
    if (!game) return;
    const g = game;
    root.querySelectorAll<HTMLButtonElement>('.mcell').forEach((b, i) => {
      const open = g.opened.has(i);
      const flagged = g.flagged.has(i);
      const mine = g.mines.has(i);
      const showMine = g.status === 'lost' && mine && !flagged;
      const wrongFlag = g.status === 'lost' && flagged && !mine;
      const n = open && !mine ? count(g, i) : 0;
      b.className = 'mcell' + (open ? ' open' : '') + (n ? ` n${n}` : '') + (g.exploded === i ? ' boom' : '');
      b.textContent = g.exploded === i || showMine ? '💣' : wrongFlag ? '❌' : flagged ? '🚩' : n ? String(n) : '';
      b.setAttribute('aria-label', open ? (n ? `${n} minas ao redor` : 'aberta, vazia') : flagged ? 'bandeira' : 'fechada');
    });
    root.querySelector('#left')!.textContent = `💣 ${minesLeft(g)}`;
    root.querySelector('#timer')!.textContent = fmtTime(g.seconds);
  }

  showMenu();
  return () => {
    stopTimer();
    if (game && game.status === 'playing' && started(game)) writeJson(GAME_KEY, serialize(game));
    root.replaceChildren();
  };
}

export const minesweeper: GameModule = {
  id: 'minesweeper',
  title: 'Campo Minado',
  description: 'Abra as casas sem pisar em nenhuma mina.',
  icon: '💣',
  mount,
};
