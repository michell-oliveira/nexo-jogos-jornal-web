/** Dígitos (1–9) que já aparecem 9 vezes no tabuleiro, certos ou não: o teclado esconde o botão deles. */
export function completedDigits(values: readonly number[]): Set<number> {
  const counts = new Array<number>(10).fill(0);
  for (const v of values) if (v >= 1 && v <= 9) counts[v]! += 1;
  const done = new Set<number>();
  for (let d = 1; d <= 9; d++) if (counts[d]! >= 9) done.add(d);
  return done;
}
