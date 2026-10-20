import { boxOf } from './solver';

export type CellHighlight = 'none' | 'match' | 'lines' | 'box';

export interface HighlightOptions {
  /** Células com o mesmo dígito da selecionada. */
  match: boolean;
  /** Linha e coluna da célula selecionada. */
  lines: boolean;
  /** Bloco 3×3 da célula selecionada. */
  box: boolean;
}

export const DEFAULT_HIGHLIGHT: HighlightOptions = { match: true, lines: true, box: true };

/**
 * Destaques a partir da célula selecionada (`selected` -1 = nenhuma). Prioridade por célula:
 * match > lines > box; cada opção desligada remove só o seu destaque. A própria célula selecionada
 * fica 'none' (quem desenha pinta a seleção por cima).
 */
export function computeHighlights(
  values: readonly number[],
  selected: number,
  opts: HighlightOptions = DEFAULT_HIGHLIGHT,
): CellHighlight[] {
  const out = new Array<CellHighlight>(81).fill('none');
  if (selected < 0 || selected > 80) return out;
  const digit = values[selected] ?? 0;
  const r = Math.floor(selected / 9);
  const c = selected % 9;
  const b = boxOf(selected);
  for (let i = 0; i < 81; i++) {
    if (i === selected) continue;
    if (opts.match && digit !== 0 && values[i] === digit) out[i] = 'match';
    else if (opts.lines && (Math.floor(i / 9) === r || i % 9 === c)) out[i] = 'lines';
    else if (opts.box && boxOf(i) === b) out[i] = 'box';
  }
  return out;
}

/** Células com valor repetido na própria linha, coluna ou bloco. */
export function findConflicts(values: readonly number[]): boolean[] {
  const out = new Array<boolean>(81).fill(false);
  for (let i = 0; i < 81; i++) {
    const v = values[i];
    if (!v) continue;
    for (let j = i + 1; j < 81; j++) {
      if (values[j] !== v) continue;
      if (Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || boxOf(i) === boxOf(j)) {
        out[i] = true;
        out[j] = true;
      }
    }
  }
  return out;
}
