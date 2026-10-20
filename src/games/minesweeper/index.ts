import { button, el, fmtTime } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import { createRecordBook } from '../../core/records';
import {
  LEVELS, cellsOf, chord, count, minesLeft, reveal, startMines, tick, toggleFlag,
  type MinesLevelId, type MinesState,
} from './domain';

const IDS = Object.keys(LEVELS) as MinesLevelId[];
const LONG_PRESS_MS = 420;

const HELP = `<p>Abra todas as casas que <strong>não</strong> têm mina. O número mostra quantas minas há nas 8 casas ao redor.</p>
     <p>Toque para abrir. <strong>Segure</strong> (ou clique com o botão direito) para marcar uma bandeira; ou ligue o modo bandeira. Tocar num número com bandeiras suficientes abre as vizinhas restantes.</p>
     <p>A primeira casa aberta é sempre segura.</p>`;

const isIndexList = (v: unknown, max: number): v is number[] =>
  Array.isArray(v) && v.every((i) => Number.isInteger(i) && i >= 0 && i < max);

function parseSaved(raw: unknown): MinesState | null {
  const r = raw as (Record<string, unknown> & { level?: MinesLevelId }) | null;
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

function mountView(body: HTMLElement, host: GameHost<MinesState>) {
  let flagMode = false;
  const { cols } = LEVELS[host.state().level];
  const board = el('div', 'minesBoard');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Campo minado');
  board.style.setProperty('--cols', String(cols));
  const apply = (fn: (s: MinesState, i: number) => MinesState, i: number) => host.update(fn(host.state(), i));

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
      if (flagMode) apply(toggleFlag, i);
      else if (host.state().opened.has(i)) apply(chord, i);
      else apply((s, idx) => reveal(s, idx), i);
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      apply(toggleFlag, i);
    });
  }

  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < cellsOf(host.state().level); i++) {
    const b = el('button', 'mcell');
    b.type = 'button';
    attachCell(b, i);
    cells.push(b);
    board.appendChild(b);
  }
  const flagBtn = button('🚩 Bandeira', 'btn', () => {
    flagMode = !flagMode;
    flagBtn.classList.toggle('on', flagMode);
    flagBtn.setAttribute('aria-pressed', String(flagMode));
  });
  flagBtn.setAttribute('aria-pressed', 'false');
  const controls = el('div', 'controls');
  controls.append(flagBtn, button('Reiniciar', 'btn', host.newGame));
  body.append(board, controls);

  return {
    render(g: MinesState): void {
      cells.forEach((b, i) => {
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
    },
  };
}

export const minesweeper = createGame<MinesState, MinesLevelId>({
  meta: { id: 'minesweeper', title: 'Campo Minado', description: 'Abra as casas sem pisar em nenhuma mina.', icon: '💣' },
  help: HELP,
  levels: IDS.map((id) => {
    const { rows, cols, mines } = LEVELS[id];
    return { id, label: LEVELS[id].label, detail: `${rows}×${cols} · ${mines} minas` };
  }),
  newGame: (level) => startMines(level),
  levelOf: (s) => s.level,
  save: {
    key: 'jj.minesweeper.game.v1',
    parse: parseSaved,
    serialize: (s) => ({ level: s.level, mines: [...s.mines], opened: [...s.opened], flagged: [...s.flagged], seconds: s.seconds }),
    isOver: (s) => s.status !== 'playing',
  },
  records: createRecordBook<MinesLevelId>((l) => `jj.minesweeper.best.${l}.v1`, fmtTime),
  resumeLabel: (s) => `${LEVELS[s.level].label} · ${fmtTime(s.seconds)}`,
  className: 'mines',
  statusText: (s) => `${LEVELS[s.level].label} · 💣 ${minesLeft(s)} · ${fmtTime(s.seconds)}`,
  mountView,
  onOpen: (s, host) => host.clock.start(s.seconds, () => host.update(tick(host.state()))),
  finish: (s, ctx) => {
    if (s.status === 'lost') return { title: 'Boom!', html: '<p>Você pisou numa mina.</p>' };
    const time = Math.max(s.seconds, 1);
    return { title: 'Campo limpo!', html: `<p>Você terminou em ${fmtTime(time)}${ctx.submitRecord(time) ? ' — novo recorde!' : ''}.</p>` };
  },
});
