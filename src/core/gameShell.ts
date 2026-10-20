import { createClock, type Clock } from './clock';
import { dialog, helpController } from './dialog';
import { button, el } from './dom';
import { GameStore, type SaveSpec } from './gameStore';
import { renderMenu, type MenuLevel } from './menu';
import type { PersistedOption } from './option';
import type { RecordBook } from './records';
import type { GameContext, GameModule } from './types';

/** Valores atuais das opções persistidas, por nome (ex.: `{ autoReveal: true }`). */
export type GameOptions = Record<string, unknown>;

export interface GameMeta {
  id: string;
  title: string;
  description: string;
  icon: string;
}

/** Texto final mostrado no diálogo de fim; o shell acrescenta "Novo jogo" e "Menu". */
export interface FinishInfo {
  title: string;
  html: string;
}

/** Entrega ao `finish` o que depende do shell. */
export interface FinishContext {
  /** Registra a pontuação no recorde do nível (só com `records`); true se bateu o recorde. */
  submitRecord(score: number): boolean;
}

/** O que o shell oferece a cada jogo durante a partida. */
export interface GameHost<S> {
  /** Estado atual da partida. */
  state(): S;
  /** Troca o estado: persiste (ou limpa, se acabou), redesenha e abre o diálogo de fim. Ignora `next === state()`. */
  update(next: S): void;
  /** Como `update`, para estado mutável (o mesmo objeto alterado no lugar): persiste, redesenha e checa o fim. */
  commit(): void;
  readonly clock: Clock;
  /** Espaço da barra de status ao lado do botão Menu (progresso, cronômetro...). */
  readonly status: HTMLElement;
  /** Opção persistida por nome, tal como declarada em `options`. */
  option<T>(name: string): PersistedOption<T>;
  /** Volta ao menu (a partida continua salva). */
  menu(): void;
  /** Reinicia no mesmo nível, descartando a partida atual. */
  newGame(): void;
}

/** A parte do jogo que o shell não conhece: desenho do tabuleiro. */
export interface GameView<S> {
  /** Chamada a cada mudança de estado (e uma vez ao abrir a partida). */
  render(state: S): void;
  /** Libera o que o jogo criou além do DOM de `host` (ouvintes globais, teclado flutuante...). */
  destroy?(): void;
}

/**
 * Strategy: tudo o que muda de jogo para jogo. O fluxo (menu → jogar → fim) é fixo e vive no shell
 * (Template Method).
 */
export interface GameDefinition<S, L extends string = string> {
  meta: GameMeta;
  /** HTML do "Como jogar"; abre sozinho na primeira vez. */
  help: string;
  levels: ReadonlyArray<MenuLevel & { id: L }>;
  newGame(level: L, options: GameOptions): S;
  levelOf(state: S): L;
  save: SaveSpec<S>;
  /** Texto do botão "Continuar — ...". */
  resumeLabel(state: S): string;
  options?: Record<string, PersistedOption<unknown>>;
  /** Recorde por nível: o shell mostra no menu e atualiza ao fim da partida. */
  records?: RecordBook<L>;
  /** Controles extras do menu (ex.: alternar uma opção), mostrados antes de "← Voltar aos jogos". Recriados a cada abertura do menu. */
  menuExtras?(): HTMLElement[];
  /** Classe CSS da seção da partida. */
  className?: string;
  /** Texto da barra de status (opcional); jogos com cronômetro usam `host.status` diretamente. */
  statusText?(state: S): string;
  /** Desenha o tabuleiro dentro de `body` (ao lado do status, já criado pelo shell). */
  mountView(body: HTMLElement, host: GameHost<S>, ctx: GameContext): GameView<S>;
  /** Quando a partida acabou, devolve o texto do diálogo de fim. */
  finish?(state: S, ctx: FinishContext): FinishInfo;
  /** Chamada ao abrir a partida (nova ou retomada), p.ex. para religar o cronômetro. */
  onOpen?(state: S, host: GameHost<S>): void;
}

export function createGame<S, L extends string>(def: GameDefinition<S, L>): GameModule {
  const store = new GameStore<S>(def.save);

  function mount(root: HTMLElement, ctx: GameContext): () => void {
    const help = helpController(root, def.meta.id, 'Como jogar', def.help);
    const clock = createClock();
    const options = def.options ?? {};
    let current: S | null = null;
    let view: GameView<S> | null = null;
    let status: HTMLElement | null = null;

    const optionValues = (): GameOptions =>
      Object.fromEntries(Object.entries(options).map(([name, o]) => [name, o.get()]));

    function leaveGame(): void {
      clock.stop();
      view?.destroy?.();
      view = null;
      current = null;
    }

    function showMenu(): void {
      leaveGame();
      const saved = store.load();
      renderMenu(root, {
        saved: saved && { text: `Continuar — ${def.resumeLabel(saved)}`, onContinue: () => play(saved) },
        levels: def.levels.map((l) => {
          const best = def.records?.best(l.id) ?? 0;
          const recordText = best ? `Recorde: ${def.records!.format(best)}` : '';
          const detail = [l.detail, recordText].filter(Boolean).join(' · ');
          return { id: l.id, label: l.label, detail: detail || undefined };
        }),
        onStart: (id) => startNew(id as L),
        onHelp: help.open,
        extras: def.menuExtras?.(),
      });
      help.openFirstTime();
    }

    function startNew(level: L): void {
      store.clear();
      play(def.newGame(level, optionValues()));
    }

    function finishGame(s: S): void {
      if (!def.finish) return;
      const level = def.levelOf(s);
      const info = def.finish(s, { submitRecord: (score) => def.records?.submit(level, score) ?? false });
      dialog(root, {
        title: info.title,
        html: info.html,
        buttons: [
          { label: 'Novo jogo', primary: true, action: () => startNew(level) },
          { label: 'Menu', action: showMenu },
        ],
      });
    }

    const host: GameHost<S> = {
      state() {
        if (current === null) throw new Error('Nenhuma partida aberta');
        return current;
      },
      update(next) {
        if (current === null || next === current) return;
        current = next;
        host.commit();
      },
      commit() {
        if (current === null) return;
        const s = current;
        store.save(s);
        view?.render(s);
        if (status && def.statusText) status.textContent = def.statusText(s);
        if (def.save.isOver(s)) {
          clock.stop();
          finishGame(s);
        }
      },
      clock,
      get status() {
        if (!status) throw new Error('Nenhuma partida aberta');
        return status;
      },
      option: <T>(name: string) => {
        const o = options[name];
        if (!o) throw new Error(`Opção desconhecida: ${name}`);
        return o as PersistedOption<T>;
      },
      menu: showMenu,
      newGame() {
        if (current !== null) startNew(def.levelOf(current));
      },
    };

    function play(s: S): void {
      leaveGame();
      root.replaceChildren();
      const section = el('section', def.className ?? 'game');
      const bar = el('div', 'status');
      bar.appendChild(button('Menu', 'btn', showMenu));
      status = el('span', 'shellStatus');
      bar.appendChild(status);
      const body = el('div', 'gameBody');
      section.append(bar, body);
      root.appendChild(section);
      current = s;
      view = def.mountView(body, host, ctx);
      view.render(s);
      if (def.statusText) status.textContent = def.statusText(s);
      def.onOpen?.(s, host);
    }

    showMenu();
    return () => {
      leaveGame();
      root.replaceChildren();
    };
  }

  return { ...def.meta, mount };
}
