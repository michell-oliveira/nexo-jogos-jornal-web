/** Cronômetro de partida (segundos inteiros). Quem usa decide se persiste o valor no estado. */
export interface Clock {
  readonly seconds: number;
  readonly running: boolean;
  /** Retoma a partir de `from` segundos e chama `onTick(seconds)` a cada segundo. */
  start(from: number, onTick: (seconds: number) => void): void;
  stop(): void;
}

export function createClock(): Clock {
  let id: ReturnType<typeof setInterval> | null = null;
  let secs = 0;
  return {
    get seconds() { return secs; },
    get running() { return id !== null; },
    start(from, onTick) {
      if (id !== null) clearInterval(id);
      secs = from;
      id = setInterval(() => { secs += 1; onTick(secs); }, 1000);
    },
    stop() {
      if (id !== null) clearInterval(id);
      id = null;
    },
  };
}
