/**
 * Temas no estilo dos temas de editor — mesmas paletas do app Android (old_games, `AppTheme.kt`).
 * 'system' segue o claro/escuro do navegador.
 */
export type ThemeId =
  | 'system' | 'light' | 'dark' | 'monokai' | 'dracula' | 'one_dark' | 'tokyo_night' | 'nord'
  | 'gruvbox' | 'catppuccin' | 'solarized_dark' | 'solarized_light' | 'github_light'
  | 'jornal_claro' | 'jornal_sepia' | 'jornal_noturno' | 'jornal_tinta' | 'jornal_salmao'
  | 'jornal_tabloide' | 'jornal_verde' | 'jornal_marinho' | 'jornal_complementar'
  | 'cor_indigo_amarelo' | 'cor_teal_coral' | 'cor_magenta_verde' | 'cor_oceano' | 'cor_triade'
  | 'cor_split' | 'cor_violeta' | 'cor_noturno_teal_coral';

/** Cores extras dos temas "Jornal" (células fixas, faixas e seleção próprias); ausentes nos demais temas. */
interface Extras {
  empty: string;
  given: string;
  peer: string;
  peerFilled: string;
  same: string;
  selFg: string;
}

interface Palette {
  extras?: Extras;
  dark: boolean;
  bg: string;
  surface: string;
  variant: string;
  fg: string;
  primary: string;
  secondary: string;
  tertiary: string;
  error: string;
  outline: string;
}

const p = (
  dark: boolean, bg: string, surface: string, variant: string, fg: string,
  primary: string, secondary: string, tertiary: string, error: string, outline: string,
): Palette => ({ dark, bg, surface, variant, fg, primary, secondary, tertiary, error, outline });

/** Tema "Jornal": primary = seleção; variant = célula fixa; surface = faixa (popup e lista de temas). */
const j = (
  dark: boolean, bg: string, fg: string, empty: string, given: string, sel: string, same: string, selFg: string,
  peer: string, peerFilled: string, line: string, error = dark ? '#ff6b6b' : '#c62828',
): Palette => ({
  ...p(dark, bg, peer, given, fg, sel, same, sel, error, line),
  extras: { empty, given, peer, peerFilled, same, selFg },
});

const LIGHT = p(false, '#ffffff', '#f4f4f4', '#e0e0e0', '#121212', '#1565c0', '#5c6bc0', '#f9a825', '#c62828', '#9e9e9e');
const DARK = p(true, '#121212', '#1e1e1e', '#2c2c2c', '#eaeaea', '#90caf9', '#b39ddb', '#ffd54f', '#ff6b6b', '#666666');

const PALETTES: Record<Exclude<ThemeId, 'system'>, Palette> = {
  light: LIGHT,
  dark: DARK,
  monokai: p(true, '#272822', '#3e3d32', '#49483e', '#f8f8f2', '#a6e22e', '#66d9ef', '#f92672', '#ff5555', '#75715e'),
  dracula: p(true, '#282a36', '#343746', '#44475a', '#f8f8f2', '#bd93f9', '#ff79c6', '#50fa7b', '#ff5555', '#6272a4'),
  one_dark: p(true, '#282c34', '#2c313a', '#3e4451', '#abb2bf', '#61afef', '#c678dd', '#98c379', '#e06c75', '#5c6370'),
  tokyo_night: p(true, '#1a1b26', '#24283b', '#2f334d', '#c0caf5', '#7aa2f7', '#bb9af7', '#ff9e64', '#f7768e', '#565f89'),
  nord: p(true, '#2e3440', '#3b4252', '#434c5e', '#eceff4', '#88c0d0', '#81a1c1', '#ebcb8b', '#bf616a', '#4c566a'),
  gruvbox: p(true, '#282828', '#3c3836', '#504945', '#ebdbb2', '#fabd2f', '#83a598', '#b8bb26', '#fb4934', '#928374'),
  catppuccin: p(true, '#1e1e2e', '#313244', '#45475a', '#cdd6f4', '#cba6f7', '#89b4fa', '#fab387', '#f38ba8', '#6c7086'),
  solarized_dark: p(true, '#002b36', '#073642', '#0b4452', '#93a1a1', '#268bd2', '#2aa198', '#b58900', '#dc322f', '#586e75'),
  solarized_light: p(false, '#fdf6e3', '#eee8d5', '#e3dcc4', '#586e75', '#268bd2', '#2aa198', '#b58900', '#dc322f', '#93a1a1'),
  github_light: p(false, '#ffffff', '#f6f8fa', '#eaeef2', '#24292f', '#0969da', '#8250df', '#1a7f37', '#cf222e', '#d0d7de'),
  // Jornal: j(dark, bg, fg, vazia, fixa, seleção, igual, texto na seleção, faixa vazia, faixa preenchida, linha)
  jornal_claro: j(false, '#ffffff', '#121212', '#ffffff', '#dedede', '#e58f00', '#e58f00', '#121212', '#f9e9c5', '#d3c6b0', '#9e9e9e'),
  jornal_sepia: j(false, '#f4ecd8', '#3b2f1e', '#f8f1e0', '#e2d5b5', '#b5651d', '#c98a4b', '#ffffff', '#ecdcb8', '#d8c597', '#a89a78'),
  jornal_noturno: j(true, '#121212', '#f2f2f2', '#1a1a1a', '#2c2c2c', '#e58f00', '#b36f00', '#121212', '#2b2418', '#3d3322', '#4a4a4a'),
  jornal_tinta: j(false, '#ffffff', '#000000', '#ffffff', '#e6e6e6', '#000000', '#555555', '#ffffff', '#f2f2f2', '#cfcfcf', '#8a8a8a'),
  jornal_salmao: j(false, '#fff1e5', '#33302e', '#fff7ef', '#f2dfce', '#0f5499', '#4a86c5', '#ffffff', '#fbe3cc', '#e6cbb0', '#b9a591'),
  jornal_tabloide: j(false, '#ffffff', '#161616', '#ffffff', '#e8e8e8', '#c8102e', '#e0596f', '#ffffff', '#fde4e8', '#f1bcc5', '#a0a0a0', '#6a1b9a'),
  jornal_verde: j(false, '#fbfdf9', '#14231a', '#ffffff', '#e1e8df', '#1e7a46', '#5fae82', '#ffffff', '#e3f2e7', '#c3dbc9', '#9bab9e'),
  jornal_marinho: j(true, '#0e1a2b', '#eef2f8', '#13233a', '#1f3350', '#f2b632', '#b88a1f', '#0e1a2b', '#1a2c47', '#27415f', '#3a4f6b'),
  // Complementar: azul (matiz 215°) estrutura 90% da tela; laranja (35°, oposto no círculo) só no foco.
  jornal_complementar: j(false, '#f6f8fc', '#14213d', '#ffffff', '#d9e2f0', '#e8851a', '#f4b878', '#1b1b1b', '#e6edf8', '#c2d1e8', '#9aaac2'),
  // Teoria das cores (ver docs/mockup-teoria-cores.html)
  cor_indigo_amarelo: j(false, '#f7f8fd', '#1c2252', '#ffffff', '#d8dcf0', '#f2c230', '#f8dc82', '#1b1b1b', '#e7eaf8', '#c3cae9', '#9aa3c9'),
  cor_teal_coral: j(false, '#f4faf9', '#0d3b3a', '#ffffff', '#d3ebe8', '#ee5a5f', '#f6a3a6', '#1b1b1b', '#e2f3f1', '#b9ddd9', '#8fb5b1', '#8a1c20'),
  cor_magenta_verde: j(false, '#fcf6fa', '#3d1030', '#ffffff', '#efd6e6', '#3fb26e', '#9bd9b6', '#0f2a1a', '#f6e4ef', '#e3bdd3', '#c29ab3'),
  cor_oceano: j(false, '#f3fafb', '#0b3040', '#ffffff', '#d4e6f4', '#0a6f86', '#2f8aa0', '#ffffff', '#e0f2ee', '#b6e0d3', '#93b3be'),
  cor_triade: j(false, '#fbfbf7', '#1a1a2e', '#ffffff', '#dfe6f5', '#f26a45', '#f7a98f', '#1b1b1b', '#e4f3e4', '#bfe0c0', '#a0a8c0', '#7a1fa2'),
  cor_split: j(false, '#f7f9fd', '#14233f', '#ffffff', '#d9e3f4', '#e8590c', '#f6a373', '#1b1b1b', '#f1f2d0', '#d9de9c', '#a0abc0', '#7a1fa2'),
  cor_violeta: j(false, '#faf7fd', '#2a1347', '#ffffff', '#e4d9f2', '#6a35b8', '#8a63cc', '#ffffff', '#f0e8f9', '#d5c3ec', '#b3a1cc'),
  cor_noturno_teal_coral: j(true, '#0b1f21', '#e6f4f2', '#102a2c', '#1b3c3f', '#ff6b6f', '#d9666a', '#1b1b1b', '#153235', '#1f4a4e', '#2f5d60'),
};

export type ThemeGroup = 'Básicos' | 'Editores de código' | 'Jornal' | 'Teoria das cores';

export const THEMES: { id: ThemeId; label: string; group: ThemeGroup }[] = [
  { id: 'system', label: 'Sistema (claro/escuro)', group: 'Básicos' },
  { id: 'light', label: 'Claro', group: 'Básicos' },
  { id: 'dark', label: 'Escuro', group: 'Básicos' },
  { id: 'monokai', label: 'Monokai', group: 'Editores de código' },
  { id: 'dracula', label: 'Dracula', group: 'Editores de código' },
  { id: 'one_dark', label: 'One Dark Pro', group: 'Editores de código' },
  { id: 'tokyo_night', label: 'Tokyo Night', group: 'Editores de código' },
  { id: 'nord', label: 'Nord', group: 'Editores de código' },
  { id: 'gruvbox', label: 'Gruvbox Dark', group: 'Editores de código' },
  { id: 'catppuccin', label: 'Catppuccin Mocha', group: 'Editores de código' },
  { id: 'solarized_dark', label: 'Solarized Dark', group: 'Editores de código' },
  { id: 'solarized_light', label: 'Solarized Light', group: 'Editores de código' },
  { id: 'github_light', label: 'GitHub Light', group: 'Editores de código' },
  { id: 'jornal_claro', label: 'Jornal Claro', group: 'Jornal' },
  { id: 'jornal_sepia', label: 'Jornal Sépia', group: 'Jornal' },
  { id: 'jornal_noturno', label: 'Jornal Noturno', group: 'Jornal' },
  { id: 'jornal_tinta', label: 'Jornal Tinta', group: 'Jornal' },
  { id: 'jornal_salmao', label: 'Jornal Salmão', group: 'Jornal' },
  { id: 'jornal_tabloide', label: 'Jornal Tabloide', group: 'Jornal' },
  { id: 'jornal_verde', label: 'Jornal Verde', group: 'Jornal' },
  { id: 'jornal_marinho', label: 'Jornal Marinho', group: 'Jornal' },
  { id: 'jornal_complementar', label: 'Jornal Complementar (azul + laranja)', group: 'Jornal' },
  { id: 'cor_indigo_amarelo', label: 'Índigo + Amarelo (complementar)', group: 'Teoria das cores' },
  { id: 'cor_teal_coral', label: 'Verde-azulado + Coral (complementar)', group: 'Teoria das cores' },
  { id: 'cor_magenta_verde', label: 'Magenta + Verde-folha (complementar)', group: 'Teoria das cores' },
  { id: 'cor_oceano', label: 'Oceano (análogas)', group: 'Teoria das cores' },
  { id: 'cor_triade', label: 'Tríade vívida', group: 'Teoria das cores' },
  { id: 'cor_split', label: 'Split-complementar', group: 'Teoria das cores' },
  { id: 'cor_violeta', label: 'Monocromático Violeta', group: 'Teoria das cores' },
  { id: 'cor_noturno_teal_coral', label: 'Noturno Teal + Coral', group: 'Teoria das cores' },
];

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

const systemDark = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;

export function paletteOf(id: ThemeId): Palette {
  if (id === 'system') return systemDark() ? DARK : LIGHT;
  return PALETTES[id];
}

/** Cor de texto legível sobre `hex` (preto ou branco), como `onColor` do Android. */
function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.5 ? '#111111' : '#ffffff';
}

/** Cores da prévia (bolinhas) no seletor: fundo, destaque principal e secundário. */
export function previewColors(id: ThemeId): string[] {
  const pal = paletteOf(id);
  return [pal.bg, pal.primary, pal.tertiary];
}

export function applyTheme(id: ThemeId): void {
  const pal = paletteOf(id);
  const s = document.documentElement.style;
  s.setProperty('--bg', pal.bg);
  s.setProperty('--surface', pal.surface);
  s.setProperty('--variant', pal.variant);
  s.setProperty('--fg', pal.fg);
  s.setProperty('--primary', pal.primary);
  const x = pal.extras;
  s.setProperty('--on-primary', x?.selFg ?? onColor(pal.primary));
  s.setProperty('--secondary', pal.secondary);
  s.setProperty('--tertiary', pal.tertiary);
  s.setProperty('--error', pal.error);
  s.setProperty('--outline', pal.outline);
  s.setProperty('color-scheme', pal.dark ? 'dark' : 'light');
  document.documentElement.dataset.scheme = pal.dark ? 'dark' : 'light'; // light-dark() não sobrevive ao minificador do build
  document.documentElement.dataset.theme = id; // permite ajustes finos por tema no CSS (ex.: destaques do Sudoku)
  // Sem extras (temas antigos), as variáveis somem e o CSS cai nos valores padrão.
  const extras: [string, string | undefined][] = [
    ['--empty', x?.empty], ['--given', x?.given], ['--peer', x?.peer], ['--peer-filled', x?.peerFilled],
    ['--same', x?.same], ['--same-fg', x?.selFg], ['--user-fg', x ? pal.fg : undefined],
  ];
  for (const [name, value] of extras) {
    if (value) s.setProperty(name, value);
    else s.removeProperty(name);
  }
}
