import { readJson, removeKey, writeJson } from '../../core/storage';
import type { Snapshot } from './domain/game';

const GAME_KEY = 'jj.sudoku.game.v1';

export const loadSavedGame = (): unknown => readJson(GAME_KEY);

export const saveGame = (snapshot: Snapshot): void => writeJson(GAME_KEY, snapshot);

export const clearSavedGame = (): void => removeKey(GAME_KEY);
