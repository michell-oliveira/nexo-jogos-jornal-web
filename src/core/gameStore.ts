import { readJson, removeKey, writeJson } from './storage';

export interface SaveSpec<S> {
  /** Chave de armazenamento, ex.: `jj.wordcipher.game.v1` (mantida para não perder o progresso salvo). */
  key: string;
  /** Valida o JSON lido; devolve null se estiver corrompido ou de outro formato. */
  parse(raw: unknown): S | null;
  /** Formato gravado (muitos jogos gravam o próprio estado; outros um formato enxuto). */
  serialize(state: S): unknown;
  isOver(state: S): boolean;
}

/** Persistência do progresso de um jogo: partida terminada nunca fica salva. */
export class GameStore<S> {
  constructor(private readonly spec: SaveSpec<S>) {}

  /** Partida em andamento, ou null se não há/estiver terminada. */
  load(): S | null {
    const s = this.spec.parse(readJson(this.spec.key));
    return s && !this.spec.isOver(s) ? s : null;
  }

  save(state: S): void {
    if (this.spec.isOver(state)) this.clear();
    else writeJson(this.spec.key, this.spec.serialize(state));
  }

  clear(): void {
    removeKey(this.spec.key);
  }
}
