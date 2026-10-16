import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, renderMenu } from '../../core/ui';
import { letterKeyboard } from '../words/keyboard';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  erase, hint, hintsLeft, input, isKnown, isSolved, knownLetters, letterAt, nextRow, numberAt, parseSaved, rowSolved,
  rowWrong, selectCell, showsClue, solvedRows, startCipher, toSaved, toggleAutoReveal, type CipherState,
} from './domain';

const GAME_KEY = 'jj.wordcipher.game.v1';
const AUTO_KEY = 'jj.wordcipher.auto.v1';

function loadSaved(): CipherState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isSolved(s) ? s : null;
}

function mount(root: HTMLElement): () => void {
  let game: CipherState | null = null;
  const help = helpController(
    root, 'wordcipher', 'Como jogar',
    `<p>Cinco palavras estão <strong>cifradas</strong>: cada letra virou um número, o mesmo em todas as palavras.</p>
     <ul>
       <li>Toque numa casa e digite a letra. Use a dica escrita de cada palavra.</li>
       <li>Ao acertar uma palavra, os números dela aparecem como letras nas outras (se a revelação automática estiver ligada).</li>
       <li><em>Dica</em> revela um número em toda a grade; o número de dicas depende do nível.</li>
     </ul>`,
  );
  const keyboard = letterKeyboard({
    onLetter: (l) => edit((g) => input(g, l)),
    onEnter: () => edit(nextRow),
    onBackspace: () => edit(erase),
  });

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar — ${WORD_LEVELS[saved.level].label} · ${solvedRows(saved)}/${saved.words.length} palavras`,
        onContinue: () => show(saved),
      },
      levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
      onStart: (id) => {
        removeKey(GAME_KEY);
        show(startCipher(id as WordLevelId, readJson(AUTO_KEY) !== false));
      },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function show(s: CipherState): void {
    game = s;
    root.innerHTML = `
      <section class="cipher">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span id="progress"></span></div>
        <div id="rows" class="cipherRows"></div>
        <div class="controls"></div>
      </section>`;
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    const hintBtn = button('Dica', 'btn', () => edit(hint));
    hintBtn.id = 'hintBtn';
    const autoBtn = button('', 'btn', () => {
      edit(toggleAutoReveal);
      writeJson(AUTO_KEY, game?.autoReveal ?? true);
    });
    autoBtn.id = 'autoBtn';
    root.querySelector('.controls')!.append(hintBtn, autoBtn);
    root.querySelector('.cipher')!.append(keyboard.root);
    render();
  }

  function edit(change: (g: CipherState) => CipherState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    if (isSolved(next)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, toSaved(next));
    render();
    if (isSolved(next)) {
      dialog(root, {
        title: 'Tudo decifrado!',
        html: `<p>${next.words.map((w) => `<strong>${w.text}</strong>`).join(' · ')}</p><p>Dicas usadas: ${next.hintsUsed}</p>`,
        buttons: [
          { label: 'Novo jogo', primary: true, action: () => show(startCipher(next.level, next.autoReveal)) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }
  }

  function render(): void {
    if (!game) return;
    const g = game;
    root.querySelector('#progress')!.textContent = `${solvedRows(g)}/${g.words.length} palavras`;
    (root.querySelector('#hintBtn') as HTMLButtonElement).textContent = `Dica (${hintsLeft(g)})`;
    (root.querySelector('#hintBtn') as HTMLButtonElement).disabled = hintsLeft(g) <= 0;
    root.querySelector('#autoBtn')!.textContent = `Revelar auto: ${g.autoReveal ? 'sim' : 'não'}`;
    root.querySelector('#rows')!.replaceChildren(...g.words.map((w, r) => {
      const wrap = el('div', 'cipherRow' + (rowSolved(g, r) ? ' done' : '') + (rowWrong(g, r) ? ' wrong' : ''));
      const clue = el('p', 'cipherClue');
      clue.textContent = showsClue(g.level) ? `${w.category} — ${w.hint}` : w.category;
      const cells = el('div', 'cipherCells');
      [...w.text].forEach((_, c) => {
        const known = isKnown(g, r, c);
        const b = el('button', 'cryptoCell'
          + (g.row === r && g.col === c ? ' sel' : '')
          + (known ? ' given' : ''));
        b.type = 'button';
        b.innerHTML = `<small>${numberAt(g, r, c)}</small><span>${letterAt(g, r, c) ?? ''}</span>`;
        b.addEventListener('click', () => edit((s) => selectCell(s, r, c)));
        cells.appendChild(b);
      });
      wrap.append(clue, cells);
      return wrap;
    }));
    const marks = new Map<string, string>();
    for (const l of knownLetters(g)) marks.set(l, 'hit');
    keyboard.setMarks(marks);
  }

  showMenu();
  return () => root.replaceChildren();
}

export const wordcipher: GameModule = {
  id: 'wordcipher',
  title: 'Palavras Cifradas',
  description: 'Decifre as palavras escondidas na cifra.',
  icon: '🗝️',
  mount,
};
