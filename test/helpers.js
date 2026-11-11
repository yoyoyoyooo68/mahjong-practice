// テスト用の小道具。

import { evaluateHand } from '../src/core/score.js';
import { parseTiles } from '../src/core/tiles.js';

/** @typedef {import('../src/core/agari.js').Meld} Meld */
/** @typedef {import('../src/core/score.js').WinContext} WinContext */

/**
 * @param {import('../src/core/agari.js').MeldType} type
 * @param {string} text
 * @returns {Meld}
 */
export function meld(type, text) {
  return { type, tiles: parseTiles(text) };
}

/**
 * 手牌を評価する。既定は「子（南家）・東場・ロン」。
 * @param {string} concealed 手の内（和了牌を含まない）
 * @param {string} win 和了牌（1枚）
 * @param {Partial<WinContext> & { melds?: Meld[], dora?: string, ura?: string }} [options]
 */
export function win(concealed, win, options = {}) {
  const { melds = [], dora, ura, ...ctx } = options;
  const ids = parseTiles(concealed + win);
  const winTile = /** @type {number} */ (ids.pop());
  const result = evaluateHand(ids, melds, winTile, {
    tsumo: false,
    seatWind: 1,
    roundWind: 0,
    doraIndicators: dora ? parseTiles(dora) : [],
    uraIndicators: ura ? parseTiles(ura) : [],
    ...ctx,
  });
  if (!result) throw new Error(`和了形ではありません: ${concealed} + ${win}`);
  return result;
}

/** @param {{ yaku: { id: string }[] }} result */
export function yakuIds(result) {
  return result.yaku.map((y) => y.id).sort();
}
