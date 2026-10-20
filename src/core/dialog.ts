import { button, el } from './dom';
import { readJson, writeJson } from './storage';

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
