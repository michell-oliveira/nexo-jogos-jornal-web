import { button, el } from './dom';

export interface MenuLevel {
  id: string;
  label: string;
  /** Linha pequena sob o nome (ex.: recorde). */
  detail?: string;
}

/** Menu padrão dos jogos com níveis: Continuar + Novo jogo por nível + Como jogar + Voltar aos jogos. */
export function renderMenu(
  host: HTMLElement,
  o: { saved?: { text: string; onContinue: () => void } | null; levels: MenuLevel[]; onStart: (id: string) => void; onHelp: () => void; extras?: HTMLElement[] },
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
  if (o.extras) wrap.append(...o.extras);
  wrap.appendChild(button('← Voltar aos jogos', 'btn wide', () => { location.hash = ''; }));
  host.appendChild(wrap);
}
