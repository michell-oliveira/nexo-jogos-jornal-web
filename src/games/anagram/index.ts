import { readJson, removeKey, writeJson } from '../../core/storage';
import type { GameModule } from '../../core/types';
import { button, dialog, el, helpController, renderMenu } from '../../core/ui';
import { WORD_LEVELS, WORD_LEVEL_IDS, type WordLevelId } from '../words/shared';
import {
  WORDS_PER_ROUND, check, clear, currentWord, hintVisible, isCorrect, isFinished, isFull, parseSaved, place, removeAt,
  reshuffle, showHint, skip, startAnagram, toSaved, type AnagramState,
} from './domain';

const GAME_KEY = 'jj.anagram.game.v1';

function loadSaved(): AnagramState | null {
  const s = parseSaved(readJson(GAME_KEY));
  return s && !isFinished(s) ? s : null;
}

function mount(root: HTMLElement): () => void {
  let game: AnagramState | null = null;
  const help = helpController(
    root, 'anagram', 'Como jogar',
    `<p>As letras da palavra estão <strong>embaralhadas</strong>. Toque nelas na ordem certa para formar a palavra.</p>
     <ul>
       <li>Toque numa letra já colocada para devolvê-la.</li>
       <li><em>Embaralhar</em> reorganiza as letras; <em>Pular</em> passa para a próxima sem pontuar.</li>
       <li>Cada rodada tem ${WORDS_PER_ROUND} palavras. Acertou, ganha 1 ponto.</li>
     </ul>`,
  );

  function showMenu(): void {
    const saved = loadSaved();
    renderMenu(root, {
      saved: saved && {
        text: `Continuar rodada — ${WORD_LEVELS[saved.level].label} · palavra ${saved.index + 1}/${saved.words.length}`,
        onContinue: () => show(saved),
      },
      levels: WORD_LEVEL_IDS.map((id) => ({ id, label: WORD_LEVELS[id].label, detail: `${WORD_LEVELS[id].min} a ${WORD_LEVELS[id].max} letras` })),
      onStart: (id) => { removeKey(GAME_KEY); show(startAnagram(id as WordLevelId)); },
      onHelp: help.open,
    });
    help.openFirstTime();
  }

  function show(s: AnagramState): void {
    game = s;
    root.innerHTML = `
      <section class="anagram">
        <div class="status"><button id="menuBtn" class="btn" type="button">Menu</button>
          <span id="round"></span><span id="score"></span></div>
        <p id="clue" class="clue"></p>
        <div id="slots" class="anaSlots" aria-label="Resposta"></div>
        <div id="pool" class="anaPool" aria-label="Letras"></div>
        <p id="msg" class="termoMsg" role="status" aria-live="polite"></p>
        <div class="controls"></div>
      </section>`;
    root.querySelector('#menuBtn')!.addEventListener('click', showMenu);
    root.querySelector('.controls')!.append(
      button('Limpar', 'btn', () => edit(clear)),
      button('Embaralhar', 'btn', () => edit((g) => reshuffle(g))),
      button('Dica', 'btn', () => edit(showHint)),
      button('Pular', 'btn', () => edit((g) => skip(g))),
    );
    render();
  }

  function edit(change: (g: AnagramState) => AnagramState): void {
    if (!game) return;
    const next = change(game);
    if (next === game) return;
    game = next;
    persist();
    render();
    if (isFinished(next)) finish(next);
  }

  function persist(): void {
    if (!game) return;
    if (isFinished(game)) removeKey(GAME_KEY);
    else writeJson(GAME_KEY, toSaved(game));
  }

  function finish(s: AnagramState): void {
    dialog(root, {
      title: 'Rodada concluída',
      html: `<p>Você acertou <strong>${s.score}</strong> de ${s.words.length} palavras.</p>`,
      buttons: [
        { label: 'Nova rodada', primary: true, action: () => show(startAnagram(s.level)) },
        { label: 'Menu', action: showMenu },
      ],
    });
  }

  function render(): void {
    if (!game || isFinished(game)) return;
    const g = game;
    const w = currentWord(g);
    root.querySelector('#round')!.textContent = `${g.index + 1}/${g.words.length}`;
    root.querySelector('#score')!.textContent = `Pontos: ${g.score}`;
    root.querySelector('#clue')!.innerHTML = hintVisible(g)
      ? `<strong>${w.category}</strong> — ${w.hint}`
      : '<em>Dica oculta — toque em Dica</em>';
    const slots = root.querySelector('#slots')!;
    slots.replaceChildren(...Array.from({ length: g.scrambled.length }, (_, i) => {
      const b = el('button', 'ana slot' + (isFull(g) ? (isCorrect(g) ? ' ok' : ' bad') : ''));
      b.type = 'button';
      b.textContent = g.placed[i] === undefined ? '' : g.scrambled[g.placed[i]!]!;
      b.disabled = g.placed[i] === undefined;
      b.addEventListener('click', () => edit((s) => removeAt(s, i)));
      return b;
    }));
    const pool = root.querySelector('#pool')!;
    pool.replaceChildren(...[...g.scrambled].map((l, i) => {
      const b = el('button', 'ana');
      b.type = 'button';
      b.textContent = l;
      b.disabled = g.placed.includes(i);
      b.addEventListener('click', () => {
        edit((s) => place(s, i));
        // certo: avança sozinho; errado: o aviso fica visível e o jogador corrige tocando nas letras
        if (game && !isFinished(game) && isFull(game)) {
          if (isCorrect(game)) setTimeout(() => edit((s) => check(s)), 450);
          else root.querySelector('#msg')!.textContent = 'Ainda não é essa. Toque numa letra para corrigir.';
        }
      });
      return b;
    }));
    if (!isFull(g)) root.querySelector('#msg')!.textContent = '';
  }

  showMenu();
  return () => root.replaceChildren();
}

export const anagram: GameModule = {
  id: 'anagram',
  title: 'Anagrama',
  description: 'Reordene as letras e descubra a palavra.',
  icon: '🔀',
  mount,
};
