/** Cronômetro de partida (segundos inteiros). Quem usa decide se persiste o valor no estado. */
export interface Clock {
  readonly seconds: number;
  readonly running: boolean;
  /** Retoma a partir de `from` segundos e chama `onTick(seconds)` a cada segundo. */
  start(from: number, onTick: (seconds: number) => void): void;
  /** Para e esquece o ouvinte: para voltar é preciso `start` de novo. */
  stop(): void;
  /** Suspende a contagem mantendo segundos e ouvinte; `resume` continua de onde parou. */
  pause(): void;
  /** Retoma após `pause` com os mesmos parâmetros do `start`. Sem efeito se não houve `start`. */
  resume(): void;
}

export function createClock(): Clock {
  let id: ReturnType<typeof setInterval> | null = null;
  let secs = 0;
  let tick: ((seconds: number) => void) | null = null;

  const run = (): void => {
    id = setInterval(() => { secs += 1; tick?.(secs); }, 1000);
  };
  const halt = (): void => {
    if (id !== null) clearInterval(id);
    id = null;
  };

  return {
    get seconds() { return secs; },
    get running() { return id !== null; },
    start(from, onTick) {
      halt();
      secs = from;
      tick = onTick;
      run();
    },
    stop() {
      halt();
      tick = null;
    },
    pause: halt,
    resume() {
      if (tick !== null && id === null) run();
    },
  };
}
