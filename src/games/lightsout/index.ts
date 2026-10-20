import { button, el } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import { createRecordBook } from '../../core/records';
import { CELLS, LEVELS, hint, isSolved, litCount, startLights, tap, type LightsLevelId, type LightsState } from './domain';

const IDS = Object.keys(LEVELS) as LightsLevelId[];

const HELP = `<p>Tocar numa luz inverte ela e as 4 vizinhas (cima, baixo, esquerda e direita).</p>
     <p>Objetivo: <strong>apagar todas as luzes</strong> no menor número de toques. Use a dica se travar.</p>`;

function parseSaved(raw: unknown): LightsState | null {
  const r = raw as Partial<LightsState> | null;
  if (!r || !IDS.includes(r.level as LightsLevelId)) return null;
  if (!Array.isArray(r.lit) || r.lit.length !== CELLS || !r.lit.every((v) => typeof v === 'boolean')) return null;
  if (!Array.isArray(r.need) || !r.need.every((i) => Number.isInteger(i) && i >= 0 && i < CELLS)) return null;
  return { level: r.level as LightsLevelId, lit: r.lit, need: r.need, moves: Number(r.moves) || 0 };
}

function mountView(body: HTMLElement, host: GameHost<LightsState>) {
  let hintCell: number | null = null;
  let last: LightsState = host.state();
  const board = el('div', 'lightsBoard');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Tabuleiro de Lights Out');
  const lights: HTMLElement[] = [];
  for (let i = 0; i < CELLS; i++) {
    const b = el('button', 'light');
    b.type = 'button';
    b.addEventListener('click', () => host.update(tap(host.state(), i)));
    lights.push(b);
    board.appendChild(b);
  }
  const controls = el('div', 'controls');
  controls.append(
    button('Dica', 'btn', () => { hintCell = hint(host.state()); paint(host.state()); }),
    button('Reiniciar', 'btn', host.newGame),
  );
  body.append(board, controls);

  function paint(g: LightsState): void {
    lights.forEach((b, i) => {
      b.classList.toggle('on', g.lit[i]!);
      b.classList.toggle('hint', hintCell === i);
      b.setAttribute('aria-label', `Linha ${Math.floor(i / 5) + 1}, coluna ${(i % 5) + 1}, ${g.lit[i] ? 'acesa' : 'apagada'}`);
    });
  }

  return {
    render(g: LightsState): void {
      if (g !== last) hintCell = null; // a dica vale só até o próximo toque
      last = g;
      paint(g);
    },
  };
}

export const lightsout = createGame<LightsState, LightsLevelId>({
  meta: { id: 'lightsout', title: 'Lights Out', description: 'Apague todas as luzes do tabuleiro.', icon: '💡' },
  help: HELP,
  levels: IDS.map((id) => ({ id, label: LEVELS[id].label })),
  newGame: (level) => startLights(level),
  levelOf: (s) => s.level,
  save: { key: 'jj.lightsout.game.v1', parse: parseSaved, serialize: (s) => s, isOver: isSolved },
  records: createRecordBook<LightsLevelId>((l) => `jj.lightsout.best.${l}.v1`, (v) => `${v} toques`),
  resumeLabel: (s) => `${LEVELS[s.level].label} · ${s.moves} toques`,
  className: 'lights',
  statusText: (s) => `${LEVELS[s.level].label} · ${s.moves} toques · ${litCount(s)} acesas`,
  mountView,
  finish: (s, ctx) => ({
    title: 'Tudo apagado!',
    html: `<p>${s.moves} toques${ctx.submitRecord(s.moves) ? ' — novo recorde!' : ''}.</p>`,
  }),
});
