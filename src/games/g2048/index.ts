import { readJson, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController } from '../../core/ui';
import { CELLS, WIN_VALUE, isGameOver, move, startBoard, type Board, type Direction } from './domain';

const GAME_KEY = 'jj.2048.game.v1';
const BEST_KEY = 'jj.2048.best.v1';

function loadBoard(): Board | null {
  const raw = readJson(GAME_KEY) as Partial<Board> | null;
  if (!raw || !Array.isArray(raw.cells) || raw.cells.length !== CELLS) return null;
  if (!raw.cells.every((v) => Number.isInteger(v) && v >= 0)) return null;
  const board: Board = { cells: raw.cells, score: Number(raw.score) || 0, won: raw.won === true, spawned: -1 };
  return isGameOver(board) ? null : board;
}

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

function mount(root: HTMLElement): () => void {
  let board = loadBoard() ?? startBoard();
  let best = Number(readJson(BEST_KEY)) || 0;
  let winDismissed = board.won;

  root.innerHTML = `
    <section class="game2048">
      <div class="scores">
        <div class="scoreBox"><small>Pontos</small><strong id="score">0</strong></div>
        <div class="scoreBox"><small>Recorde</small><strong id="best">0</strong></div>
      </div>
      <div id="grid" class="grid2048" role="grid" aria-label="Tabuleiro do 2048"></div>
      <div class="controls"></div>
      <p class="hint">Deslize o dedo, use as setas do teclado ou W A S D.</p>
    </section>`;
  const grid = root.querySelector<HTMLElement>('#grid')!;
  const cells = Array.from({ length: CELLS }, () => grid.appendChild(el('div', 'tile2048')));
  const help = helpController(
    root, '2048', 'Como jogar',
    `<p>Deslize as peças: duas peças iguais que se encontram viram uma só, com o valor somado.</p>
     <p>A cada jogada surge uma peça nova (2 ou 4). Chegue ao <strong>${WIN_VALUE}</strong>; o jogo acaba quando não há mais movimentos.</p>`,
  );

  function render(): void {
    cells.forEach((c, i) => {
      const v = board.cells[i]!;
      c.textContent = v ? String(v) : '';
      // intensidade pela potência de 2 (2 = 1ª, 2048 = 11ª): mistura a cor de destaque do tema com a de superfície
      const level = v ? Math.min(Math.log2(v), 11) / 11 : 0;
      c.style.setProperty('--lvl', `${Math.round(level * 100)}%`);
      c.className = 'tile2048' + (v ? ' has' : '') + (level > 0.45 ? ' strong' : '') + (v >= 1024 ? ' big' : '') + (i === board.spawned ? ' pop' : '');
      c.setAttribute('aria-label', v ? `Peça ${v}` : 'vazia');
    });
    root.querySelector('#score')!.textContent = String(board.score);
    root.querySelector('#best')!.textContent = String(best);
  }

  function save(): void {
    writeJson(GAME_KEY, { cells: board.cells, score: board.score, won: board.won });
  }

  function play(direction: Direction): void {
    if (isGameOver(board)) return;
    const next = move(board, direction);
    if (!next) return;
    board = next;
    if (board.score > best) {
      best = board.score;
      writeJson(BEST_KEY, best);
    }
    save();
    render();
    if (board.won && !winDismissed) {
      winDismissed = true;
      dialog(root, {
        title: 'Você chegou ao 2048!',
        html: `<p>Pontos: ${board.score}. Pode continuar jogando para ir além.</p>`,
        buttons: [{ label: 'Continuar', primary: true }, { label: 'Novo jogo', action: newGame }],
      });
    } else if (isGameOver(board)) {
      dialog(root, {
        title: 'Fim de jogo',
        html: `<p>Sem movimentos. Pontos: ${board.score}.</p>`,
        buttons: [{ label: 'Novo jogo', primary: true, action: newGame }],
      });
    }
  }

  function newGame(): void {
    board = startBoard();
    winDismissed = false;
    save();
    render();
  }

  const controls = root.querySelector('.controls')!;
  controls.append(button('Novo jogo', 'btn primary', newGame), button('Como jogar', 'btn', help.open));

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || root.querySelector('dialog[open]')) return;
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    play(dir);
  };
  document.addEventListener('keydown', onKey);

  // Gesto de deslizar: ignora toques curtos; o eixo dominante decide a direção.
  let start: { x: number; y: number } | null = null;
  grid.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  grid.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  grid.addEventListener('pointercancel', () => { start = null; });

  render();
  help.openFirstTime();

  return () => {
    document.removeEventListener('keydown', onKey);
    root.replaceChildren();
  };
}

export const game2048: GameModule = {
  id: '2048',
  title: '2048',
  description: 'Deslize e combine as peças até chegar ao 2048.',
  icon: '🔢',
  mount,
};
