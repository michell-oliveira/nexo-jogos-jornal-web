import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, renderMenu } from '../../core/ui';
import {
  EMPTY, LEVELS, conflictsOf, filled, hint, isSolved, parseSaved, sizeOf, startTakuzu, tap, toFill, undo,
  type TakuzuLevelId, type TakuzuState,
} from './domain';

const GAME_KEY = 'jj.takuzu.game.v1';
const IDS = Object.keys(LEVELS) as TakuzuLevelId[];

function loadSaved(): TakuzuState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isSolved(s) ? s : null;
}

function mount(root: HTMLElement): () => void {
  let game: TakuzuState | null = null;
  const help = helpController(
    root, 'takuzu', 'Como jogar',
    `<p>Preencha a grade com <strong>0</strong> e <strong>1</strong>. Toque numa célula para alternar: vazio, 0, 1.</p>
     <ul>
       <li>Nunca três iguais seguidos, na linha ou na coluna.</li>
       <li>Cada linha e cada coluna tem tantos 0 quanto 1.</li>
       <li>Não pode haver duas linhas iguais, nem duas colunas iguais.</li>
     </ul>
     <p>Células em vermelho quebram uma regra. As cinzas são fixas.</p>`,
  );

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar partida — ${LEVELS[saved.level].label} · ${filled(saved)}/${toFill(saved)}`,
        onContinue: () => show(saved),
      },
      levels: IDS.map((id) => ({ id, label: LEVELS[id].label, detail: `${LEVELS[id].size}×${LEVELS[id].size}` })),
      onStart: (id) => {
        removeKey(GAME_KEY);
        // gerar uma grade 8×8 leva uma fração de segundo: dá tempo de o clique "respirar" antes
        setTimeout(() => show(startTakuzu(id as TakuzuLevelId)), 0);
      },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function show(s: TakuzuState): void {
    game = s;
    const n = sizeOf(s);
    root.innerHTML = `
      <section class="takuzu">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span>${LEVELS[s.level].label}</span><span id="progress"></span></div>
        <div id="board" class="takuzuBoard" role="grid" aria-label="Tabuleiro de Takuzu" style="--n:${n}"></div>
        <div class="controls"></div>
      </section>`;
    const board = root.querySelector<HTMLElement>('#board')!;
    for (let i = 0; i < n * n; i++) {
      const b = el('button', 'tcell');
      b.type = 'button';
      b.addEventListener('click', () => edit((g) => tap(g, i)));
      board.appendChild(b);
    }
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    const undoBtn = button('Desfazer', 'btn', () => edit(undo));
    undoBtn.id = 'undoBtn';
    root.querySelector('.controls')!.append(
      undoBtn,
      button('Dica', 'btn', () => edit((g) => hint(g))),
      button('Como jogar', 'btn', help.open),
    );
    render();
  }

  function edit(change: (g: TakuzuState) => TakuzuState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    if (isSolved(next)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, { level: next.level, solution: next.solution, given: next.given, cells: next.cells });
    render();
    if (isSolved(next)) {
      dialog(root, {
        title: 'Resolvido!',
        html: `<p>Você completou o Takuzu ${LEVELS[next.level].label.toLowerCase()}.</p>`,
        buttons: [
          { label: 'Jogar outro', primary: true, action: () => show(startTakuzu(next.level)) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }
  }

  function render(): void {
    if (!game) return;
    const g = game;
    const bad = conflictsOf(g);
    root.querySelectorAll<HTMLButtonElement>('.tcell').forEach((b, i) => {
      const v = g.cells[i]!;
      b.textContent = v === EMPTY ? '' : String(v);
      b.className = 'tcell' + (g.given.includes(i) ? ' given' : '') + (bad.has(i) ? ' conflict' : '');
      b.setAttribute('aria-label', `Linha ${Math.floor(i / sizeOf(g)) + 1}, coluna ${(i % sizeOf(g)) + 1}, ${v === EMPTY ? 'vazia' : v}`);
    });
    root.querySelector('#progress')!.textContent = `${filled(g)}/${toFill(g)}`;
    root.querySelector<HTMLButtonElement>('#undoBtn')!.disabled = g.history.length === 0;
  }

  showMenu();
  return () => root.replaceChildren();
}

export const takuzu: GameModule = {
  id: 'takuzu',
  title: 'Takuzu',
  description: 'Preencha com 0 e 1 sem trincas nem linhas repetidas.',
  icon: '⚫',
  mount,
};
