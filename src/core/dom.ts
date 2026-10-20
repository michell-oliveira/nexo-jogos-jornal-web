export type Rng = () => number;

export const fmtTime = (secs: number): string => {
  const s = Math.floor(secs);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Sorteia um inteiro em [0, n). */
export const randInt = (n: number, rng: Rng = Math.random): number => Math.floor(rng() * n);

export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
