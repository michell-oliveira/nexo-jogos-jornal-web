import { Game } from './domain/game';
import { DIFFICULTIES, type DifficultyId } from './domain/generator';
import { computeHighlights, findConflicts, peersOf, type CellHighlight } from './domain/highlight';
import type { GameContext, GameModule } from '../../core/types';
import { clearSavedGame, loadSavedGame, saveGame } from './store';

const TEMPLATE = `
<section id="home" class="home" hidden>
  <button id="continueBtn" class="btn primary wide" type="button" hidden></button>
  <h2>Novo jogo</h2>
  <div id="levels" class="levels"></div>
</section>

<section id="game" class="game" hidden>
  <div class="status">
    <button id="menuBtn" class="btn" type="button" hidden>Menu</button>
    <span id="diff"></span><span id="timer" aria-live="off"></span>
  </div>
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
</section>

<dialog id="win" class="win">
  <h2>Parabéns!</h2>
  <p id="winText"></p>
  <div class="winBtns">
    <button id="winAgain" class="btn primary" type="button">Jogar outro</button>
    <button id="winMenu" class="btn" type="button">Menu</button>
  </div>
</dialog>
`;

function mount(root: HTMLElement, ctx: GameContext): () => void {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
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
  let game: Game | null = null;
  let selected = -1;
  let notesMode = false;
  let popupCell = -1;
  let lastTick = 0;
  let timerId = 0;
  let lastSave = 0;

  const home = $('home');
  const gameView = $('game');
  const board = $('board');
  const popup = $('popup');
  const numRow = $('numRow');
  const popupFlag = $<HTMLInputElement>('popupFlag');
  const autoNotesBox = $<HTMLInputElement>('autoNotes');
  const menuBtn = $('menuBtn');
  const winDialog = $<HTMLDialogElement>('win');

  const fmtTime = (secs: number): string => {
    const s = Math.floor(secs);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

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
    if (!game) return;
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
  }

  /** Destaca no teclado os dígitos que já são anotação da célula selecionada (modo Anotação). */
  function refreshPadNotes(): void {
    const mask = game && selected >= 0 && notesMode ? game.notes[selected]! : 0;
    for (const btn of [...popup.querySelectorAll<HTMLButtonElement>('[data-d]'), ...numRow.querySelectorAll<HTMLButtonElement>('[data-d]')]) {
      btn.classList.toggle('noted', (mask & (1 << Number(btn.dataset.d))) !== 0);
    }
  }

  // ---------- Teclados (flutuante e em linha) ----------

  function buildPad(host: HTMLElement, withErase: 'row' | 'block'): void {
    host.replaceChildren();
    for (let d = 1; d <= 9; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(d);
      b.dataset.d = String(d);
      b.setAttribute('aria-label', `Número ${d}`);
      host.appendChild(b);
    }
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'erase';
    e.dataset.erase = '1';
    e.textContent = withErase === 'row' ? '✕' : '✕ Apagar';
    e.setAttribute('aria-label', 'Apagar');
    host.appendChild(e);
  }
  buildPad(popup, 'block');
  buildPad(numRow, 'row');

  function onPadPress(target: EventTarget | null, fromPopup: boolean): void {
    const btn = (target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!btn || !game || selected < 0) return;
    if (btn.dataset.erase) game.clear(selected);
    else applyDigit(selected, Number(btn.dataset.d));
    if (fromPopup && (btn.dataset.erase || !notesMode)) closePopup();
    afterChange();
  }

  popup.addEventListener('click', (e) => onPadPress(e.target, true));
  numRow.addEventListener('click', (e) => onPadPress(e.target, false));

  function applyDigit(i: number, digit: number): void {
    if (!game) return;
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
    numRow.hidden = prefs.popup || !game;
    if (!prefs.popup || !game) closePopup();
  }

  // ---------- Fluxo da partida ----------

  function onCellClick(i: number): void {
    selected = i;
    if (prefs.popup && game && !game.isGiven(i)) openPopup(i);
    else closePopup();
    render();
  }

  function afterChange(): void {
    render();
    persist(true);
    if (game?.isSolved()) win();
  }

  function persist(force = false): void {
    if (!game) return;
    const now = Date.now();
    if (!force && now - lastSave < 5000) return;
    lastSave = now;
    saveGame(game.snapshot());
  }

  function tick(): void {
    if (!game) return;
    const now = performance.now();
    game.elapsed += (now - lastTick) / 1000;
    lastTick = now;
    $('timer').textContent = fmtTime(game.elapsed);
    persist();
  }

  function startTimer(): void {
    window.clearInterval(timerId);
    lastTick = performance.now();
    timerId = window.setInterval(tick, 1000);
  }

  function stopTimer(): void {
    if (timerId) tick();
    window.clearInterval(timerId);
    timerId = 0;
  }

  on('visibilitychange', () => {
    if (!game || winDialog.open || gameView.hidden) return;
    if (document.hidden) {
      stopTimer();
      persist(true);
    } else startTimer();
  });

  function showGame(g: Game): void {
    game = g;
    selected = -1;
    notesMode = false;
    syncModeButtons();
    closePopup();
    home.hidden = true;
    gameView.hidden = false;
    menuBtn.hidden = false;
    $('diff').textContent = DIFFICULTIES[g.difficulty].label;
    $('timer').textContent = fmtTime(g.elapsed);
    syncPadMode();
    render();
    startTimer();
    persist(true);
  }

  function newGame(d: DifficultyId): void {
    showGame(Game.create(d));
  }

  function showHome(): void {
    if (game && !game.isSolved()) {
      stopTimer();
      persist(true);
    }
    game = null;
    closePopup();
    gameView.hidden = true;
    menuBtn.hidden = true;
    home.hidden = false;
    numRow.hidden = true;
    buildHome();
  }

  function buildHome(): void {
    const saved = Game.restore(loadSavedGame());
    const btn = $('continueBtn');
    btn.hidden = !saved;
    if (saved) {
      btn.textContent = `Continuar partida — ${DIFFICULTIES[saved.difficulty].label} · ${fmtTime(saved.elapsed)}`;
      btn.onclick = () => showGame(saved);
    }
    const levels = $('levels');
    levels.replaceChildren();
    for (const [id, info] of Object.entries(DIFFICULTIES) as [DifficultyId, { label: string }][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn wide';
      b.textContent = info.label;
      b.addEventListener('click', () => newGame(id));
      levels.appendChild(b);
    }
  }

  function win(): void {
    if (!game) return;
    stopTimer();
    clearSavedGame();
    closePopup();
    $('winText').textContent = `Você terminou um puzzle ${DIFFICULTIES[game.difficulty].label.toLowerCase()} em ${fmtTime(game.elapsed)}.`;
    winDialog.showModal();
  }

  $('winAgain').addEventListener('click', () => {
    const d = game?.difficulty ?? 'easy';
    winDialog.close();
    newGame(d);
  });
  $('winMenu').addEventListener('click', () => {
    winDialog.close();
    showHome();
  });
  menuBtn.addEventListener('click', showHome);

  // ---------- Controles ----------

  function syncModeButtons(): void {
    $('modeNormal').classList.toggle('on', !notesMode);
    $('modeNotes').classList.toggle('on', notesMode);
  }
  $('modeNormal').addEventListener('click', () => { notesMode = false; syncModeButtons(); refreshPadNotes(); });
  $('modeNotes').addEventListener('click', () => { notesMode = true; syncModeButtons(); refreshPadNotes(); });
  $('undoBtn').addEventListener('click', () => {
    if (game?.undo()) afterChange();
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
    if (!game || gameView.hidden || winDialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key) && selected >= 0) {
      applyDigit(selected, Number(e.key));
      if (!notesMode) closePopup();
      afterChange();
    } else if (['Backspace', 'Delete', '0'].includes(e.key) && selected >= 0) {
      game.clear(selected);
      afterChange();
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

  showHome();

  return () => {
    if (game && !game.isSolved()) persist(true);
    stopTimer();
    window.clearInterval(timerId);
    offs.forEach((off) => off());
    root.replaceChildren();
  };
}

export const sudoku: GameModule = {
  id: 'sudoku',
  title: 'Sudoku',
  description: 'Complete a grade 9×9 sem repetir números.',
  icon: '▦',
  mount,
};
