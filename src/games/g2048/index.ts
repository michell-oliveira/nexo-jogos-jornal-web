import { button, el } from '../../core/dom';
import { dialog } from '../../core/dialog';
import { createGame, type GameHost } from '../../core/gameShell';
import { readJson, writeJson } from '../../core/storage';
import { CELLS, WIN_VALUE, isGameOver, move, startBoard, type Board, type Direction } from './domain';

const BEST_KEY = 'jj.2048.best.v1';

const HELP = `<p>Deslize as peças: duas peças iguais que se encontram viram uma só, com o valor somado.</p>
     <p>A cada jogada surge uma peça nova (2 ou 4). Chegue ao <strong>${WIN_VALUE}</strong>; o jogo acaba quando não há mais movimentos.</p>`;

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

function parseSaved(raw: unknown): Board | null {
  const r = raw as Partial<Board> | null;
  if (!r || !Array.isArray(r.cells) || r.cells.length !== CELLS) return null;
  if (!r.cells.every((v) => Number.isInteger(v) && v >= 0)) return null;
  return { cells: r.cells, score: Number(r.score) || 0, won: r.won === true, spawned: -1 };
}

function scoreBox(label: string): { box: HTMLElement; value: HTMLElement } {
  const box = el('div', 'scoreBox', `<small>${label}</small>`);
  const value = box.appendChild(el('strong'));
  return { box, value };
}

function mountView(body: HTMLElement, host: GameHost<Board>) {
  let best = Number(readJson(BEST_KEY)) || 0;
  let winDismissed = host.state().won;
  const play = (direction: Direction): void => {
    const next = move(host.state(), direction);
    if (next) host.update(next);
  };

  const score = scoreBox('Pontos');
  const bestBox = scoreBox('Recorde');
  const scores = el('div', 'scores');
  scores.append(score.box, bestBox.box);
  const grid = el('div', 'grid2048');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Tabuleiro do 2048');
  const cells = Array.from({ length: CELLS }, () => grid.appendChild(el('div', 'tile2048')));
  const controls = el('div', 'controls');
  controls.appendChild(button('Novo jogo', 'btn primary', host.newGame));
  body.append(scores, grid, controls, el('p', 'hint', 'Deslize o dedo, use as setas do teclado ou W A S D.'));

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
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

  return {
    render(b: Board): void {
      cells.forEach((c, i) => {
        const v = b.cells[i]!;
        c.textContent = v ? String(v) : '';
        // intensidade pela potência de 2 (2 = 1ª, 2048 = 11ª): mistura a cor de destaque do tema com a de superfície
        const level = v ? Math.min(Math.log2(v), 11) / 11 : 0;
        c.style.setProperty('--lvl', `${Math.round(level * 100)}%`);
        c.className = 'tile2048' + (v ? ' has' : '') + (level > 0.45 ? ' strong' : '') + (v >= 1024 ? ' big' : '') + (i === b.spawned ? ' pop' : '');
        c.setAttribute('aria-label', v ? `Peça ${v}` : 'vazia');
      });
      if (b.score > best) {
        best = b.score;
        writeJson(BEST_KEY, best);
      }
      score.value.textContent = String(b.score);
      bestBox.value.textContent = String(best);
      if (b.won && !winDismissed) {
        winDismissed = true;
        // se a jogada também encerrou a partida, o diálogo de fim do shell basta
        if (!isGameOver(b)) {
          dialog(body, {
            title: 'Você chegou ao 2048!',
            html: `<p>Pontos: ${b.score}. Pode continuar jogando para ir além.</p>`,
            buttons: [{ label: 'Continuar', primary: true }, { label: 'Novo jogo', action: host.newGame }],
          });
        }
      }
    },
    destroy(): void {
      document.removeEventListener('keydown', onKey);
    },
  };
}

export const game2048 = createGame<Board, 'new'>({
  meta: { id: '2048', title: '2048', description: 'Deslize e combine as peças até chegar ao 2048.', icon: '🔢' },
  help: HELP,
  levels: [{ id: 'new', label: 'Novo jogo' }],
  newGame: () => startBoard(),
  levelOf: () => 'new',
  save: {
    key: 'jj.2048.game.v1',
    parse: parseSaved,
    serialize: (b) => ({ cells: b.cells, score: b.score, won: b.won }),
    isOver: isGameOver,
  },
  resumeLabel: (b) => `${b.score} pontos`,
  className: 'game2048',
  mountView,
  finish: (b) => ({ title: 'Fim de jogo', html: `<p>Sem movimentos. Pontos: ${b.score}.</p>` }),
});
