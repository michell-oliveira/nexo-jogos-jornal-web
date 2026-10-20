import { createGame, type GameHost } from '../../core/gameShell';
import { button, el } from '../../core/dom';
import { letterKeyboard } from '../words/keyboard';
import {
  CRYPTO_LEVELS, CRYPTO_LEVEL_IDS, erase, hint, input, isSolved, numberOf, parseSaved, select, solutionOf,
  solvedLetters, startCrypto, wrongNumbers, type CryptoLevelId, type CryptoState,
} from './domain';

const HELP = `<p>A frase está <strong>cifrada</strong>: cada letra foi trocada por um número, sempre o mesmo para a mesma letra.</p>
     <ul>
       <li>Toque num número e depois numa letra do teclado para palpitar.</li>
       <li>Todas as casas com o mesmo número recebem a mesma letra.</li>
       <li>Casas em vermelho estão erradas. <em>Dica</em> revela o número selecionado.</li>
     </ul>`;

function mountView(body: HTMLElement, host: GameHost<CryptoState>) {
  const edit = (change: (g: CryptoState) => CryptoState) => host.update(change(host.state()));
  const keyboard = letterKeyboard({
    onLetter: (l) => edit((g) => input(g, l)),
    onBackspace: () => edit(erase),
  });
  const phraseEl = el('div', 'cryptoPhrase');
  phraseEl.setAttribute('aria-label', 'Frase cifrada');
  const controls = el('div', 'controls');
  controls.append(button('Apagar', 'btn', () => edit(erase)), button('Dica', 'btn', () => edit(hint)));
  body.append(phraseEl, controls, keyboard.root);

  return {
    render(g: CryptoState): void {
      const wrong = wrongNumbers(g);
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
    },
  };
}

export const cryptogram = createGame<CryptoState, CryptoLevelId>({
  meta: { id: 'cryptogram', title: 'Criptograma', description: 'Decifre a frase em que cada letra virou um símbolo.', icon: '🔐' },
  help: HELP,
  levels: CRYPTO_LEVEL_IDS.map((id) => ({ id, label: CRYPTO_LEVELS[id].label, detail: `${CRYPTO_LEVELS[id].revealed} letras reveladas` })),
  newGame: (level) => startCrypto(level),
  levelOf: (s) => s.level,
  save: { key: 'jj.cryptogram.game.v1', parse: parseSaved, serialize: (s) => s, isOver: isSolved },
  resumeLabel: (s) => `${CRYPTO_LEVELS[s.level].label} · ${solvedLetters(s)}/${solutionOf(s).size} letras`,
  className: 'crypto',
  statusText: (s) => `${solvedLetters(s)}/${solutionOf(s).size} letras`,
  mountView,
  finish: (s) => ({ title: 'Frase decifrada!', html: `<p><strong>${s.phrase}</strong></p>` }),
});
