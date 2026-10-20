import { el } from './dom';
import { readJson, writeJson } from './storage';

/** Uma partida terminada. `level` é o id do nível na `GameDefinition`. */
export interface ScoreEntry {
  /** Instante do fim da partida (timestamp em ms). */
  date: number;
  seconds: number;
  errors: number;
  level: string;
}

export type ScoreKey = 'date' | 'seconds' | 'errors' | 'level';

export interface ScoreSort {
  key: ScoreKey;
  /** 1 = crescente (▲), -1 = decrescente (▼). */
  dir: 1 | -1;
}

/** Ordem inicial: mais recente primeiro. */
export const DEFAULT_SORT: ScoreSort = { key: 'date', dir: -1 };

export const MAX_SCORES = 200;

const scoresKey = (gameId: string): string => `jj.${gameId}.scores.v1`;
const shownKey = (gameId: string): string => `jj.${gameId}.scoresShown.v1`;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Lê o que veio do armazenamento: ignora o que não for lista e descarta entradas inválidas. */
export function parseScores(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreEntry[] = [];
  for (const item of raw as Partial<ScoreEntry>[]) {
    if (item && isCount(item.date) && isCount(item.seconds) && isCount(item.errors) && typeof item.level === 'string') {
      out.push({ date: item.date, seconds: item.seconds, errors: item.errors, level: item.level });
    }
  }
  return out;
}

export const loadScores = (gameId: string): ScoreEntry[] => parseScores(readJson(scoresKey(gameId)));

/** Acrescenta a entrada e guarda só as `MAX_SCORES` mais recentes. Devolve a lista gravada. */
export function addScore(gameId: string, entry: ScoreEntry): ScoreEntry[] {
  const all = [...loadScores(gameId), entry].sort((a, b) => a.date - b.date).slice(-MAX_SCORES);
  writeJson(scoresKey(gameId), all);
  return all;
}

/**
 * Ordena por um dos 4 campos. A dificuldade segue `levelOrder` (a ordem dos níveis da definição), não o alfabeto;
 * nível desconhecido vai para o fim. Empates desempatam pela data mais recente.
 */
export function sortScores(entries: readonly ScoreEntry[], sort: ScoreSort, levelOrder: readonly string[]): ScoreEntry[] {
  const rank = (l: string): number => {
    const i = levelOrder.indexOf(l);
    return i < 0 ? levelOrder.length : i;
  };
  const value = (e: ScoreEntry): number => (sort.key === 'level' ? rank(e.level) : e[sort.key]);
  return [...entries].sort((a, b) => (value(a) - value(b)) * sort.dir || b.date - a.date);
}

/** Clicar na coluna ativa inverte; numa coluna nova começa crescente. */
export function nextSort(cur: ScoreSort, key: ScoreKey): ScoreSort {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** dd/mm/aaaa hh:mm (hora local). */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const COLUMNS: { key: ScoreKey; label: string }[] = [
  { key: 'date', label: 'Data' },
  { key: 'seconds', label: 'Tempo' },
  { key: 'errors', label: 'Erros' },
  { key: 'level', label: 'Dificuldade' },
];

export interface ScoreboardOptions {
  gameId: string;
  title: string;
  levels: ReadonlyArray<{ id: string; label: string }>;
  formatSeconds: (seconds: number) => string;
}

/** Tabela do placar de um jogo; o shell só a monta, grava ao fim da partida e liga o botão mostrar/ocultar. */
export interface Scoreboard {
  readonly element: HTMLElement;
  readonly shown: boolean;
  /** Grava a partida terminada e redesenha. */
  record(entry: ScoreEntry): void;
  /** Mostra/oculta (a escolha fica salva por jogo). Devolve o novo estado. */
  toggle(): boolean;
}

export function createScoreboard(o: ScoreboardOptions): Scoreboard {
  const element = el('section', 'scoreboard');
  let sort = DEFAULT_SORT;
  let shown = readJson(shownKey(o.gameId)) !== false;
  const order = o.levels.map((l) => l.id);
  const labelOf = (id: string): string => o.levels.find((l) => l.id === id)?.label ?? id;

  function draw(): void {
    const rows = sortScores(loadScores(o.gameId), sort, order);
    const table = el('table');
    const head = table.createTHead().insertRow();
    for (const c of COLUMNS) {
      const th = document.createElement('th');
      const b = el('button', 'sortBtn');
      b.type = 'button';
      b.textContent = c.label + (sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
      b.addEventListener('click', () => {
        sort = nextSort(sort, c.key);
        draw();
      });
      th.setAttribute('aria-sort', sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      th.appendChild(b);
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const e of rows) {
      const tr = body.insertRow();
      for (const text of [formatDate(e.date), o.formatSeconds(e.seconds), String(e.errors), labelOf(e.level)]) {
        tr.insertCell().textContent = text;
      }
    }
    const title = el('h2');
    title.textContent = o.title;
    element.replaceChildren(title, rows.length ? table : el('p', 'hint', 'Nenhuma partida concluída ainda.'));
  }

  element.hidden = !shown;
  draw();
  return {
    element,
    get shown() { return shown; },
    record(entry) {
      addScore(o.gameId, entry);
      draw();
    },
    toggle() {
      shown = !shown;
      element.hidden = !shown;
      writeJson(shownKey(o.gameId), shown);
      return shown;
    },
  };
}
