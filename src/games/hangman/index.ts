import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, helpController, renderMenu } from '../../core/ui';
import { letterKeyboard } from '../words/keyboard';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  MAX_ERRORS, errorsOf, guess, hint, isLost, isOver, isWon, parseSaved, shown, startHangman, wrongLetters,
  type HangmanState,
} from './domain';

const GAME_KEY = 'jj.hangman.game.v1';

function loadSaved(): HangmanState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isOver(s) ? s : null;
}

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

function mount(root: HTMLElement): () => void {
  let game: HangmanState | null = null;
  const help = helpController(
    root, 'hangman', 'Como jogar',
    `<p>Descubra a palavra escolhendo letras. A dica mostra a categoria e uma pista.</p>
     <ul>
       <li>Letra certa aparece em todos os lugares onde está na palavra.</li>
       <li>Você perde com <strong>${MAX_ERRORS} erros</strong>.</li>
       <li>O botão <em>Dica</em> revela uma letra sem contar erro (quantidade limitada por nível).</li>
     </ul>`,
  );

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar partida — ${WORD_LEVELS[saved.level].label} · ${errorsOf(saved)}/${MAX_ERRORS} erros`,
        onContinue: () => show(saved),
      },
      levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
      onStart: (id) => { removeKey(GAME_KEY); show(startHangman(id as WordLevelId)); },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  const kb = letterKeyboard({ onLetter: (l) => edit((g) => guess(g, l)) });

  function show(s: HangmanState): void {
    game = s;
    root.innerHTML = `
      <section class="hangman">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span>${WORD_LEVELS[s.level].label}</span><span id="errors"></span></div>
        <div id="art"></div>
        <p class="clue"><strong>${s.word.category}</strong> — ${s.word.hint}</p>
        <div id="word" class="hangWord" aria-live="polite"></div>
        <p id="wrong" class="hangWrong"></p>
        <div class="controls"></div>
      </section>`;
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    const hintBtn = button('Dica', 'btn', () => edit(hint));
    hintBtn.id = 'hintBtn';
    root.querySelector('.controls')!.append(hintBtn, button('Como jogar', 'btn', help.open));
    root.querySelector('.hangman')!.appendChild(kb.root);
    render();
  }

  function edit(change: (g: HangmanState) => HangmanState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    if (isOver(next)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, { level: next.level, word: next.word.text, guessed: next.guessed, hintsLeft: next.hintsLeft });
    render();
    if (isOver(next)) {
      const won = isWon(next);
      dialog(root, {
        title: won ? 'Você acertou!' : 'Fim de jogo',
        html: `<p>${won ? 'A palavra é' : 'A palavra era'} <strong>${next.word.text}</strong>.</p>`,
        buttons: [
          { label: 'Jogar outra', primary: true, action: () => show(startHangman(next.level)) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }
  }

  function render(): void {
    if (!game) return;
    const g = game;
    root.querySelector('#art')!.innerHTML = gallows(errorsOf(g));
    const word = root.querySelector('#word')!;
    word.replaceChildren(...shown(g).map((l) => {
      const s = document.createElement('span');
      s.className = 'hl' + (isLost(g) && !g.guessed.includes(l) ? ' missed' : '');
      s.textContent = l || '_';
      return s;
    }));
    root.querySelector('#errors')!.textContent = `${errorsOf(g)}/${MAX_ERRORS}`;
    root.querySelector('#wrong')!.textContent = wrongLetters(g).length ? `Erradas: ${wrongLetters(g).join(' ')}` : '';
    const marks = new Map<string, string>();
    for (const l of g.guessed) marks.set(l, g.word.text.includes(l) ? 'hit' : 'miss');
    kb.setMarks(marks);
    kb.setUsed(new Set(g.guessed));
    const hb = root.querySelector<HTMLButtonElement>('#hintBtn')!;
    hb.textContent = `Dica (${g.hintsLeft})`;
    hb.disabled = g.hintsLeft === 0 || isOver(g);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (!game || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (/^[a-zA-Z]$/.test(e.key)) edit((g) => guess(g, e.key.toUpperCase()));
  };
  document.addEventListener('keydown', onKey);

  showMenu();
  return () => {
    document.removeEventListener('keydown', onKey);
    root.replaceChildren();
  };
}

export const hangman: GameModule = {
  id: 'hangman',
  title: 'Forca',
  description: 'Adivinhe a palavra antes de acabarem as tentativas.',
  icon: '🔤',
  mount,
};
