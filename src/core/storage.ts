import type { Snapshot } from './domain/game';
import { isThemeId, type ThemeId } from './theme';

const GAME_KEY = 'jj.sudoku.game.v1';
const PREFS_KEY = 'jj.prefs.v1';

export interface Prefs {
  theme: ThemeId;
  /** Abre o teclado flutuante ao clicar na célula (senão, mostra a linha de números abaixo do quadro). */
  popup: boolean;
  autoNotes: boolean;
}

const DEFAULT_PREFS: Prefs = { theme: 'system', popup: true, autoNotes: false };

// localStorage pode lançar (modo privado, bloqueio de site): nunca deixar isso quebrar o jogo.
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem persistência: o jogo segue funcionando */
  }
}

export function loadPrefs(): Prefs {
  const raw = read(PREFS_KEY) as Partial<Prefs> | null;
  return {
    theme: isThemeId(raw?.theme) ? raw.theme : DEFAULT_PREFS.theme,
    popup: typeof raw?.popup === 'boolean' ? raw.popup : DEFAULT_PREFS.popup,
    autoNotes: typeof raw?.autoNotes === 'boolean' ? raw.autoNotes : DEFAULT_PREFS.autoNotes,
  };
}

export const savePrefs = (prefs: Prefs): void => write(PREFS_KEY, prefs);

export const loadSavedGame = (): unknown => read(GAME_KEY);

export const saveGame = (snapshot: Snapshot): void => write(GAME_KEY, snapshot);

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* ignorado */
  }
}
