import { isThemeId, type ThemeId } from './theme';

const PREFS_KEY = 'jj.prefs.v1';

export interface Prefs {
  theme: ThemeId;
  /** Abre o teclado flutuante ao clicar na célula (senão, mostra a linha de números abaixo do quadro). */
  popup: boolean;
  autoNotes: boolean;
  /** Sudoku: destaques a partir da célula selecionada (números iguais, linha e coluna, bloco). */
  hlMatch: boolean;
  hlLines: boolean;
  hlBox: boolean;
}

const DEFAULT_PREFS: Prefs = { theme: 'system', popup: true, autoNotes: false, hlMatch: true, hlLines: true, hlBox: true };

// Cada usuário tem a própria área: o navegador é compartilhado, o progresso não pode ser.
let scope = '';
const scoped = (key: string): string => (scope && key.startsWith('jj.') ? `jj.u.${scope}.${key.slice(3)}` : key);

/**
 * Define o dono do progresso salvo (chamar antes de ler qualquer coisa). `adoptLegacy` é para o administrador:
 * o que foi salvo antes da separação por usuário era dele, então passa para a área dele uma única vez.
 */
export function setStorageUser(user: string, adoptLegacy: boolean): void {
  scope = user.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  if (!adoptLegacy) return;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => k !== null);
    for (const key of keys) {
      if (!key.startsWith('jj.') || key.startsWith('jj.u.')) continue;
      const target = scoped(key);
      if (localStorage.getItem(target) === null) localStorage.setItem(target, localStorage.getItem(key)!);
      localStorage.removeItem(key);
    }
  } catch {
    /* sem persistência: nada a migrar */
  }
}

// localStorage pode lançar (modo privado, bloqueio de site): nunca deixar isso quebrar o jogo.
export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(scoped(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(scoped(key), JSON.stringify(value));
  } catch {
    /* sem persistência: o jogo segue funcionando */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(scoped(key));
  } catch {
    /* ignorado */
  }
}

export function loadPrefs(): Prefs {
  const raw = readJson(PREFS_KEY) as Partial<Prefs> | null;
  return {
    theme: isThemeId(raw?.theme) ? raw.theme : DEFAULT_PREFS.theme,
    popup: typeof raw?.popup === 'boolean' ? raw.popup : DEFAULT_PREFS.popup,
    autoNotes: typeof raw?.autoNotes === 'boolean' ? raw.autoNotes : DEFAULT_PREFS.autoNotes,
    hlMatch: typeof raw?.hlMatch === 'boolean' ? raw.hlMatch : DEFAULT_PREFS.hlMatch,
    hlLines: typeof raw?.hlLines === 'boolean' ? raw.hlLines : DEFAULT_PREFS.hlLines,
    hlBox: typeof raw?.hlBox === 'boolean' ? raw.hlBox : DEFAULT_PREFS.hlBox,
  };
}

export const savePrefs = (prefs: Prefs): void => writeJson(PREFS_KEY, prefs);
