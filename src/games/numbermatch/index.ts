import { button, el } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import {
  MAX_ADDS, addNumbers, findPair, isStuck, isWon, parseSaved, remaining, select, startMatch, type MatchBoard,
} from './domain';

const HELP = `<p>Toque em duas casas para remover o par: números <strong>iguais</strong> ou que <strong>somam 10</strong>.</p>
     <p>As casas precisam se enxergar: na mesma linha, coluna ou diagonal, ou em sequência de leitura (do fim de uma linha ao começo da seguinte), sem números entre elas.</p>
     <p>Quando não houver mais jogadas, use <strong>Adicionar</strong> para copiar os números restantes no fim (${MAX_ADDS} vezes por partida). Limpe o tabuleiro para vencer.</p>`;

function mountView(body: HTMLElement, host: GameHost<MatchBoard>) {
  let hint: [number, number] | null = null;
  const boardEl = el('div', 'matchBoard');
  boardEl.setAttribute('role', 'grid');
  boardEl.setAttribute('aria-label', 'Number Match');
  boardEl.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (cell) host.update(select(host.state(), Number(cell.dataset.i)));
  });
  const addBtn = button('Adicionar', 'btn', () => {
    const next = addNumbers(host.state());
    if (next) host.update(next);
  });
  const controls = el('div', 'controls');
  controls.append(
    addBtn,
    button('Dica', 'btn', () => {
      hint = findPair(host.state());
      draw(host.state());
    }),
    button('Novo jogo', 'btn', host.newGame),
  );
  body.append(boardEl, controls);

  function draw(b: MatchBoard): void {
    const frag = document.createDocumentFragment();
    b.cells.forEach((v, i) => {
      const cell = el('button', 'mt');
      cell.type = 'button';
      cell.dataset.i = String(i);
      cell.textContent = v ? String(v) : '';
      cell.disabled = v === 0;
      if (i === b.selected) cell.classList.add('selected');
      if (hint && (hint[0] === i || hint[1] === i)) cell.classList.add('hint');
      cell.setAttribute('aria-label', v ? `Número ${v}` : 'vazia');
      frag.appendChild(cell);
    });
    boardEl.replaceChildren(frag);
    addBtn.disabled = b.addsLeft === 0 || remaining(b) === 0;
  }

  return {
    render(b: MatchBoard): void {
      hint = null; // a dica vale só até a próxima jogada
      draw(b);
    },
  };
}

export const numbermatch = createGame<MatchBoard, 'new'>({
  meta: { id: 'numbermatch', title: 'Number Match', description: 'Elimine pares de números iguais ou que somam 10.', icon: '🔗' },
  help: HELP,
  levels: [{ id: 'new', label: 'Novo jogo' }],
  newGame: () => startMatch(),
  levelOf: () => 'new',
  save: {
    key: 'jj.numbermatch.game.v1',
    parse: parseSaved,
    serialize: (b) => ({ cells: b.cells, addsLeft: b.addsLeft }),
    isOver: (b) => isWon(b) || isStuck(b),
  },
  resumeLabel: (b) => `${remaining(b)} números`,
  className: 'match',
  statusText: (b) => `${remaining(b)} números · Adicionar: ${b.addsLeft}/${MAX_ADDS}`,
  mountView,
  finish: (b) =>
    isWon(b)
      ? { title: 'Tabuleiro limpo!', html: '<p>Você eliminou todos os números.</p>' }
      : { title: 'Sem saída', html: `<p>Não há mais pares nem rodadas extras. Sobraram ${remaining(b)} números.</p>` },
});
