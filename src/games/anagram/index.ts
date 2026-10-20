import { createGame, type GameHost } from '../../core/gameShell';
import { button, el } from '../../core/dom';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  WORDS_PER_ROUND, check, clear, currentWord, hintVisible, isCorrect, isFinished, isFull, parseSaved, place, removeAt,
  reshuffle, showHint, skip, startAnagram, toSaved, type AnagramState,
} from './domain';

const HELP = `<p>As letras da palavra estão <strong>embaralhadas</strong>. Toque nelas na ordem certa para formar a palavra.</p>
     <ul>
       <li>Toque numa letra já colocada para devolvê-la.</li>
       <li><em>Embaralhar</em> reorganiza as letras; <em>Pular</em> passa para a próxima sem pontuar.</li>
       <li>Cada rodada tem ${WORDS_PER_ROUND} palavras. Acertou, ganha 1 ponto.</li>
     </ul>`;

/** Tempo para ver a palavra certa formada antes de avançar sozinho. */
const ADVANCE_DELAY_MS = 450;

function mountView(body: HTMLElement, host: GameHost<AnagramState>) {
  const edit = (change: (g: AnagramState) => AnagramState) => host.update(change(host.state()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clue = el('p', 'clue');
  const slots = el('div', 'anaSlots');
  slots.setAttribute('aria-label', 'Resposta');
  const pool = el('div', 'anaPool');
  pool.setAttribute('aria-label', 'Letras');
  const msg = el('p', 'termoMsg');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  const controls = el('div', 'controls');
  controls.append(
    button('Limpar', 'btn', () => edit(clear)),
    button('Embaralhar', 'btn', () => edit((g) => reshuffle(g))),
    button('Dica', 'btn', () => edit(showHint)),
    button('Pular', 'btn', () => edit((g) => skip(g))),
  );
  body.append(clue, slots, pool, msg, controls);

  /** Coloca a letra; palavra certa avança sozinha, errada deixa o aviso para o jogador corrigir. */
  function placeLetter(i: number): void {
    edit((s) => place(s, i));
    const g = host.state();
    if (isFinished(g) || !isFull(g)) return;
    if (isCorrect(g)) {
      timer = setTimeout(() => { if (host.state() === g) edit((s) => check(s)); }, ADVANCE_DELAY_MS);
    } else {
      msg.textContent = 'Ainda não é essa. Toque numa letra para corrigir.';
    }
  }

  return {
    render(g: AnagramState): void {
      if (isFinished(g)) return;
      const w = currentWord(g);
      clue.innerHTML = hintVisible(g) ? `<strong>${w.category}</strong> — ${w.hint}` : '<em>Dica oculta — toque em Dica</em>';
      slots.replaceChildren(...Array.from({ length: g.scrambled.length }, (_, i) => {
        const b = el('button', 'ana slot' + (isFull(g) ? (isCorrect(g) ? ' ok' : ' bad') : ''));
        b.type = 'button';
        b.textContent = g.placed[i] === undefined ? '' : g.scrambled[g.placed[i]!]!;
        b.disabled = g.placed[i] === undefined;
        b.addEventListener('click', () => edit((s) => removeAt(s, i)));
        return b;
      }));
      pool.replaceChildren(...[...g.scrambled].map((l, i) => {
        const b = el('button', 'ana');
        b.type = 'button';
        b.textContent = l;
        b.disabled = g.placed.includes(i);
        b.addEventListener('click', () => placeLetter(i));
        return b;
      }));
      if (!isFull(g)) msg.textContent = '';
    },
    destroy: () => clearTimeout(timer),
  };
}

export const anagram = createGame<AnagramState, WordLevelId>({
  meta: { id: 'anagram', title: 'Anagrama', description: 'Reordene as letras e descubra a palavra.', icon: '🔀' },
  help: HELP,
  levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
  newGame: (level) => startAnagram(level),
  levelOf: (s) => s.level,
  save: { key: 'jj.anagram.game.v1', parse: parseSaved, serialize: toSaved, isOver: isFinished },
  resumeLabel: (s) => `${WORD_LEVELS[s.level].label} · palavra ${s.index + 1}/${s.words.length}`,
  className: 'anagram',
  statusText: (s) => `${Math.min(s.index + 1, s.words.length)}/${s.words.length} · Pontos: ${s.score}`,
  mountView,
  finish: (s) => ({
    title: 'Rodada concluída',
    html: `<p>Você acertou <strong>${s.score}</strong> de ${s.words.length} palavras.</p>`,
  }),
});
