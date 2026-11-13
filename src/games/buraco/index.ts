import { dialog } from '../../core/dialog';
import { el } from '../../core/dom';
import { createGame, type GameHost } from '../../core/gameShell';
import type { GameContext } from '../../core/types';
import { aiStep } from './domain/ai';
import { isJoker, isWildcard, type Card } from './domain/cards';
import {
  addToMeld, COMPUTER, discardCard, drawFromStock, HUMAN, matchWinner, newGame, nextRound, playMeld, takeDiscardPile,
  type GameState, type PlayerIndex, type Result,
} from './domain/game';
import { CLEAN_CANASTA_BONUS, DIRTY_CANASTA_BONUS, TARGET_SCORE } from './domain/scoring';
import { CANASTA_SIZE, isCanasta, isCleanCanasta, type Meld } from './domain/meld';
import { mineKey, planMoves } from './flights';
import { CARD_W, dropIndex, fanStep, moveId, nextSortMode, reconcileOrder, sortHand, type SortMode } from './handOrder';

const HELP = `<p><strong>Buraco para 2 jogadores</strong>: você contra o computador. Cada um recebe 11 cartas e um <strong>morto</strong> de 11 cartas. A partida é jogada em rodadas até alguém chegar a ${TARGET_SCORE.toLocaleString('pt-BR')} pontos.</p>
<p><strong>Sua vez:</strong> 1) compre do <em>Monte</em> ou pegue o <em>Descarte</em> inteiro; 2) baixe jogos, acrescente cartas aos seus jogos e termine descartando uma carta.</p>
<p><strong>Jogo</strong> = 3 ou mais cartas do mesmo naipe em sequência (o Ás vale no início ou no fim). O 2 e o coringa substituem uma carta, no máximo um por jogo. Com ${CANASTA_SIZE} cartas o jogo vira <strong>canastra</strong>: limpa (${CLEAN_CANASTA_BONUS}) ou suja (${DIRTY_CANASTA_BONUS}).</p>
<p>Ao esvaziar a mão você pega o morto; para <strong>bater</strong> é preciso ter ao menos uma canastra.</p>
<p><strong>Mão em leque:</strong> toque numa carta para selecioná-la, arraste para reordenar e solte sobre o Descarte para descartar. <em>Organizar</em> alterna entre agrupar por naipe e por valor.</p>`;

const AI_DELAY_MS = 750;
const FLY_MS = 320;
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const RANK_TEXT: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const fmt = (n: number): string => n.toLocaleString('pt-BR');
const signed = (n: number): string => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '—');

/** Tabela da rodada encerrada (também usada no fim da partida). */
export function roundTableHtml(s: GameState): string {
  const r = s.result;
  if (!r) return '';
  const [h, c] = r.scores;
  const row = (label: string, a: string, b: string): string => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
  return `<table class="buracoTable">
    <tr><th></th><th>Você</th><th>Comput.</th></tr>
    ${row('Canastras', signed(h.canastas), signed(c.canastas))}
    ${row('Cartas baixadas', signed(h.melded), signed(c.melded))}
    ${row('Bateu', signed(h.goOut), signed(c.goOut))}
    ${row('Cartas na mão', signed(-h.handPenalty), signed(-c.handPenalty))}
    ${row('<b>Rodada</b>', `<b>${signed(h.total)}</b>`, `<b>${signed(c.total)}</b>`)}
    ${row('<b>Total</b>', `<b>${fmt(s.matchScore[0])}</b>`, `<b>${fmt(s.matchScore[1])}</b>`)}
  </table>`;
}

// ---------------------------------------------------------------- persistência

const isCard = (c: unknown): c is Card => {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  return typeof o.id === 'number' && typeof o.rank === 'number' && (o.suit === null || ['S', 'H', 'D', 'C'].includes(o.suit as string));
};
const isCards = (a: unknown): a is Card[] => Array.isArray(a) && a.every(isCard);

function parseState(raw: unknown): GameState | null {
  const s = raw as Partial<GameState> | null;
  if (!s || typeof s !== 'object' || !isCards(s.stock) || !isCards(s.discard)) return null;
  if (!Array.isArray(s.players) || s.players.length !== 2) return null;
  for (const p of s.players) {
    const ok = p && isCards(p.hand) && Array.isArray(p.melds) && (p.dead === null || isCards(p.dead)) &&
      p.melds.every((m: Meld) => typeof m.id === 'number' && typeof m.start === 'number' && isCards(m.cards));
    if (!ok) return null;
  }
  const okMeta = (s.current === 0 || s.current === 1) && ['draw', 'play', 'over'].includes(s.phase as string) &&
    typeof s.round === 'number' && typeof s.nextMeldId === 'number' &&
    Array.isArray(s.matchScore) && s.matchScore.length === 2 && s.matchScore.every((n) => typeof n === 'number');
  return okMeta ? (s as GameState) : null;
}

const isMatchOver = (s: GameState): boolean => s.phase === 'over' && matchWinner(s) !== null;

// ---------------------------------------------------------------- jogadas válidas (a regra é do domínio)

/** Primeiro jogo da mesa do humano que aceita as cartas; devolve o id e o resultado. */
function findAddTarget(s: GameState, ids: readonly number[]): { meldId: number; result: Result } | null {
  if (ids.length === 0) return null;
  for (const m of s.players[HUMAN].melds) {
    const result = addToMeld(s, m.id, ids);
    if (result.ok) return { meldId: m.id, result };
  }
  return null;
}

/** Jogada que encerra a rodada (bater): descartar a última carta ou baixar/acrescentar a mão toda. */
function knockMove(s: GameState): Result | null {
  if (s.phase !== 'play' || s.current !== HUMAN) return null;
  const hand = s.players[HUMAN].hand;
  const candidates: Result[] = [];
  if (hand.length === 1) candidates.push(discardCard(s, hand[0]!.id));
  const ids = hand.map((c) => c.id);
  candidates.push(playMeld(s, ids), findAddTarget(s, ids)?.result ?? { ok: false, error: '' });
  return candidates.find((r) => r.ok && r.state.phase === 'over') ?? null;
}

const faceOf = (c: Card): { rank: string; suit: string } =>
  isJoker(c) ? { rank: '🃏', suit: '' } : { rank: RANK_TEXT[c.rank] ?? String(c.rank), suit: SUIT_SYMBOL[c.suit!] };

function cardEl(c: Card, extra = '', wild = isWildcard(c)): HTMLElement {
  const f = faceOf(c);
  const e = el('div', `bcard${c.suit === 'H' || c.suit === 'D' ? ' red' : ''}${wild ? ' wild' : ''}${extra ? ` ${extra}` : ''}`);
  e.innerHTML = `<span>${f.rank}</span><span>${f.suit}</span>`;
  e.setAttribute('aria-label', `${f.rank}${f.suit}`);
  return e;
}
const backEl = (extra = ''): HTMLElement => el('div', `bcard back${extra ? ` ${extra}` : ''}`);

/** O 2 na posição 2 do próprio naipe é natural; qualquer outro curinga está substituindo uma carta. */
const isWildInMeld = (m: Meld, i: number): boolean => {
  const c = m.cards[i]!;
  return isWildcard(c) && !(c.rank === 2 && c.suit === m.suit && m.start + i === 2);
};

function describeAi(before: GameState, after: GameState): string {
  const b = before.players[COMPUTER];
  const a = after.players[COMPUTER];
  if (before.phase === 'draw') return after.discard.length === 0 && before.discard.length > 0 ? 'O computador pegou o descarte.' : 'O computador comprou do monte.';
  if (a.melds.length > b.melds.length) return 'O computador baixou um jogo.';
  if (a.melds.reduce((n, m) => n + m.cards.length, 0) > b.melds.reduce((n, m) => n + m.cards.length, 0)) return 'O computador acrescentou a um jogo.';
  if (after.discard.length > before.discard.length) {
    const top = after.discard[after.discard.length - 1]!;
    const f = faceOf(top);
    return `O computador descartou ${f.rank}${f.suit}.`;
  }
  return '';
}

// ---------------------------------------------------------------- tela

const BOARD = `
<div class="bScore"><span>Você <b id="bMe">0</b></span><span id="bRound"></span><span>Computador <b id="bCpu">0</b></span></div>
<div class="bTable">
  <div class="bZone">
    <div class="bOpp"><b>Computador</b><span class="bMini" id="bOppHand"></span><span id="bOppInfo"></span></div>
    <div class="bMelds" id="bOppMelds"></div>
  </div>
  <div class="bCenter">
    <div class="bPile" id="bDeck" role="button" tabindex="0" aria-label="Monte"><div id="bDeckCard"></div>Monte<br><small id="bDeckN"></small></div>
    <div class="bPile" id="bTrash" role="button" tabindex="0" aria-label="Descarte"><div class="bStack" id="bTrashStack"></div>Descarte<br><small id="bTrashN"></small></div>
    <div class="bPile dead"><div id="bDeadCard"></div>Seu morto<br><small id="bDeadN"></small></div>
  </div>
  <div class="bZone">
    <h2>Seus jogos na mesa</h2>
    <div class="bMelds" id="bMyMelds"></div>
  </div>
</div>
<div class="bMsg" id="bMsg" aria-live="polite"></div>
<div class="bHand" id="bHand"></div>
<div class="bActions"><button id="bSort" class="btn" type="button"></button></div>
<div class="bActions">
  <button id="bMeld" class="btn primary" type="button">Baixar jogo</button>
  <button id="bAdd" class="btn" type="button">Acrescentar a jogo da mesa</button>
  <button id="bDiscard" class="btn" type="button">Descartar</button>
  <button id="bKnock" class="btn" type="button" title="Só com ao menos uma canastra">Bater</button>
</div>`;

function mountView(body: HTMLElement, host: GameHost<GameState>, _ctx: GameContext) {
  body.innerHTML = BOARD;
  const $ = <T extends HTMLElement>(id: string): T => {
    const e = body.querySelector<T>(`#${id}`);
    if (!e) throw new Error(`elemento #${id} ausente`);
    return e;
  };
  const handEl = $('bHand');
  const trashEl = $('bTrash');
  const deckEl = $('bDeck');
  const msgEl = $('bMsg');
  const sortBtn = $<HTMLButtonElement>('bSort');
  const meldBtn = $<HTMLButtonElement>('bMeld');
  const addBtn = $<HTMLButtonElement>('bAdd');
  const discardBtn = $<HTMLButtonElement>('bDiscard');
  const knockBtn = $<HTMLButtonElement>('bKnock');

  let order: number[] = [];
  let sortMode: SortMode = 'suit'; // o que o próximo clique em Organizar aplica
  let lastRound = -1;
  let lastKey = '';
  let shownRound = -1;
  const sel = new Set<number>();
  const cardEls = new Map<number, HTMLElement>();
  let timer: number | null = null;
  let message = '';
  let drag: { id: number; el: HTMLElement; x0: number; y0: number; moved: boolean } | null = null;

  const state = (): GameState => host.state();
  const myTurn = (s: GameState): boolean => s.current === HUMAN && s.phase !== 'over';
  const handOf = (s: GameState): readonly Card[] => s.players[HUMAN].hand;
  const orderedHand = (s: GameState): Card[] => {
    const byId = new Map(handOf(s).map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined);
  };

  function act(r: Result, okMessage = ''): boolean {
    if (!r.ok) {
      message = r.error;
      msgEl.textContent = message;
      return false;
    }
    message = okMessage;
    sel.clear();
    const fly = prepareFlights(state(), r.state, HUMAN);
    host.update(r.state);
    fly();
    return true;
  }

  // ---------- animações de voo (carta sai de um lugar e entra no outro; só transform, ~320 ms)

  const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /** Captura as posições de origem ANTES de atualizar o estado; devolve a função que voa as cartas DEPOIS do render. */
  function prepareFlights(prev: GameState, next: GameState, who: PlayerIndex): () => void {
    if (reducedMotion()) return () => {};
    const mv = planMoves(prev, next, who);
    const mine = who === HUMAN;
    const pool = [...prev.players[who].hand, ...next.players[who].hand, ...prev.discard, ...next.discard];
    const cardOf = (id: number): Card | undefined => pool.find((c) => c.id === id);
    const oppHand = mine ? null : $('bOppHand').getBoundingClientRect();
    const trash = $('bTrashStack').getBoundingClientRect();
    const deck = $('bDeckCard').getBoundingClientRect();
    const fromHand = (id: number): DOMRect | null => (mine ? cardEls.get(id)?.getBoundingClientRect() ?? null : oppHand);
    const leaving = new Map<number, DOMRect | null>();
    for (const id of [...mv.melded, ...(mv.discarded !== null ? [mv.discarded] : [])]) leaving.set(id, fromHand(id));

    const jobs: { node: HTMLElement; from: DOMRect | null; to: () => Element | null | undefined }[] = [];
    if (mv.drawn) {
      for (const id of mv.drawn.ids) {
        const c = cardOf(id);
        jobs.push({
          node: mv.drawn.source === 'pile' && c ? cardEl(c) : backEl(),
          from: mv.drawn.source === 'pile' ? trash : deck,
          to: () => (mine ? cardEls.get(id) : $('bOppHand').lastElementChild),
        });
      }
    }
    for (const id of mv.melded) {
      const c = cardOf(id);
      if (c) jobs.push({ node: cardEl(c), from: leaving.get(id) ?? null, to: () => $(mine ? 'bMyMelds' : 'bOppMelds').querySelector(`[data-id="${id}"]`) });
    }
    if (mv.discarded !== null) {
      const c = cardOf(mv.discarded);
      if (c) jobs.push({ node: cardEl(c), from: leaving.get(mv.discarded) ?? null, to: () => $('bTrashStack').lastElementChild });
    }

    return () => {
      jobs.forEach((j, i) => {
        const to = j.to() as HTMLElement | null | undefined;
        if (!to || !j.from) return;
        const t = to.getBoundingClientRect();
        const dx = t.left + t.width / 2 - (j.from.left + j.from.width / 2);
        const dy = t.top + t.height / 2 - (j.from.top + j.from.height / 2);
        const scale = Math.min(1, (to.offsetWidth || CARD_W) / CARD_W);
        const f = j.node;
        f.classList.add('bFlyer');
        f.style.left = `${j.from.left + j.from.width / 2 - CARD_W / 2}px`;
        f.style.top = `${j.from.top + j.from.height / 2 - 31}px`;
        document.body.appendChild(f);
        to.style.visibility = 'hidden';
        const done = (): void => {
          f.remove();
          to.style.visibility = '';
        };
        const anim = f.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
            { transform: `translate(${dx}px, ${dy}px) rotate(${to.dataset.ang ?? 0}deg) scale(${scale})` },
          ],
          { duration: FLY_MS, delay: Math.min(i, 6) * 45, easing: 'ease-out', fill: 'both' },
        );
        anim.onfinish = done;
        anim.oncancel = done;
        window.setTimeout(done, FLY_MS + 400); // rede de segurança (aba em segundo plano pode adiar o evento)
      });
    };
  }

  // ---------- leque

  function layout(): void {
    const W = handEl.clientWidth;
    const n = order.length;
    const step = fanStep(W, n);
    const ang = Math.min(5, 50 / Math.max(n - 1, 1));
    order.forEach((id, i) => {
      const e = cardEls.get(id);
      if (!e) return;
      const selected = sel.has(id);
      e.classList.toggle('sel', selected);
      e.style.zIndex = String(selected ? 40 : i);
      if (drag?.moved && drag.id === id) return;
      const k = i - (n - 1) / 2;
      e.dataset.ang = String(k * ang);
      e.style.transform = `translate(${W / 2 - CARD_W / 2 + k * step}px, ${k * k * 1.1 - (selected ? 22 : 0)}px) rotate(${k * ang}deg)`;
    });
  }

  function renderHand(s: GameState): void {
    handEl.replaceChildren();
    cardEls.clear();
    for (const c of orderedHand(s)) {
      const e = cardEl(c);
      e.classList.add('inHand');
      e.dataset.id = String(c.id);
      e.tabIndex = 0;
      e.addEventListener('pointerdown', (ev) => down(ev, c.id, e));
      e.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          toggle(c.id);
        }
      });
      cardEls.set(c.id, e);
      handEl.appendChild(e);
    }
    layout();
  }

  function toggle(id: number): void {
    if (!myTurn(state()) || state().phase !== 'play') return;
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    layout();
    renderMyMelds(state()); // realça os jogos da mesa que aceitam a seleção
    updateButtons();
  }

  const overTrash = (x: number, y: number): boolean => {
    const r = trashEl.getBoundingClientRect();
    return x > r.left && x < r.right && y > r.top && y < r.bottom;
  };

  function down(ev: PointerEvent, id: number, e: HTMLElement): void {
    if (!myTurn(state()) || host.paused) return;
    e.setPointerCapture(ev.pointerId);
    drag = { id, el: e, x0: ev.clientX, y0: ev.clientY, moved: false };
    e.onpointermove = move;
    e.onpointerup = up;
    e.onpointercancel = up;
  }

  function move(ev: PointerEvent): void {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
    drag.moved = true;
    drag.el.classList.add('drag');
    const r = handEl.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    drag.el.style.transform = `translate(${px - CARD_W / 2}px, ${py - 31 - r.height + 62}px)`;
    order = moveId(order, drag.id, dropIndex(px, r.width, order.length));
    trashEl.classList.toggle('dropHint', state().phase === 'play' && overTrash(ev.clientX, ev.clientY));
    layout();
  }

  function up(ev: PointerEvent): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('drag');
    d.el.onpointermove = d.el.onpointerup = d.el.onpointercancel = null;
    trashEl.classList.remove('dropHint');
    const s = state();
    if (d.moved) {
      if (ev.type === 'pointerup' && s.phase === 'play' && overTrash(ev.clientX, ev.clientY)) {
        act(discardCard(s, d.id));
        return;
      }
      layout();
      return;
    }
    toggle(d.id);
  }

  // ---------- botões e pilhas

  function updateButtons(): void {
    const s = state();
    const play = myTurn(s) && s.phase === 'play' && !host.paused;
    const ids = [...sel];
    meldBtn.disabled = !(play && ids.length >= 3 && playMeld(s, ids).ok);
    addBtn.disabled = !(play && findAddTarget(s, ids) !== null);
    discardBtn.disabled = !(play && ids.length === 1 && discardCard(s, ids[0]!).ok);
    knockBtn.disabled = !(play && knockMove(s) !== null);
    meldBtn.classList.toggle('new', !meldBtn.disabled);
    discardBtn.classList.toggle('new', !discardBtn.disabled);
    sortBtn.textContent = `⇅ Organizar: por ${sortMode === 'suit' ? 'naipe' : 'valor'}`;
  }

  function drawFlow(r: Result, text: string): void {
    if (myTurn(state()) && state().phase === 'draw') act(r, text);
  }
  const onDeck = (): void => drawFlow(drawFromStock(state()), '');
  const onTrash = (): void => drawFlow(takeDiscardPile(state()), 'Você pegou o descarte.');
  for (const [pile, fn] of [[deckEl, onDeck], [trashEl, onTrash]] as const) {
    pile.addEventListener('click', fn);
    pile.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        fn();
      }
    });
  }

  sortBtn.addEventListener('click', () => {
    const s = state();
    order = sortHand(handOf(s), sortMode).map((c) => c.id);
    sortMode = nextSortMode(sortMode);
    renderHand(s);
    updateButtons();
  });
  meldBtn.addEventListener('click', () => act(playMeld(state(), [...sel])));
  addBtn.addEventListener('click', () => {
    const t = findAddTarget(state(), [...sel]);
    if (t) act(t.result);
  });
  discardBtn.addEventListener('click', () => {
    const id = [...sel][0];
    if (id !== undefined) act(discardCard(state(), id));
  });
  knockBtn.addEventListener('click', () => {
    const r = knockMove(state());
    if (r) act(r);
  });

  // ---------- mesa

  function renderMelds(target: HTMLElement, melds: readonly Meld[], mine: boolean, s: GameState): void {
    target.replaceChildren();
    if (melds.length === 0) target.appendChild(el('span', 'bNone', 'Nenhum jogo ainda'));
    const ids = [...sel];
    for (const m of melds) {
      const box = el('div', 'bMeld');
      if (isCanasta(m)) {
        const clean = isCleanCanasta(m);
        box.appendChild(el('span', `bBadge ${clean ? 'limpa' : 'suja'}`, `${clean ? 'Limpa' : 'Suja'} ${clean ? CLEAN_CANASTA_BONUS : DIRTY_CANASTA_BONUS}`));
      }
      const row = el('div', 'bMeldCards');
      m.cards.forEach((c, i) => {
        const ce = cardEl(c, '', isWildInMeld(m, i));
        ce.dataset.id = String(c.id);
        row.appendChild(ce);
      });
      box.appendChild(row);
      if (mine && myTurn(s) && s.phase === 'play' && ids.length > 0 && addToMeld(s, m.id, ids).ok) {
        box.classList.add('target');
        box.tabIndex = 0;
        box.setAttribute('role', 'button');
        box.setAttribute('aria-label', 'Acrescentar a este jogo');
        const go = (): void => void act(addToMeld(state(), m.id, ids));
        box.addEventListener('click', go);
        box.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            go();
          }
        });
      }
      target.appendChild(box);
    }
  }

  function renderTable(s: GameState): void {
    $('bMe').textContent = fmt(s.matchScore[0]);
    $('bCpu').textContent = fmt(s.matchScore[1]);
    $('bRound').textContent = `Rodada ${s.round} · meta ${fmt(TARGET_SCORE)}`;
    renderOpp(s);
    renderPiles(s);
  }

  function renderOpp(s: GameState): void {
    const cpu = s.players[COMPUTER];
    $('bOppHand').replaceChildren(...Array.from({ length: Math.min(cpu.hand.length, 14) }, () => backEl()));
    $('bOppInfo').textContent = `${cpu.hand.length} cartas · Morto: ${cpu.tookDead ? 'já pegou' : 'ainda não pegou'}`;
    renderMelds($('bOppMelds'), cpu.melds, false, s);
  }

  function renderPiles(s: GameState): void {
    const me = s.players[HUMAN];
    $('bDeckCard').replaceChildren(s.stock.length > 0 ? backEl() : el('div', 'bcard empty', 'vazio'));
    $('bDeckN').textContent = `${s.stock.length} cartas`;
    const top = s.discard.slice(-5);
    $('bTrashStack').replaceChildren(...(top.length ? top.map((c, i) => {
      const e = cardEl(c);
      e.style.left = `${i * 9}px`;
      return e;
    }) : [el('div', 'bcard empty', 'vazio')]));
    $('bTrashStack').style.width = `${44 + Math.max(0, top.length - 1) * 9}px`;
    $('bTrashN').textContent = `${s.discard.length} cartas`;
    $('bDeadCard').replaceChildren(me.dead ? backEl() : el('div', 'bcard empty', 'pego'));
    $('bDeadN').textContent = me.dead ? `${me.dead.length} cartas` : 'já pego';
    const draw = myTurn(s) && s.phase === 'draw';
    deckEl.classList.toggle('act', draw && s.stock.length > 0);
    trashEl.classList.toggle('act', draw && s.discard.length > 0);
  }

  function renderMyMelds(s: GameState): void {
    renderMelds($('bMyMelds'), s.players[HUMAN].melds, true, s);
  }

  function phaseMessage(s: GameState): string {
    if (s.phase === 'over') return 'Rodada encerrada.';
    if (s.current === COMPUTER) return message || 'Vez do computador…';
    if (message) return message;
    return s.phase === 'draw' ? 'Compre do Monte ou pegue o Descarte (pilha toda).' : 'Selecione cartas para baixar um jogo, ou 1 carta para descartar.';
  }

  // ---------- turno do computador

  function schedule(): void {
    if (timer !== null) return;
    const s = state();
    if (s.phase === 'over' || s.current !== COMPUTER) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (host.paused) return schedule();
      stepAi();
    }, AI_DELAY_MS);
  }

  function stepAi(): void {
    const s = state();
    if (s.phase === 'over' || s.current !== COMPUTER) return;
    let r = aiStep(s);
    if (!r.ok) {
      // Rede de segurança: nunca deixar a partida travada por uma recusa da regra.
      for (const c of s.players[COMPUTER].hand) {
        r = discardCard(s, c.id);
        if (r.ok) break;
      }
    }
    if (!r.ok) return;
    message = describeAi(s, r.state);
    const fly = prepareFlights(s, r.state, COMPUTER);
    host.update(r.state);
    fly();
  }

  // ---------- render

  function render(s: GameState): void {
    renderTable(s); // placar, computador, monte, descarte e morto
    // Minha mão e minha mesa só são refeitas quando MINHA área muda (as jogadas do computador não a tocam).
    const key = mineKey(s);
    if (key !== lastKey) {
      lastKey = key;
      if (lastRound !== s.round) {
        lastRound = s.round;
        order = sortHand(handOf(s), 'suit').map((c) => c.id);
        sortMode = 'rank';
        sel.clear();
      } else {
        order = reconcileOrder(order, handOf(s));
      }
      for (const id of [...sel]) if (!order.includes(id)) sel.delete(id);
      renderMyMelds(s);
      renderHand(s);
    }
    if (sel.size > 0 && (s.phase !== 'play' || s.current !== HUMAN)) {
      sel.clear(); // fora da minha jogada não há seleção (só ajusta o leque, sem recriar as cartas)
      layout();
      renderMyMelds(s);
    }
    msgEl.textContent = phaseMessage(s);
    updateButtons();
    if (s.phase === 'over' && !isMatchOver(s) && shownRound !== s.round) {
      shownRound = s.round;
      const winner = s.result?.wentOut;
      dialog(body.closest('section')?.parentElement ?? document.body, {
        title: `Fim da rodada ${s.round}`,
        html: `<p>${winner === HUMAN ? 'Você bateu!' : winner === COMPUTER ? 'O computador bateu.' : 'O monte acabou.'}</p>${roundTableHtml(s)}`,
        buttons: [{ label: 'Próxima rodada', primary: true, action: () => {
          const r = nextRound(state());
          if (r.ok) {
            message = '';
            host.update(r.state);
          }
        } }],
      });
    }
    schedule();
  }

  const onResize = (): void => layout();
  window.addEventListener('resize', onResize);

  return {
    render,
    destroy: () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      window.removeEventListener('resize', onResize);
    },
  };
}

const phaseLabel = (s: GameState): string =>
  s.phase === 'over' ? 'Rodada encerrada' : s.current === HUMAN ? (s.phase === 'draw' ? 'Sua vez · 1) compre' : 'Sua vez · 2) baixe e descarte') : 'Vez do computador…';

export const buraco = createGame<GameState, 'padrao'>({
  meta: { id: 'buraco', title: 'Buraco', description: 'Forme jogos e canastras contra o computador (2 jogadores).', icon: '🃏' },
  help: HELP,
  levels: [{ id: 'padrao', label: 'Você × Computador', detail: `Rodadas até ${fmt(TARGET_SCORE)} pontos` }],
  newGame: () => newGame(),
  levelOf: () => 'padrao',
  save: {
    key: 'jj.buraco.game.v1',
    parse: parseState,
    serialize: (s) => s,
    isOver: isMatchOver,
  },
  resumeLabel: (s) => `Rodada ${s.round} · ${fmt(s.matchScore[0])} × ${fmt(s.matchScore[1])}`,
  statusText: (s) => phaseLabel(s),
  pausable: true,
  className: 'game buracoGame',
  mountView,
  finish: (s) => {
    const won = matchWinner(s) === HUMAN;
    return {
      title: won ? 'Você venceu!' : 'O computador venceu',
      html: `<p>${won ? 'Parabéns, você chegou primeiro à meta.' : 'Desta vez o computador chegou primeiro.'}</p>${roundTableHtml(s)}`,
    };
  },
});
