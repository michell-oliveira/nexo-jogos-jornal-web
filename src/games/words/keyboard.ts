import { el } from '../../core/ui';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export interface Keyboard {
  root: HTMLElement;
  /** Colore as teclas (hit/present/miss); letras fora do mapa voltam ao normal. */
  setMarks(marks: ReadonlyMap<string, string>): void;
  /** Desabilita as letras já usadas (Forca). */
  setUsed(used: ReadonlySet<string>): void;
}

/** Teclado QWERTY na tela. `enter`/`backspace` acrescentam as teclas de ação (Termo). */
export function letterKeyboard(
  o: { onLetter: (l: string) => void; onEnter?: () => void; onBackspace?: () => void },
): Keyboard {
  const root = el('div', 'kbd');
  const keys = new Map<string, HTMLButtonElement>();
  const mk = (label: string, cls: string, ariaLabel: string, action: () => void): HTMLButtonElement => {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', ariaLabel);
    b.addEventListener('click', action);
    return b;
  };
  ROWS.forEach((letters, r) => {
    const row = el('div', 'krow');
    if (r === 2 && o.onEnter) row.appendChild(mk('↵', 'key wideKey', 'Enviar', o.onEnter));
    for (const l of letters) {
      const b = mk(l, 'key', l, () => o.onLetter(l));
      keys.set(l, b);
      row.appendChild(b);
    }
    if (r === 2 && o.onBackspace) row.appendChild(mk('⌫', 'key wideKey', 'Apagar', o.onBackspace));
    root.appendChild(row);
  });
  return {
    root,
    setMarks(marks) {
      keys.forEach((b, l) => { b.className = 'key' + (marks.has(l) ? ` ${marks.get(l)}` : ''); });
    },
    setUsed(used) {
      keys.forEach((b, l) => { b.disabled = used.has(l); });
    },
  };
}
