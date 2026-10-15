import { boxOf } from './solver';

export type CellHighlight = 'none' | 'related' | 'match';

/**
 * 'match': células com `digit`. 'related': demais células das linhas, colunas e blocos que contêm `digit`.
 * `digit` 0 não destaca nada.
 */
export function computeHighlights(values: readonly number[], digit: number): CellHighlight[] {
  if (digit === 0) return new Array<CellHighlight>(81).fill('none');
  const rows = new Array<boolean>(9).fill(false);
  const cols = new Array<boolean>(9).fill(false);
  const boxes = new Array<boolean>(9).fill(false);
  values.forEach((v, i) => {
    if (v !== digit) return;
    rows[Math.floor(i / 9)] = true;
    cols[i % 9] = true;
    boxes[boxOf(i)] = true;
  });
  return values.map((v, i) =>
    v === digit ? 'match' : rows[Math.floor(i / 9)] || cols[i % 9] || boxes[boxOf(i)] ? 'related' : 'none',
  );
}

/** Linha, coluna e bloco da célula `cell` (destaque quando a célula selecionada está vazia). */
export function peersOf(cell: number): CellHighlight[] {
  const r = Math.floor(cell / 9);
  const c = cell % 9;
  const b = boxOf(cell);
  return Array.from({ length: 81 }, (_, i) =>
    i !== cell && (Math.floor(i / 9) === r || i % 9 === c || boxOf(i) === b) ? 'related' : 'none',
  );
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
