import { readJson, writeJson } from './storage';

/** Opção do jogador que sobrevive entre partidas (ex.: "Revelar auto"). */
export interface PersistedOption<T> {
  get(): T;
  set(value: T): void;
}

export function persistedOption<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): PersistedOption<T> {
  return {
    get: () => {
      const v = readJson(key);
      return isValid(v) ? v : fallback;
    },
    set: (value) => writeJson(key, value),
  };
}

export const persistedFlag = (key: string, fallback: boolean): PersistedOption<boolean> =>
  persistedOption(key, fallback, (v): v is boolean => typeof v === 'boolean');
