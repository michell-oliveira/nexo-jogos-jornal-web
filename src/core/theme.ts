/**
 * Temas no estilo dos temas de editor — mesmas paletas do app Android (old_games, `AppTheme.kt`).
 * 'system' segue o claro/escuro do navegador.
 */
export type ThemeId =
  | 'system' | 'light' | 'dark' | 'monokai' | 'dracula' | 'one_dark' | 'tokyo_night' | 'nord'
  | 'gruvbox' | 'catppuccin' | 'solarized_dark' | 'solarized_light' | 'github_light';

interface Palette {
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
};

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'system', label: 'Sistema (claro/escuro)' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'one_dark', label: 'One Dark Pro' },
  { id: 'tokyo_night', label: 'Tokyo Night' },
  { id: 'nord', label: 'Nord' },
  { id: 'gruvbox', label: 'Gruvbox Dark' },
  { id: 'catppuccin', label: 'Catppuccin Mocha' },
  { id: 'solarized_dark', label: 'Solarized Dark' },
  { id: 'solarized_light', label: 'Solarized Light' },
  { id: 'github_light', label: 'GitHub Light' },
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
  s.setProperty('--on-primary', onColor(pal.primary));
  s.setProperty('--secondary', pal.secondary);
  s.setProperty('--tertiary', pal.tertiary);
  s.setProperty('--error', pal.error);
  s.setProperty('--outline', pal.outline);
  s.setProperty('color-scheme', pal.dark ? 'dark' : 'light');
}
