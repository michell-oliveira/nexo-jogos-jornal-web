import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, renderMenu } from '../../core/ui';
import { letterKeyboard } from '../words/keyboard';
import {
  CRYPTO_LEVELS, CRYPTO_LEVEL_IDS, erase, hint, input, isSolved, numberOf, parseSaved, select, solutionOf,
  solvedLetters, startCrypto, wrongNumbers, type CryptoLevelId, type CryptoState,
} from './domain';

const GAME_KEY = 'jj.cryptogram.game.v1';

function loadSaved(): CryptoState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isSolved(s) ? s : null;
}

function mount(root: HTMLElement): () => void {
  let game: CryptoState | null = null;
  const help = helpController(
    root, 'cryptogram', 'Como jogar',
    `<p>A frase está <strong>cifrada</strong>: cada letra foi trocada por um número, sempre o mesmo para a mesma letra.</p>
     <ul>
       <li>Toque num número e depois numa letra do teclado para palpitar.</li>
       <li>Todas as casas com o mesmo número recebem a mesma letra.</li>
       <li>Casas em vermelho estão erradas. <em>Dica</em> revela o número selecionado.</li>
     </ul>`,
  );
  const keyboard = letterKeyboard({
    onLetter: (l) => edit((g) => input(g, l)),
    onBackspace: () => edit(erase),
  });

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar — ${CRYPTO_LEVELS[saved.level].label} · ${solvedLetters(saved)}/${solutionOf(saved).size} letras`,
        onContinue: () => show(saved),
      },
      levels: CRYPTO_LEVEL_IDS.map((id) => ({ id, label: CRYPTO_LEVELS[id].label, detail: `${CRYPTO_LEVELS[id].revealed} letras reveladas` })),
      onStart: (id) => { removeKey(GAME_KEY); show(startCrypto(id as CryptoLevelId)); },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function show(s: CryptoState): void {
    game = s;
    root.innerHTML = `
      <section class="crypto">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span id="progress"></span></div>
        <div id="phrase" class="cryptoPhrase" aria-label="Frase cifrada"></div>
        <div class="controls"></div>
      </section>`;
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    root.querySelector('.controls')!.append(button('Apagar', 'btn', () => edit(erase)), button('Dica', 'btn', () => edit(hint)));
    root.querySelector('.crypto')!.append(keyboard.root);
    render();
  }

  function edit(change: (g: CryptoState) => CryptoState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    if (isSolved(next)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, next);
    render();
    if (isSolved(next)) {
      dialog(root, {
        title: 'Frase decifrada!',
        html: `<p><strong>${next.phrase}</strong></p>`,
        buttons: [
          { label: 'Novo jogo', primary: true, action: () => show(startCrypto(next.level)) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }
  }

  function render(): void {
    if (!game) return;
    const g = game;
    const sol = solutionOf(g);
    const wrong = wrongNumbers(g);
    root.querySelector('#progress')!.textContent = `${solvedLetters(g)}/${sol.size} letras`;
    const phraseEl = root.querySelector('#phrase')!;
    phraseEl.replaceChildren(...g.phrase.split(' ').map((word) => {
      const w = el('div', 'cryptoWord');
      for (const ch of word) {
        const n = numberOf(g, ch);
        const c = el('button', 'cryptoCell'
          + (n === g.selected ? ' sel' : '')
          + (g.given.includes(n) ? ' given' : '')
          + (wrong.has(n) ? ' bad' : '')
          + (g.selected !== null && g.selected !== n && g.guesses[n] !== undefined && g.guesses[n] === g.guesses[g.selected] ? ' same' : ''));
        c.type = 'button';
        c.innerHTML = `<small>${n}</small><span>${g.guesses[n] ?? ''}</span>`;
        c.addEventListener('click', () => edit((s) => select(s, n)));
        w.appendChild(c);
      }
      return w;
    }));
    const marks = new Map<string, string>();
    for (const letter of Object.values(g.guesses)) marks.set(letter, 'hit');
    keyboard.setMarks(marks);
  }

  showMenu();
  return () => root.replaceChildren();
}

export const cryptogram: GameModule = {
  id: 'cryptogram',
  title: 'Criptograma',
  description: 'Decifre a frase em que cada letra virou um símbolo.',
  icon: '🔐',
  mount,
};
