// 行動ログ（牌譜）。対局は「設定 + 行動の列」だけで完全に再現できる。

import { createGame, next } from './round.js';

/** @typedef {import('./state.js').GameConfig} GameConfig */
/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').Action} Action */

/**
 * @typedef {object} GameRecord
 * @property {number} version 記録形式の版
 * @property {GameConfig} config
 * @property {Action[]} actions
 */

export const RECORD_VERSION = 1;

/**
 * @param {GameConfig} [config]
 * @returns {GameRecord}
 */
export function createRecord(config = {}) {
  return { version: RECORD_VERSION, config, actions: [] };
}

/**
 * 行動を1つ追記した新しい記録を返す。
 * @param {GameRecord} record
 * @param {Action} action
 * @returns {GameRecord}
 */
export function appendAction(record, action) {
  return { ...record, actions: [...record.actions, action] };
}

/**
 * 記録を最初から再生して、その時点の状態を作る。
 * @param {GameRecord} record
 * @param {number} [count] 再生する行動の数（省略時は全部）
 * @returns {GameState}
 */
export function replay(record, count = record.actions.length) {
  let state = createGame(record.config);
  for (let i = 0; i < count; i++) state = next(state, record.actions[i]);
  return state;
}
