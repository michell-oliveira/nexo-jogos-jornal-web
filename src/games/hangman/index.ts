import { createGame, type GameHost } from '../../core/gameShell';
import { button, el } from '../../core/dom';
import { letterKeyboard } from '../words/keyboard';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  MAX_ERRORS, errorsOf, guess, hint, isLost, isOver, isWon, parseSaved, shown, startHangman, wrongLetters,
  type HangmanState,
} from './domain';

const HELP = `<p>Descubra a palavra escolhendo letras. A dica mostra a categoria e uma pista.</p>
     <ul>
       <li>Letra certa aparece em todos os lugares onde está na palavra.</li>
       <li>Você perde com <strong>${MAX_ERRORS} erros</strong>.</li>
       <li>O botão <em>Dica</em> revela uma letra sem contar erro (quantidade limitada por nível).</li>
     </ul>`;

/** Desenho da forca: cada erro acrescenta uma parte (base, poste, travessa, corda, cabeça, corpo, braços/pernas). */
function gallows(errors: number): string {
  const parts = [
    '<line x1="10" y1="170" x2="110" y2="170"/>',
    '<line x1="40" y1="170" x2="40" y2="20"/><line x1="40" y1="20" x2="110" y2="20"/><line x1="110" y1="20" x2="110" y2="40"/>',
    '<circle cx="110" cy="55" r="15"/>',
    '<line x1="110" y1="70" x2="110" y2="115"/>',
    '<line x1="110" y1="80" x2="90" y2="100"/>',
    '<line x1="110" y1="80" x2="130" y2="100"/>',
    '<line x1="110" y1="115" x2="92" y2="145"/><line x1="110" y1="115" x2="128" y2="145"/>',
  ];
  // a base já aparece com 0 erros; cada erro acrescenta uma parte (6 erros = desenho completo)
  const visible = parts.slice(0, Math.min(errors + 1, parts.length)).join('');
  return `<svg class="gallows" viewBox="0 0 160 180" role="img" aria-label="Forca com ${errors} erro(s)"
    fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">${visible}</svg>`;
}

function mountView(body: HTMLElement, host: GameHost<HangmanState>) {
  const edit = (change: (g: HangmanState) => HangmanState) => host.update(change(host.state()));
  const kb = letterKeyboard({ onLetter: (l) => edit((g) => guess(g, l)) });
  const art = el('div');
  const clue = el('p', 'clue');
  const word = el('div', 'hangWord');
  word.setAttribute('aria-live', 'polite');
  const wrong = el('p', 'hangWrong');
  const hintBtn = button('Dica', 'btn', () => edit(hint));
  const controls = el('div', 'controls');
  controls.append(hintBtn);
  body.append(art, clue, word, wrong, controls, kb.root);

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (/^[a-zA-Z]$/.test(e.key)) edit((g) => guess(g, e.key.toUpperCase()));
  };
  document.addEventListener('keydown', onKey);

  return {
    render(g: HangmanState): void {
      art.innerHTML = gallows(errorsOf(g));
      clue.innerHTML = `<strong>${g.word.category}</strong> — ${g.word.hint}`;
      word.replaceChildren(...shown(g).map((l) => {
        const s = el('span', 'hl' + (isLost(g) && !g.guessed.includes(l) ? ' missed' : ''));
        s.textContent = l || '_';
        return s;
      }));
      wrong.textContent = wrongLetters(g).length ? `Erradas: ${wrongLetters(g).join(' ')}` : '';
      const marks = new Map<string, string>();
      for (const l of g.guessed) marks.set(l, g.word.text.includes(l) ? 'hit' : 'miss');
      kb.setMarks(marks);
      kb.setUsed(new Set(g.guessed));
      hintBtn.textContent = `Dica (${g.hintsLeft})`;
      hintBtn.disabled = g.hintsLeft === 0 || isOver(g);
    },
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}

export const hangman = createGame<HangmanState, WordLevelId>({
  meta: { id: 'hangman', title: 'Forca', description: 'Adivinhe a palavra antes de acabarem as tentativas.', icon: '🔤' },
  help: HELP,
  levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
  newGame: (level) => startHangman(level),
  levelOf: (s) => s.level,
  save: {
    key: 'jj.hangman.game.v1',
    parse: parseSaved,
    serialize: (s) => ({ level: s.level, word: s.word.text, guessed: s.guessed, hintsLeft: s.hintsLeft }),
    isOver,
  },
  resumeLabel: (s) => `${WORD_LEVELS[s.level].label} · ${errorsOf(s)}/${MAX_ERRORS} erros`,
  className: 'hangman',
  statusText: (s) => `${WORD_LEVELS[s.level].label} · ${errorsOf(s)}/${MAX_ERRORS}`,
  mountView,
  finish: (s) => ({
    title: isWon(s) ? 'Você acertou!' : 'Fim de jogo',
    html: `<p>${isWon(s) ? 'A palavra é' : 'A palavra era'} <strong>${s.word.text}</strong>.</p>`,
  }),
});
