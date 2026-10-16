import type { Prefs } from './storage';

/** O que o shell (cabeçalho, tema, preferências) oferece a cada jogo. */
export interface GameContext {
  prefs: Prefs;
  savePrefs(): void;
}

/** Contrato de um jogo: monta a própria tela dentro de `root` e devolve a função que desmonta. */
export interface GameModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  mount(root: HTMLElement, ctx: GameContext): () => void;
}
