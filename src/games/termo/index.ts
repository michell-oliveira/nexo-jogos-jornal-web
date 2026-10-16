import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, renderMenu } from '../../core/ui';
import { WORDS } from '../words/bank';
import { letterKeyboard } from '../words/keyboard';
import { ANSWERS } from './answers';
import {
  LEVELS, WORD_LENGTH, backspace, evaluate, hint, hintsLeft, isOver, keyMarks, lockedOf, parseSaved, rowLetters,
  startTermo, statusOf, submit, typeLetter, type TermoLevelId, type TermoState,
} from './domain';

const GAME_KEY = 'jj.termo.game.v1';
const ASSIST_KEY = 'jj.termo.assist.v1';
const IDS = Object.keys(LEVELS) as TermoLevelId[];

/** Enquanto o dicionário completo não chega, vale o que já está embutido (respostas + banco de 5 letras). */
const BUILT_IN = new Set<string>([...ANSWERS, ...WORDS.map((w) => w.text).filter((t) => t.length === WORD_LENGTH)]);
const DICT_URL = `${import.meta.env.BASE_URL}words/pt_br_5letras.txt`;

/** Lê o dicionário como dado puro: só linhas com exatamente 5 letras A-Z entram. */
async function loadDictionary(): Promise<Set<string>> {
  const res = await fetch(DICT_URL, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(String(res.status));
  const set = new Set(BUILT_IN);
  for (const line of (await res.text()).split(/\r?\n/)) if (/^[A-Z]{5}$/.test(line)) set.add(line);
  return set;
}

function loadSaved(): TermoState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isOver(s) ? s : null;
}

function mount(root: HTMLElement): () => void {
  let game: TermoState | null = null;
  let dict: Set<string> | null = null;
  void loadDictionary().then((d) => { dict = d; }).catch(() => { /* fica com a lista embutida */ });
  const isValid = (w: string): boolean => (dict ?? BUILT_IN).has(w);

  const help = helpController(
    root, 'termo', 'Como jogar',
    `<p>Descubra a palavra de <strong>5 letras</strong> no número de tentativas do nível.</p>
     <ul>
       <li>Digite uma palavra que exista e envie com Enter (↵).</li>
       <li><strong>Verde</strong>: letra certa no lugar certo.</li>
       <li><strong>Amarelo</strong>: a palavra tem a letra, mas em outro lugar.</li>
       <li><strong>Cinza</strong>: a palavra não tem a letra (ou já foi usada as vezes que aparece).</li>
     </ul>
     <p>A <em>dica</em> revela uma letra no lugar certo, sem gastar tentativa. Sem acentos: use a letra simples.</p>`,
  );

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar partida — ${LEVELS[saved.level].label} · ${saved.guesses.length}/${LEVELS[saved.level].attempts}`,
        onContinue: () => show(saved),
      },
      levels: IDS.map((id) => ({ id, label: LEVELS[id].label, detail: `${LEVELS[id].attempts} tentativas · ${LEVELS[id].hints} dica(s)` })),
      onStart: (id) => {
        removeKey(GAME_KEY);
        show(startTermo(id as TermoLevelId, readJson(ASSIST_KEY) === true));
      },
      onHelp: help.open,
    });
    const assistBtn = button('', 'btn wide helpBtn', () => {
      writeJson(ASSIST_KEY, readJson(ASSIST_KEY) !== true);
      paintAssist();
    });
    const paintAssist = (): void => {
      assistBtn.textContent = `Travar letras verdes: ${readJson(ASSIST_KEY) === true ? 'ligado' : 'desligado'}`;
    };
    paintAssist();
    root.querySelector('.home')!.appendChild(assistBtn);
    help.openFirstTime();
  }

  function save(): void {
    if (!game) return;
    if (isOver(game)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, game);
  }

  const kb = letterKeyboard({
    onLetter: (l) => edit((g) => typeLetter(g, l)),
    onEnter: () => send(),
    onBackspace: () => edit(backspace),
  });

  function show(s: TermoState): void {
    game = s;
    root.innerHTML = `
      <section class="termo">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span>${LEVELS[s.level].label}</span><span id="progress"></span></div>
        <div id="board" class="termoBoard" role="grid" aria-label="Tentativas do Termo"></div>
        <p id="msg" class="termoMsg" role="status" aria-live="polite"></p>
        <div class="controls"></div>
      </section>`;
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    const hintBtn = button('Dica', 'btn', () => edit((g) => hint(g)));
    hintBtn.id = 'hintBtn';
    root.querySelector('.controls')!.append(hintBtn, button('Como jogar', 'btn', help.open));
    root.querySelector('.termo')!.appendChild(kb.root);
    render();
  }

  function say(text: string): void {
    const m = root.querySelector('#msg');
    if (m) m.textContent = text;
  }

  function edit(change: (g: TermoState) => TermoState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    say('');
    save();
    render();
  }

  function send(): void {
    if (!game) return;
    const { state, result } = submit(game, isValid);
    if (result === 'incomplete') return say('Faltam letras.');
    if (result === 'unknown') return say('Palavra não encontrada no dicionário.');
    if (result === 'finished') return;
    game = state;
    say('');
    save();
    render();
    const st = statusOf(state);
    if (st !== 'playing') finish(state, st === 'won');
  }

  function finish(s: TermoState, won: boolean): void {
    dialog(root, {
      title: won ? 'Acertou!' : 'Não foi dessa vez',
      html: won
        ? `<p>Você descobriu <strong>${s.answer}</strong> em ${s.guesses.length} tentativa(s).</p>`
        : `<p>A palavra era <strong>${s.answer}</strong>.</p>`,
      buttons: [
        { label: 'Jogar outro', primary: true, action: () => show(startTermo(s.level, s.assist)) },
        { label: 'Menu', action: showMenu },
      ],
    });
  }

  function render(): void {
    if (!game) return;
    const g = game;
    const max = LEVELS[g.level].attempts;
    const board = root.querySelector<HTMLElement>('#board')!;
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
    root.querySelector('#progress')!.textContent = `${g.guesses.length}/${max}`;
    const hb = root.querySelector<HTMLButtonElement>('#hintBtn')!;
    hb.textContent = `Dica (${hintsLeft(g)})`;
    hb.disabled = hintsLeft(g) <= 0 || isOver(g);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (!game || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    else if (e.key === 'Backspace') edit(backspace);
    else if (/^[a-zA-Z]$/.test(e.key)) edit((g) => typeLetter(g, e.key.toUpperCase()));
  };
  document.addEventListener('keydown', onKey);

  showMenu();
  return () => {
    document.removeEventListener('keydown', onKey);
    root.replaceChildren();
  };
}

export const termo: GameModule = {
  id: 'termo',
  title: 'Termo',
  description: 'Descubra a palavra de 5 letras em 6 tentativas.',
  icon: '🟩',
  mount,
};
