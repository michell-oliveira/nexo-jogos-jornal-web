import './style.css';
import { CATALOG, type CatalogEntry } from './core/catalog';
import { loadPrefs, savePrefs, setStorageUser } from './core/storage';
import { THEMES, applyTheme, previewColors, type ThemeId } from './core/theme';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} ausente`);
  return el as T;
};

// Quem está logado define de quem é o progresso salvo; precisa vir antes de ler preferências e jogos.
// O link de cadastro de usuários só aparece para o administrador; o servidor confere de novo em /admin.
const who: { admin?: boolean; user?: string | null } | null = await fetch('whoami', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
if (who?.user) setStorageUser(who.user, who.admin === true);
if (who?.admin === true) $('adminLink').hidden = false;

const prefs = loadPrefs();
const main = $('main');
const title = $('title');
const hubBtn = $('hubBtn');

// ---------- Rotas (hash: o Worker só serve arquivos, então não precisa conhecer as rotas) ----------

let unmount: (() => void) | null = null;
let routeToken = 0;

function gameIdFromHash(): string | null {
  const m = /^#\/([a-z0-9]+)$/.exec(location.hash);
  return m ? m[1]! : null;
}

function showHub(): void {
  document.title = 'Jogos de Jornal';
  title.textContent = 'Jogos de Jornal';
  hubBtn.hidden = true;
  const grid = document.createElement('div');
  grid.className = 'hub';
  for (const g of CATALOG) grid.appendChild(hubCard(g));
  main.replaceChildren(grid);
}

function hubCard(g: CatalogEntry): HTMLElement {
  const ready = Boolean(g.load);
  const card = document.createElement(ready ? 'a' : 'div');
  card.className = 'hubCard' + (ready ? '' : ' soon');
  if (card instanceof HTMLAnchorElement) card.href = `#/${g.id}`;
  card.innerHTML =
    `<span class="hubIcon" aria-hidden="true">${g.icon}</span>` +
    `<span class="hubText"><strong>${g.title}</strong><small>${g.description}</small></span>` +
    (ready ? '' : '<span class="hubBadge">Em breve</span>');
  return card;
}

async function route(): Promise<void> {
  const token = ++routeToken;
  unmount?.();
  unmount = null;
  const entry = CATALOG.find((g) => g.id === gameIdFromHash());
  if (!entry?.load) {
    showHub();
    return;
  }
  const game = await entry.load();
  if (token !== routeToken) return; // o usuário já navegou para outro lugar enquanto carregava
  document.title = `Jogos de Jornal — ${game.title}`;
  title.textContent = game.title;
  hubBtn.hidden = false;
  main.replaceChildren();
  unmount = game.mount(main, { prefs, savePrefs: () => savePrefs(prefs) });
}

window.addEventListener('hashchange', () => void route());
hubBtn.addEventListener('click', () => {
  location.hash = '';
});

// ---------- Tema ----------

const themeBox = document.querySelector<HTMLElement>('.themeBox')!;
const themeBtn = $('themeBtn');
const themeList = $('themeList');

function closeThemes(): void {
  themeList.hidden = true;
  themeBtn.setAttribute('aria-expanded', 'false');
}

function buildThemeList(): void {
  themeList.replaceChildren();
  let group = '';
  for (const t of THEMES) {
    if (t.group !== group) {
      group = t.group;
      const h = document.createElement('li');
      h.setAttribute('role', 'presentation');
      h.className = 'themeGroup';
      h.textContent = group;
      themeList.appendChild(h);
    }
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(t.id === prefs.theme));
    const dots = previewColors(t.id).map((c) => `<i style="background:${c}"></i>`).join('');
    li.innerHTML = `<span class="dots">${dots}</span><span>${t.label}</span>`;
    li.addEventListener('click', () => setTheme(t.id));
    themeList.appendChild(li);
  }
}

function setTheme(id: ThemeId): void {
  prefs.theme = id;
  savePrefs(prefs);
  applyTheme(id);
  buildThemeList();
  closeThemes();
}

themeBtn.addEventListener('click', () => {
  const open = themeList.hidden;
  themeList.hidden = !open;
  themeBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('pointerdown', (e) => {
  if (!themeBox.contains(e.target as Node)) closeThemes();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeThemes();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (prefs.theme === 'system') {
    applyTheme('system');
    buildThemeList();
  }
});

// ---------- Início ----------

$('date').textContent = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
applyTheme(prefs.theme);
buildThemeList();
void route();
