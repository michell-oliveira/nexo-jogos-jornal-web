import { readJson, writeJson } from './storage';

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

export interface DialogButton {
  label: string;
  primary?: boolean;
  action?: () => void;
}

/** Janela modal no estilo da vitória do Sudoku; remove-se do DOM ao fechar. */
export function dialog(host: HTMLElement, o: { title: string; html: string; buttons: DialogButton[] }): HTMLDialogElement {
  const d = el('dialog', 'win');
  d.innerHTML = `<h2></h2><div class="winBody">${o.html}</div><div class="winBtns"></div>`;
  d.querySelector('h2')!.textContent = o.title;
  const btns = d.querySelector('.winBtns')!;
  for (const b of o.buttons) {
    btns.appendChild(
      button(b.label, b.primary ? 'btn primary' : 'btn', () => {
        d.close();
        b.action?.();
      }),
    );
  }
  d.addEventListener('close', () => d.remove());
  host.appendChild(d);
  d.showModal();
  return d;
}

/** "Como jogar": abre sozinho na primeira vez (por jogo) e depois pelo botão. */
export function helpController(host: HTMLElement, id: string, title: string, html: string) {
  const key = `jj.${id}.help.v1`;
  const open = (): void => {
    dialog(host, { title, html, buttons: [{ label: 'Entendi', primary: true, action: () => writeJson(key, true) }] });
  };
  return { open, openFirstTime: (): void => { if (!readJson(key)) open(); } };
}

export interface MenuLevel {
  id: string;
  label: string;
  /** Linha pequena sob o nome (ex.: recorde). */
  detail?: string;
}

/** Menu padrão dos jogos com níveis: Continuar + Novo jogo por nível + Como jogar. */
export function renderMenu(
  host: HTMLElement,
  o: { saved?: { text: string; onContinue: () => void } | null; levels: MenuLevel[]; onStart: (id: string) => void; onHelp: () => void },
): void {
  host.replaceChildren();
  const wrap = el('section', 'home');
  if (o.saved) wrap.appendChild(button(o.saved.text, 'btn primary wide', o.saved.onContinue));
  wrap.appendChild(el('h2', '', 'Novo jogo'));
  const levels = el('div', 'levels');
  for (const l of o.levels) {
    const b = el('button', 'btn wide levelBtn');
    b.type = 'button';
    b.innerHTML = `<span>${l.label}</span>${l.detail ? `<small>${l.detail}</small>` : ''}`;
    b.addEventListener('click', () => o.onStart(l.id));
    levels.appendChild(b);
  }
  wrap.appendChild(levels);
  wrap.appendChild(button('Como jogar', 'btn wide helpBtn', o.onHelp));
  wrap.appendChild(button('← Voltar aos jogos', 'btn wide', () => { location.hash = ''; }));
  host.appendChild(wrap);
}

/** Recorde por chave (menor é melhor). Retorna true se bateu o recorde. */
export function recordBest(key: string, value: number): boolean {
  const cur = Number(readJson(key));
  if (cur > 0 && value >= cur) return false;
  writeJson(key, value);
  return true;
}

export const loadBest = (key: string): number => {
  const v = Number(readJson(key));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
