// ヘッドレスの自動対局。4人ぶんの「打ち手」を渡すと、対局終了まで進める。

import { appendAction, createRecord } from './log.js';
import { createGame, next, viewFor, waitingSeats } from './round.js';

/** @typedef {import('./state.js').GameConfig} GameConfig */
/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').Action} Action */
/** @typedef {import('./round.js').PlayerView} PlayerView */

/** @typedef {(view: PlayerView) => Action} Decider その席から見える情報だけで行動を決める関数 */

/**
 * 次に行動する席を返す（局の終了時・対局終了時は -1）。
 * @param {GameState} state
 * @returns {number}
 */
export function nextActor(state) {
  if (state.phase === 'turn') return state.turn;
  if (state.phase === 'response') return waitingSeats(state)[0] ?? -1;
  return -1;
}

/**
 * 1手だけ進める。局の終了時は次の局へ進む。
 * @param {GameState} state
 * @param {Decider[]} deciders 席ごとの打ち手
 * @returns {{ state: GameState, action: Action }}
 */
export function step(state, deciders) {
  const seat = nextActor(state);
  /** @type {Action} */
  const action = seat === -1 ? { type: 'nextRound', seat: 0 } : deciders[seat](viewFor(state, seat));
  return { state: next(state, action), action };
}

/**
 * 対局を最後まで進める。
 * @param {GameConfig} config
 * @param {Decider[]} deciders
 * @param {(state: GameState, action: Action) => void} [onStep] 行動のたびに呼ばれる（検証用）
 * @returns {{ state: GameState, record: import('./log.js').GameRecord }}
 */
export function playGame(config, deciders, onStep) {
  let state = createGame(config);
  let record = createRecord(config);
  let guard = 0;
  while (state.phase !== 'gameEnd') {
    const result = step(state, deciders);
    state = result.state;
    record = appendAction(record, result.action);
    onStep?.(state, result.action);
    if (++guard > 100000) throw new Error('対局が終わりません');
  }
  return { state, record };
}
