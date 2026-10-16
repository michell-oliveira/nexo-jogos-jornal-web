import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, loadBest, recordBest, renderMenu } from '../../core/ui';
import { CELLS, LEVELS, hint, isSolved, litCount, startLights, tap, type LightsLevelId, type LightsState } from './domain';

const GAME_KEY = 'jj.lightsout.game.v1';
const bestKey = (l: LightsLevelId): string => `jj.lightsout.best.${l}.v1`;
const IDS = Object.keys(LEVELS) as LightsLevelId[];

function loadSaved(): LightsState | null {
  const r = readJson(GAME_KEY) as Partial<LightsState> | null;
  if (!r || !IDS.includes(r.level as LightsLevelId)) return null;
  if (!Array.isArray(r.lit) || r.lit.length !== CELLS || !r.lit.every((v) => typeof v === 'boolean')) return null;
  if (!Array.isArray(r.need) || !r.need.every((i) => Number.isInteger(i) && i >= 0 && i < CELLS)) return null;
  const s: LightsState = { level: r.level as LightsLevelId, lit: r.lit, need: r.need, moves: Number(r.moves) || 0 };
  return isSolved(s) ? null : s;
}

function mount(root: HTMLElement): () => void {
  let game: LightsState | null = null;
  let hintCell: number | null = null;
  const help = helpController(
    root, 'lightsout', 'Como jogar',
    `<p>Tocar numa luz inverte ela e as 4 vizinhas (cima, baixo, esquerda e direita).</p>
     <p>Objetivo: <strong>apagar todas as luzes</strong> no menor número de toques. Use a dica se travar.</p>`,
  );

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar partida — ${LEVELS[saved.level].label} · ${saved.moves} toques`,
        onContinue: () => show(saved),
      },
      levels: IDS.map((id) => {
        const best = loadBest(bestKey(id));
        return { id, label: LEVELS[id].label, detail: best ? `Recorde: ${best} toques` : undefined };
      }),
      onStart: (id) => show(startLights(id as LightsLevelId)),
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function persist(): void {
    if (!game) return;
    if (isSolved(game)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, game);
  }

  function show(s: LightsState): void {
    game = s;
    hintCell = null;
    persist();
    root.innerHTML = `
      <section class="lights">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span>${LEVELS[s.level].label}</span><span id="moves"></span><span id="left"></span></div>
        <div id="board" class="lightsBoard" role="grid" aria-label="Tabuleiro de Lights Out"></div>
        <div class="controls"></div>
      </section>`;
    const board = root.querySelector<HTMLElement>('#board')!;
    for (let i = 0; i < CELLS; i++) {
      const b = el('button', 'light');
      b.type = 'button';
      b.addEventListener('click', () => onTap(i));
      board.appendChild(b);
    }
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    root.querySelector('.controls')!.append(
      button('Dica', 'btn', () => { hintCell = game ? hint(game) : null; render(); }),
      button('Reiniciar', 'btn', () => game && show(startLights(game.level))),
      button('Como jogar', 'btn', help.open),
    );
    render();
  }

  function render(): void {
    if (!game) return;
    const g = game;
    root.querySelectorAll<HTMLElement>('.light').forEach((b, i) => {
      b.classList.toggle('on', g.lit[i]!);
      b.classList.toggle('hint', hintCell === i);
      b.setAttribute('aria-label', `Linha ${Math.floor(i / 5) + 1}, coluna ${(i % 5) + 1}, ${g.lit[i] ? 'acesa' : 'apagada'}`);
    });
    root.querySelector('#moves')!.textContent = `${g.moves} toques`;
    root.querySelector('#left')!.textContent = `${litCount(g)} acesas`;
  }

  function onTap(i: number): void {
    if (!game) return;
    const next = tap(game, i);
    if (next === game) return;
    game = next;
    hintCell = null;
    persist();
    render();
    if (isSolved(next)) {
      const record = recordBest(bestKey(next.level), next.moves);
      dialog(root, {
        title: 'Tudo apagado!',
        html: `<p>${next.moves} toques${record ? ' — novo recorde!' : ''}.</p>`,
        buttons: [
          { label: 'Jogar outro', primary: true, action: () => show(startLights(next.level)) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }
  }

  showMenu();
  return () => root.replaceChildren();
}

export const lightsout: GameModule = {
  id: 'lightsout',
  title: 'Lights Out',
  description: 'Apague todas as luzes do tabuleiro.',
  icon: '💡',
  mount,
};
