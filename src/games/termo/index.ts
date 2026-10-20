import { createGame, type GameHost } from '../../core/gameShell';
import { button, el } from '../../core/dom';
import { persistedFlag } from '../../core/option';
import { WORDS } from '../words/bank';
import { letterKeyboard } from '../words/keyboard';
import { ANSWERS } from './answers';
import {
  LEVELS, WORD_LENGTH, backspace, evaluate, hint, hintsLeft, isOver, keyMarks, lockedOf, parseSaved, rowLetters,
  startTermo, statusOf, submit, typeLetter, type TermoLevelId, type TermoState,
} from './domain';

const IDS = Object.keys(LEVELS) as TermoLevelId[];

/** Enquanto o dicionário completo não chega, vale o que já está embutido (respostas + banco de 5 letras). */
const BUILT_IN = new Set<string>([...ANSWERS, ...WORDS.map((w) => w.text).filter((t) => t.length === WORD_LENGTH)]);
const DICT_URL = `${import.meta.env.BASE_URL}words/pt_br_5letras.txt`;

const HELP = `<p>Descubra a palavra de <strong>5 letras</strong> no número de tentativas do nível.</p>
     <ul>
       <li>Digite uma palavra que exista e envie com Enter (↵).</li>
       <li><strong>Verde</strong>: letra certa no lugar certo.</li>
       <li><strong>Amarelo</strong>: a palavra tem a letra, mas em outro lugar.</li>
       <li><strong>Cinza</strong>: a palavra não tem a letra (ou já foi usada as vezes que aparece).</li>
     </ul>
     <p>A <em>dica</em> revela uma letra no lugar certo, sem gastar tentativa. Sem acentos: use a letra simples.</p>`;

/** Lê o dicionário como dado puro: só linhas com exatamente 5 letras A-Z entram. */
async function loadDictionary(): Promise<Set<string>> {
  const res = await fetch(DICT_URL, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(String(res.status));
  const set = new Set(BUILT_IN);
  for (const line of (await res.text()).split(/\r?\n/)) if (/^[A-Z]{5}$/.test(line)) set.add(line);
  return set;
}

let dict: Set<string> | null = null;
let dictLoading = false;
/** Baixa o dicionário completo uma vez; até chegar (ou se falhar) vale a lista embutida. */
function warmDictionary(): void {
  if (dict || dictLoading) return;
  dictLoading = true;
  void loadDictionary().then((d) => { dict = d; }).catch(() => { dictLoading = false; });
}
const isValid = (word: string): boolean => (dict ?? BUILT_IN).has(word);

const assist = persistedFlag('jj.termo.assist.v1', false);

function mountView(body: HTMLElement, host: GameHost<TermoState>) {
  warmDictionary();
  const edit = (change: (g: TermoState) => TermoState) => host.update(change(host.state()));
  const send = (): void => {
    const { state, result } = submit(host.state(), isValid);
    if (result === 'incomplete') return say('Faltam letras.');
    if (result === 'unknown') return say('Palavra não encontrada no dicionário.');
    if (result === 'accepted') host.update(state);
  };
  const kb = letterKeyboard({
    onLetter: (l) => edit((g) => typeLetter(g, l)),
    onEnter: send,
    onBackspace: () => edit(backspace),
  });
  const board = el('div', 'termoBoard');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Tentativas do Termo');
  const msg = el('p', 'termoMsg');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  const hintBtn = button('Dica', 'btn', () => edit(hint));
  const controls = el('div', 'controls');
  controls.append(hintBtn);
  body.append(board, msg, controls, kb.root);

  function say(text: string): void { msg.textContent = text; }

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    else if (e.key === 'Backspace') edit(backspace);
    else if (/^[a-zA-Z]$/.test(e.key)) edit((g) => typeLetter(g, e.key.toUpperCase()));
  };
  document.addEventListener('keydown', onKey);

  return {
    render(g: TermoState): void {
      say('');
      const max = LEVELS[g.level].attempts;
      board.replaceChildren();
      const locked = lockedOf(g);
      const letters = rowLetters(g);
      for (let r = 0; r < max; r++) {
        const row = el('div', 'trow');
        row.setAttribute('role', 'row');
        const guess = g.guesses[r];
        const marks = guess ? evaluate(guess, g.answer) : null;
        for (let i = 0; i < WORD_LENGTH; i++) {
          const cell = el('div', 'tl');
          cell.setAttribute('role', 'gridcell');
          if (guess) {
            cell.textContent = guess[i]!;
            cell.classList.add(marks![i]!);
          } else if (r === g.guesses.length && !isOver(g)) {
            cell.textContent = letters[i]!;
            cell.classList.add('cur');
            if (locked.has(i)) cell.classList.add('locked');
          }
          row.appendChild(cell);
        }
        board.appendChild(row);
      }
      kb.setMarks(keyMarks(g));
      hintBtn.textContent = `Dica (${hintsLeft(g)})`;
      hintBtn.disabled = hintsLeft(g) <= 0 || isOver(g);
    },
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}

function assistButton(): HTMLElement {
  const paint = (): string => `Travar letras verdes: ${assist.get() ? 'ligado' : 'desligado'}`;
  const b = button(paint(), 'btn wide helpBtn', () => {
    assist.set(!assist.get());
    b.textContent = paint();
  });
  return b;
}

export const termo = createGame<TermoState, TermoLevelId>({
  meta: { id: 'termo', title: 'Termo', description: 'Descubra a palavra de 5 letras em 6 tentativas.', icon: '🟩' },
  help: HELP,
  levels: IDS.map((id) => ({ id, label: LEVELS[id].label, detail: `${LEVELS[id].attempts} tentativas · ${LEVELS[id].hints} dica(s)` })),
  newGame: (level, options) => startTermo(level, options.assist === true),
  levelOf: (s) => s.level,
  save: { key: 'jj.termo.game.v1', parse: parseSaved, serialize: (s) => s, isOver },
  resumeLabel: (s) => `${LEVELS[s.level].label} · ${s.guesses.length}/${LEVELS[s.level].attempts}`,
  options: { assist },
  menuExtras: () => [assistButton()],
  className: 'termo',
  statusText: (s) => `${LEVELS[s.level].label} · ${s.guesses.length}/${LEVELS[s.level].attempts}`,
  mountView,
  finish: (s) => statusOf(s) === 'won'
    ? { title: 'Acertou!', html: `<p>Você descobriu <strong>${s.answer}</strong> em ${s.guesses.length} tentativa(s).</p>` }
    : { title: 'Não foi dessa vez', html: `<p>A palavra era <strong>${s.answer}</strong>.</p>` },
});
