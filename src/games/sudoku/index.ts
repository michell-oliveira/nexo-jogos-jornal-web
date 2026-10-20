import { fmtTime } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import { Game } from './domain/game';
import { DIFFICULTIES, type DifficultyId } from './domain/generator';
import { computeHighlights, findConflicts, peersOf, type CellHighlight } from './domain/highlight';
import type { GameContext } from '../../core/types';

const HELP = `<p>Preencha a grade 9×9 de modo que cada <strong>linha</strong>, cada <strong>coluna</strong> e cada quadrado 3×3 tenham os números de 1 a 9, sem repetir.</p>
     <p>Toque numa célula e escolha o número. No modo <strong>Anotação</strong> você marca candidatos pequenos; <strong>Desfazer</strong> volta a última jogada. Números repetidos aparecem em vermelho.</p>`;

const BOARD = `
<label class="flag"><input id="popupFlag" type="checkbox" /> Abrir teclado ao clicar na célula</label>
<div class="boardWrap">
  <div id="board" class="board" role="grid" aria-label="Tabuleiro de Sudoku"></div>
  <div id="popup" class="popup" role="dialog" aria-label="Escolher número" hidden></div>
</div>
<div id="numRow" class="numRow" hidden></div>
<div class="controls">
  <div class="seg" role="group" aria-label="Modo de preenchimento">
    <button id="modeNormal" type="button" class="on">Normal</button>
    <button id="modeNotes" type="button">Anotação</button>
  </div>
  <button id="undoBtn" class="btn" type="button">Desfazer</button>
</div>
<label class="flag"><input id="autoNotes" type="checkbox" /> Anotações automáticas</label>
`;

function mountView(body: HTMLElement, host: GameHost<Game>, ctx: GameContext) {
  body.innerHTML = BOARD;
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = body.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`elemento #${id} ausente`);
    return el;
  };
  // Listeners no document precisam sair junto com a tela, senão acumulam a cada troca de jogo.
  const offs: (() => void)[] = [];
  const on = <K extends keyof DocumentEventMap>(ev: K, fn: (e: DocumentEventMap[K]) => void): void => {
    document.addEventListener(ev, fn);
    offs.push(() => document.removeEventListener(ev, fn));
  };

  const prefs = ctx.prefs;
  const game = host.state();
  let selected = -1;
  let notesMode = false;
  let popupCell = -1;

  const board = $('board');
  const popup = $('popup');
  const numRow = $('numRow');
  const popupFlag = $<HTMLInputElement>('popupFlag');
  const autoNotesBox = $<HTMLInputElement>('autoNotes');

  // ---------- Tabuleiro ----------

  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (col % 3 === 2 && col < 8 ? ' bR' : '') + (row % 3 === 2 && row < 8 ? ' bB' : '');
    b.setAttribute('role', 'gridcell');
    b.dataset.i = String(i);
    b.addEventListener('click', () => onCellClick(i));
    board.appendChild(b);
    cells.push(b);
  }

  function notesHtml(mask: number): string {
    let out = '<span class="notes">';
    for (let d = 1; d <= 9; d++) out += `<span>${mask & (1 << d) ? d : ''}</span>`;
    return out + '</span>';
  }

  function render(): void {
    const g = game;
    const digit = selected >= 0 ? g.values[selected]! : 0;
    const hl: CellHighlight[] = digit
      ? computeHighlights(g.values, digit)
      : selected >= 0
        ? peersOf(selected)
        : new Array<CellHighlight>(81).fill('none');
    const conflicts = findConflicts(g.values);

    cells.forEach((el, i) => {
      const v = g.values[i]!;
      const mask = v === 0 ? (autoNotesBox.checked ? g.autoNotes(i) : g.notes[i]!) : 0;
      const html = v ? String(v) : mask ? notesHtml(mask) : '';
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('related', hl[i] === 'related');
      el.classList.toggle('match', hl[i] === 'match');
      el.classList.toggle('user', v !== 0 && !g.isGiven(i));
      el.classList.toggle('given', v !== 0 && g.isGiven(i));
      el.classList.toggle('filled', v !== 0);
      el.classList.toggle('conflict', conflicts[i] === true);
      el.classList.toggle('selected', i === selected);
      el.setAttribute(
        'aria-label',
        `Linha ${Math.floor(i / 9) + 1}, coluna ${(i % 9) + 1}, ${v ? `número ${v}${g.isGiven(i) ? ' fixo' : ''}` : 'vazia'}`,
      );
    });
    ($('undoBtn') as HTMLButtonElement).disabled = !g.canUndo;
    refreshPadNotes();
    if (g.isSolved()) closePopup();
  }

  /** Destaca no teclado os dígitos que já são anotação da célula selecionada (modo Anotação). */
  function refreshPadNotes(): void {
    const mask = selected >= 0 && notesMode ? game.notes[selected]! : 0;
    for (const btn of [...popup.querySelectorAll<HTMLButtonElement>('[data-d]'), ...numRow.querySelectorAll<HTMLButtonElement>('[data-d]')]) {
      btn.classList.toggle('noted', (mask & (1 << Number(btn.dataset.d))) !== 0);
    }
  }

  // ---------- Teclados (flutuante e em linha) ----------

  function buildPad(padHost: HTMLElement, withErase: 'row' | 'block'): void {
    padHost.replaceChildren();
    for (let d = 1; d <= 9; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(d);
      b.dataset.d = String(d);
      b.setAttribute('aria-label', `Número ${d}`);
      padHost.appendChild(b);
    }
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'erase';
    e.dataset.erase = '1';
    e.textContent = withErase === 'row' ? '✕' : '✕ Apagar';
    e.setAttribute('aria-label', 'Apagar');
    padHost.appendChild(e);
  }
  buildPad(popup, 'block');
  buildPad(numRow, 'row');

  function onPadPress(target: EventTarget | null, fromPopup: boolean): void {
    const btn = (target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!btn || selected < 0) return;
    if (btn.dataset.erase) game.clear(selected);
    else applyDigit(selected, Number(btn.dataset.d));
    if (fromPopup && (btn.dataset.erase || !notesMode)) closePopup();
    host.commit();
  }

  popup.addEventListener('click', (e) => onPadPress(e.target, true));
  numRow.addEventListener('click', (e) => onPadPress(e.target, false));

  function applyDigit(i: number, digit: number): void {
    if (notesMode) game.toggleNote(i, digit);
    else game.setValue(i, digit);
  }

  function openPopup(i: number): void {
    popupCell = i;
    popup.hidden = false;
    const wrap = popup.parentElement as HTMLElement;
    const w = wrap.getBoundingClientRect();
    const c = cells[i]!.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const left = Math.min(Math.max(c.left - w.left + c.width / 2 - pw / 2, 0), w.width - pw);
    let top = c.bottom - w.top + 6;
    if (top + ph > w.height) top = c.top - w.top - ph - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(top, 0)}px`;
  }

  function closePopup(): void {
    popupCell = -1;
    popup.hidden = true;
  }

  function syncPadMode(): void {
    numRow.hidden = prefs.popup;
    if (!prefs.popup) closePopup();
  }

  // ---------- Fluxo da partida ----------

  function onCellClick(i: number): void {
    selected = i;
    if (prefs.popup && !game.isGiven(i)) openPopup(i);
    else closePopup();
    render();
  }

  // O cronômetro é do núcleo (inteiro em segundos); o jogo continua guardando `elapsed` no progresso.
  const startClock = (): void =>
    host.clock.start(Math.floor(game.elapsed), (secs) => {
      game.elapsed = secs;
      host.commit();
    });

  on('visibilitychange', () => {
    if (game.isSolved()) return;
    if (document.hidden) {
      host.clock.stop();
      host.commit();
    } else startClock();
  });

  // ---------- Controles ----------

  function syncModeButtons(): void {
    $('modeNormal').classList.toggle('on', !notesMode);
    $('modeNotes').classList.toggle('on', notesMode);
  }
  $('modeNormal').addEventListener('click', () => { notesMode = false; syncModeButtons(); refreshPadNotes(); });
  $('modeNotes').addEventListener('click', () => { notesMode = true; syncModeButtons(); refreshPadNotes(); });
  $('undoBtn').addEventListener('click', () => {
    if (game.undo()) host.commit();
  });

  popupFlag.checked = prefs.popup;
  popupFlag.addEventListener('change', () => {
    prefs.popup = popupFlag.checked;
    ctx.savePrefs();
    syncPadMode();
  });
  autoNotesBox.checked = prefs.autoNotes;
  autoNotesBox.addEventListener('change', () => {
    prefs.autoNotes = autoNotesBox.checked;
    ctx.savePrefs();
    render();
  });

  // Clicar fora do teclado flutuante fecha; Esc também.
  on('pointerdown', (e) => {
    const t = e.target as Node;
    if (popupCell >= 0 && !popup.contains(t)) closePopup();
  });

  on('keydown', (e) => {
    if (e.key === 'Escape') {
      closePopup();
      return;
    }
    if (game.isSolved() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key) && selected >= 0) {
      applyDigit(selected, Number(e.key));
      if (!notesMode) closePopup();
      host.commit();
    } else if (['Backspace', 'Delete', '0'].includes(e.key) && selected >= 0) {
      game.clear(selected);
      host.commit();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const base = selected < 0 ? 40 : selected;
      const r = Math.floor(base / 9);
      const c = base % 9;
      const nr = Math.min(8, Math.max(0, r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)));
      const nc = Math.min(8, Math.max(0, c + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)));
      selected = nr * 9 + nc;
      closePopup();
      cells[selected]?.focus();
      render();
    }
  });

  syncPadMode();
  startClock();

  return { render, destroy: () => offs.forEach((off) => off()) };
}

export const sudoku = createGame<Game, DifficultyId>({
  meta: { id: 'sudoku', title: 'Sudoku', description: 'Complete a grade 9×9 sem repetir números.', icon: '▦' },
  help: HELP,
  levels: (Object.entries(DIFFICULTIES) as [DifficultyId, { label: string }][]).map(([id, info]) => ({ id, label: info.label })),
  newGame: (level) => Game.create(level),
  levelOf: (g) => g.difficulty,
  save: {
    key: 'jj.sudoku.game.v1',
    parse: (raw) => Game.restore(raw),
    serialize: (g) => g.snapshot(),
    isOver: (g) => g.isSolved(),
  },
  resumeLabel: (g) => `${DIFFICULTIES[g.difficulty].label} · ${fmtTime(g.elapsed)}`,
  statusText: (g) => `${DIFFICULTIES[g.difficulty].label} · ${fmtTime(g.elapsed)}`,
  mountView,
  onOpen: (_g, host) => host.commit(),
  finish: (g) => ({
    title: 'Parabéns!',
    html: `<p>Você terminou um puzzle ${DIFFICULTIES[g.difficulty].label.toLowerCase()} em ${fmtTime(g.elapsed)}.</p>`,
  }),
});
