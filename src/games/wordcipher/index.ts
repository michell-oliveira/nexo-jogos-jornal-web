import { createGame, type GameHost } from '../../core/gameShell';
import { persistedFlag } from '../../core/option';
import { button, el } from '../../core/dom';
import { letterKeyboard } from '../words/keyboard';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  erase, hint, hintsLeft, input, isKnown, isSolved, knownLetters, letterAt, nextRow, numberAt, parseSaved, rowSolved,
  rowWrong, selectCell, showsClue, solvedRows, startCipher, toSaved, toggleAutoReveal, type CipherState,
} from './domain';

const HELP = `<p>Cinco palavras estão <strong>cifradas</strong>: cada letra virou um número, o mesmo em todas as palavras.</p>
     <ul>
       <li>Toque numa casa e digite a letra. Use a dica escrita de cada palavra.</li>
       <li>Ao acertar uma palavra, os números dela aparecem como letras nas outras (se a revelação automática estiver ligada).</li>
       <li><em>Dica</em> revela um número em toda a grade; o número de dicas depende do nível.</li>
     </ul>`;

function mountView(body: HTMLElement, host: GameHost<CipherState>) {
  const edit = (change: (g: CipherState) => CipherState) => host.update(change(host.state()));
  const keyboard = letterKeyboard({
    onLetter: (l) => edit((g) => input(g, l)),
    onEnter: () => edit(nextRow),
    onBackspace: () => edit(erase),
  });
  const hintBtn = button('Dica', 'btn', () => edit(hint));
  const autoBtn = button('', 'btn', () => {
    edit(toggleAutoReveal);
    host.option<boolean>('autoReveal').set(host.state().autoReveal);
  });
  const controls = el('div', 'controls');
  controls.append(hintBtn, autoBtn);
  const rows = el('div', 'cipherRows');
  body.append(controls, rows, keyboard.root);

  return {
    render(g: CipherState): void {
      hintBtn.textContent = `Dica (${hintsLeft(g)})`;
      hintBtn.disabled = hintsLeft(g) <= 0;
      autoBtn.textContent = `Revelar auto: ${g.autoReveal ? 'sim' : 'não'}`;
      rows.replaceChildren(...g.words.map((w, r) => {
        const wrap = el('div', 'cipherRow' + (rowSolved(g, r) ? ' done' : '') + (rowWrong(g, r) ? ' wrong' : ''));
        const clue = el('p', 'cipherClue');
        clue.textContent = showsClue(g.level) ? `${w.category} — ${w.hint}` : w.category;
        const cells = el('div', 'cipherCells');
        [...w.text].forEach((_, c) => {
          const b = el('button', 'cryptoCell'
            + (g.row === r && g.col === c ? ' sel' : '')
            + (isKnown(g, r, c) ? ' given' : ''));
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
    },
  };
}

export const wordcipher = createGame<CipherState, WordLevelId>({
  meta: { id: 'wordcipher', title: 'Palavras Cifradas', description: 'Decifre as palavras escondidas na cifra.', icon: '🗝️' },
  help: HELP,
  levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
  newGame: (level, options) => startCipher(level, options.autoReveal as boolean),
  levelOf: (s) => s.level,
  save: { key: 'jj.wordcipher.game.v1', parse: parseSaved, serialize: toSaved, isOver: isSolved },
  resumeLabel: (s) => `${WORD_LEVELS[s.level].label} · ${solvedRows(s)}/${s.words.length} palavras`,
  options: { autoReveal: persistedFlag('jj.wordcipher.auto.v1', true) },
  className: 'cipher',
  statusText: (s) => `${solvedRows(s)}/${s.words.length} palavras`,
  mountView,
  finish: (s) => ({
    title: 'Tudo decifrado!',
    html: `<p>${s.words.map((w) => `<strong>${w.text}</strong>`).join(' · ')}</p><p>Dicas usadas: ${s.hintsUsed}</p>`,
  }),
});
