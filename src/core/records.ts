import { readJson, writeJson } from './storage';

/** Recorde por chave (menor é melhor). Retorna true se bateu o recorde. */
export function recordBest(key: string, value: number): boolean {
  const cur = Number(readJson(key));
  if (cur > 0 && value >= cur) return false;
  writeJson(key, value);
  return true;
}

export const loadBest = (key: string): number => {
  const v = Number(readJson(key));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Recorde por nível (menor é melhor): o jogo só informa a chave e como exibir o valor. */
export interface RecordBook<L extends string> {
  best(level: L): number;
  submit(level: L, value: number): boolean;
  format(value: number): string;
}

export function createRecordBook<L extends string>(keyOf: (level: L) => string, format: (value: number) => string): RecordBook<L> {
  return {
    best: (level) => loadBest(keyOf(level)),
    submit: (level, value) => recordBest(keyOf(level), value),
    format,
  };
}
