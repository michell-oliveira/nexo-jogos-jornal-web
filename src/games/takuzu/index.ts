import { button, el } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import {
  EMPTY, LEVELS, conflictsOf, filled, hint, isSolved, parseSaved, sizeOf, startTakuzu, tap, toFill, undo,
  type TakuzuLevelId, type TakuzuState,
} from './domain';

const HELP = `<p>Preencha a grade com <strong>0</strong> e <strong>1</strong>. Toque numa célula para alternar: vazio, 0, 1.</p>
     <ul>
       <li>Nunca três iguais seguidos, na linha ou na coluna.</li>
       <li>Cada linha e cada coluna tem tantos 0 quanto 1.</li>
       <li>Não pode haver duas linhas iguais, nem duas colunas iguais.</li>
     </ul>
     <p>Células em vermelho quebram uma regra. As cinzas são fixas.</p>`;

function mountView(body: HTMLElement, host: GameHost<TakuzuState>) {
  const edit = (change: (g: TakuzuState) => TakuzuState) => host.update(change(host.state()));
  const n = sizeOf(host.state());
  const board = el('div', 'takuzuBoard');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Tabuleiro de Takuzu');
  board.style.setProperty('--n', String(n));
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < n * n; i++) {
    const b = el('button', 'tcell');
    b.type = 'button';
    b.addEventListener('click', () => edit((g) => tap(g, i)));
    cells.push(b);
    board.appendChild(b);
  }
  const undoBtn = button('Desfazer', 'btn', () => edit(undo));
  const controls = el('div', 'controls');
  controls.append(undoBtn, button('Dica', 'btn', () => edit((g) => hint(g))));
  body.append(board, controls);

  return {
    render(g: TakuzuState): void {
      const bad = conflictsOf(g);
      cells.forEach((b, i) => {
        const v = g.cells[i]!;
        b.textContent = v === EMPTY ? '' : String(v);
        b.className = 'tcell' + (g.given.includes(i) ? ' given' : '') + (bad.has(i) ? ' conflict' : '');
        b.setAttribute('aria-label', `Linha ${Math.floor(i / n) + 1}, coluna ${(i % n) + 1}, ${v === EMPTY ? 'vazia' : v}`);
      });
      undoBtn.disabled = g.history.length === 0;
    },
  };
}

export const takuzu = createGame<TakuzuState, TakuzuLevelId>({
  meta: { id: 'takuzu', title: 'Takuzu', description: 'Preencha com 0 e 1 sem trincas nem linhas repetidas.', icon: '⚫' },
  help: HELP,
  levels: (Object.keys(LEVELS) as TakuzuLevelId[]).map((id) => ({ id, label: LEVELS[id].label, detail: `${LEVELS[id].size}×${LEVELS[id].size}` })),
  newGame: (level) => startTakuzu(level),
  levelOf: (s) => s.level,
  save: {
    key: 'jj.takuzu.game.v1',
    parse: parseSaved,
    serialize: (s) => ({ level: s.level, solution: s.solution, given: s.given, cells: s.cells }),
    isOver: isSolved,
  },
  resumeLabel: (s) => `${LEVELS[s.level].label} · ${filled(s)}/${toFill(s)}`,
  className: 'takuzu',
  statusText: (s) => `${LEVELS[s.level].label} · ${filled(s)}/${toFill(s)}`,
  mountView,
  finish: (s) => ({
    title: 'Resolvido!',
    html: `<p>Você completou o Takuzu ${LEVELS[s.level].label.toLowerCase()}.</p>`,
  }),
});
