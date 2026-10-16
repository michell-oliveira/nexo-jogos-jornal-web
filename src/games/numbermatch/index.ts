import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController } from '../../core/ui';
import {
  MAX_ADDS, addNumbers, findPair, isStuck, isWon, parseSaved, remaining, select, startMatch, type MatchBoard,
} from './domain';

const GAME_KEY = 'jj.numbermatch.game.v1';

function mount(root: HTMLElement): () => void {
  const loaded = parseSaved(readJson(GAME_KEY));
  let board: MatchBoard = loaded && !isWon(loaded) && !isStuck(loaded) ? loaded : startMatch();
  let hint: [number, number] | null = null;
  const help = helpController(
    root, 'numbermatch', 'Como jogar',
    `<p>Toque em duas casas para remover o par: números <strong>iguais</strong> ou que <strong>somam 10</strong>.</p>
     <p>As casas precisam se enxergar: na mesma linha, coluna ou diagonal, ou em sequência de leitura (do fim de uma linha ao começo da seguinte), sem números entre elas.</p>
     <p>Quando não houver mais jogadas, use <strong>Adicionar</strong> para copiar os números restantes no fim (${MAX_ADDS} vezes por partida). Limpe o tabuleiro para vencer.</p>`,
  );

  root.innerHTML = `
    <section class="match">
      <div class="status"><span id="left"></span><span id="adds"></span></div>
      <div id="board" class="matchBoard" role="grid" aria-label="Number Match"></div>
      <div class="controls"></div>
    </section>`;
  const boardEl = root.querySelector<HTMLElement>('#board')!;
  boardEl.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (cell) update(select(board, Number(cell.dataset.i)));
  });
  const addBtn = button('Adicionar', 'btn', () => {
    const next = addNumbers(board);
    if (next) update(next);
  });
  root.querySelector('.controls')!.append(
    addBtn,
    button('Dica', 'btn', () => {
      hint = findPair(board);
      render();
    }),
    button('Novo jogo', 'btn', () => update(startMatch())),
    button('Como jogar', 'btn', help.open),
  );

  function update(next: MatchBoard): void {
    board = next;
    hint = null;
    if (isWon(next) || isStuck(next)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, { cells: next.cells, addsLeft: next.addsLeft });
    render();
    if (isWon(next)) {
      dialog(root, {
        title: 'Tabuleiro limpo!',
        html: '<p>Você eliminou todos os números.</p>',
        buttons: [{ label: 'Jogar outro', primary: true, action: () => update(startMatch()) }],
      });
    } else if (isStuck(next)) {
      dialog(root, {
        title: 'Sem saída',
        html: `<p>Não há mais pares nem rodadas extras. Sobraram ${remaining(next)} números.</p>`,
        buttons: [{ label: 'Novo jogo', primary: true, action: () => update(startMatch()) }],
      });
    }
  }

  function render(): void {
    const frag = document.createDocumentFragment();
    board.cells.forEach((v, i) => {
      const b = el('button', 'mt');
      b.type = 'button';
      b.dataset.i = String(i);
      b.textContent = v ? String(v) : '';
      b.disabled = v === 0;
      if (i === board.selected) b.classList.add('selected');
      if (hint && (hint[0] === i || hint[1] === i)) b.classList.add('hint');
      b.setAttribute('aria-label', v ? `Número ${v}` : 'vazia');
      frag.appendChild(b);
    });
    boardEl.replaceChildren(frag);
    root.querySelector('#left')!.textContent = `${remaining(board)} números`;
    root.querySelector('#adds')!.textContent = `Adicionar: ${board.addsLeft}/${MAX_ADDS}`;
    addBtn.disabled = board.addsLeft === 0 || remaining(board) === 0;
  }

  render();
  help.openFirstTime();
  return () => root.replaceChildren();
}

export const numbermatch: GameModule = {
  id: 'numbermatch',
  title: 'Number Match',
  description: 'Elimine pares de números iguais ou que somam 10.',
  icon: '🔗',
  mount,
};
