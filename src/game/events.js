// UIとCPUが購読するイベントの配送。状態機械そのものは購読者を知らない。
// next() が返した状態の events（直前の遷移で起きたこと）を、ここから配る。

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').GameEvent} GameEvent */
/** @typedef {(event: GameEvent, state: GameState) => void} Listener */

/**
 * @returns {{ on: (listener: Listener) => () => void, publish: (state: GameState) => void }}
 */
export function createEmitter() {
  /** @type {Set<Listener>} */
  const listeners = new Set();
  return {
    /** 購読を始める。戻り値を呼ぶと解除する。 */
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 状態に入っているイベントを順に配る。 */
    publish(state) {
      for (const event of state.events) {
        for (const listener of listeners) listener(event, state);
      }
    },
  };
}
