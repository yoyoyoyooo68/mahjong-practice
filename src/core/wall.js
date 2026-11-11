// シード付き乱数と牌山。同じシードからは必ず同じ牌山ができる。

import { NUM_TILES } from './tiles.js';

/** 王牌の枚数 */
export const DEAD_WALL_SIZE = 14;

/**
 * mulberry32。0以上1未満の乱数を返す関数を作る。
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates。元の配列は変更しない。
 * @template T
 * @param {readonly T[]} items
 * @param {() => number} random
 * @returns {T[]}
 */
export function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * シャッフル済みの牌山（牌ID 136枚）を作る。
 * @param {number} seed
 * @returns {number[]}
 */
export function createWall(seed) {
  const tiles = Array.from({ length: NUM_TILES }, (_, i) => i);
  return shuffle(tiles, mulberry32(seed));
}

/**
 * @typedef {object} Deal
 * @property {number[][]} hands 席ごとの配牌（各13枚）
 * @property {number[]} live ツモ山（先頭から引く。70枚）
 * @property {number[]} rinshan 嶺上牌（4枚、先頭から引く）
 * @property {number[]} doraIndicators ドラ表示牌（5枚、先頭から順にめくる）
 * @property {number[]} uraIndicators 裏ドラ表示牌（5枚、ドラ表示牌と同じ順）
 */

/**
 * 牌山から配牌する。親から順に4枚ずつ3回、最後に1枚ずつ取る。
 * 親の第1ツモ（14枚目）は live の先頭に残す。
 * @param {readonly number[]} wall createWall() の結果
 * @param {number} [dealer] 親の席 (0-3)
 * @returns {Deal}
 */
export function deal(wall, dealer = 0) {
  if (wall.length !== NUM_TILES) throw new RangeError('牌山は136枚である必要があります');
  /** @type {number[][]} */
  const hands = [[], [], [], []];
  let pos = 0;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 4; i++) {
      const seat = (dealer + i) % 4;
      hands[seat].push(...wall.slice(pos, pos + 4));
      pos += 4;
    }
  }
  for (let i = 0; i < 4; i++) {
    hands[(dealer + i) % 4].push(wall[pos++]);
  }
  const deadStart = NUM_TILES - DEAD_WALL_SIZE;
  const dead = wall.slice(deadStart);
  return {
    hands,
    live: wall.slice(pos, deadStart),
    rinshan: dead.slice(0, 4),
    doraIndicators: [dead[4], dead[6], dead[8], dead[10], dead[12]],
    uraIndicators: [dead[5], dead[7], dead[9], dead[11], dead[13]],
  };
}
