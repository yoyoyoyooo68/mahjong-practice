// シャンテン数（通常形・七対子・国士無双）。
// 和了形は -1、テンパイは 0。入力は牌種ごとの枚数（長さ34）。
//
// 通常形は「色ごとに (面子数 → 最大の搭子数) の表を作り、4色分を組み合わせる」方式。
// 色ごとの表は並びだけで決まるのでメモ化する（結果に影響しない純粋なキャッシュ）。

/** @type {Map<number, Int8Array>} */
const suitMemo = new Map();

/**
 * @param {number[]} c 1色ぶんの枚数（長さ9、作業用に書き換えて戻す）
 * @param {number} i
 * @param {number} mentsu
 * @param {number} taatsu
 * @param {Int8Array} best best[面子数] = 搭子数の最大
 */
function searchSuit(c, i, mentsu, taatsu, best) {
  while (i < 9 && c[i] === 0) i++;
  if (i >= 9) {
    if (taatsu > best[mentsu]) best[mentsu] = taatsu;
    return;
  }
  if (mentsu < 4) {
    if (c[i] >= 3) {
      c[i] -= 3;
      searchSuit(c, i, mentsu + 1, taatsu, best);
      c[i] += 3;
    }
    if (i <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      searchSuit(c, i, mentsu + 1, taatsu, best);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
  }
  if (c[i] >= 2) {
    c[i] -= 2;
    searchSuit(c, i, mentsu, taatsu + 1, best);
    c[i] += 2;
  }
  if (i <= 7 && c[i + 1] > 0) {
    c[i]--;
    c[i + 1]--;
    searchSuit(c, i, mentsu, taatsu + 1, best);
    c[i]++;
    c[i + 1]++;
  }
  if (i <= 6 && c[i + 2] > 0) {
    c[i]--;
    c[i + 2]--;
    searchSuit(c, i, mentsu, taatsu + 1, best);
    c[i]++;
    c[i + 2]++;
  }
  // 残りは孤立牌として捨て置く
  const rest = c[i];
  c[i] = 0;
  searchSuit(c, i + 1, mentsu, taatsu, best);
  c[i] = rest;
}

/**
 * @param {readonly number[]} counts
 * @param {number} offset 色の先頭 (0, 9, 18)
 * @returns {Int8Array} table[面子数] = 搭子数の最大（その面子数が作れなければ -1）
 */
function suitTable(counts, offset) {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 5 + counts[offset + i];
  const cached = suitMemo.get(key);
  if (cached) return cached;
  const best = new Int8Array(5).fill(-1);
  searchSuit(counts.slice(offset, offset + 9), 0, 0, 0, best);
  suitMemo.set(key, best);
  return best;
}

/**
 * 雀頭を固定したうえでの最小シャンテン数。
 * @param {readonly number[]} counts
 * @param {number} melds 副露（暗槓含む）の数
 * @param {number} head 雀頭を取り除いてあるなら 1
 */
function evaluate(counts, melds, head) {
  const tm = suitTable(counts, 0);
  const tp = suitTable(counts, 9);
  const ts = suitTable(counts, 18);
  let honorMentsu = 0;
  let honorTaatsu = 0;
  for (let k = 27; k < 34; k++) {
    if (counts[k] >= 3) honorMentsu++;
    else if (counts[k] === 2) honorTaatsu++;
  }
  let best = 8;
  for (let a = 0; a < 5; a++) {
    if (tm[a] < 0) continue;
    for (let b = 0; b < 5; b++) {
      if (tp[b] < 0) continue;
      for (let c = 0; c < 5; c++) {
        if (ts[c] < 0) continue;
        const mentsu = Math.min(4, a + b + c + honorMentsu + melds);
        const taatsu = Math.min(4 - mentsu, tm[a] + tp[b] + ts[c] + honorTaatsu);
        const value = 8 - 2 * mentsu - taatsu - head;
        if (value < best) best = value;
      }
    }
  }
  return best;
}

/**
 * 通常形（4面子1雀頭）のシャンテン数。
 * @param {readonly number[]} counts 牌種ごとの枚数（長さ34）
 * @param {number} [melds] 副露（暗槓含む）の数
 * @returns {number}
 */
export function shantenNormal(counts, melds = 0) {
  let best = evaluate(counts, melds, 0);
  const work = [...counts];
  for (let k = 0; k < 34; k++) {
    if (work[k] < 2) continue;
    work[k] -= 2;
    const value = evaluate(work, melds, 1);
    if (value < best) best = value;
    work[k] += 2;
  }
  return best;
}

/**
 * 七対子のシャンテン数（門前のみ。同じ牌4枚は1対子としか数えない）。
 * @param {readonly number[]} counts
 * @returns {number}
 */
export function shantenChiitoi(counts) {
  let pairs = 0;
  let kinds = 0;
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

const YAOCHU_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/**
 * 国士無双のシャンテン数（門前のみ）。
 * @param {readonly number[]} counts
 * @returns {number}
 */
export function shantenKokushi(counts) {
  let kinds = 0;
  let pair = 0;
  for (const k of YAOCHU_KINDS) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/**
 * @typedef {object} ShantenDetail
 * @property {number} min 3形のうち最小
 * @property {number} normal 通常形
 * @property {number} chiitoi 七対子（副露ありなら Infinity）
 * @property {number} kokushi 国士無双（副露ありなら Infinity）
 */

/**
 * @param {readonly number[]} counts
 * @param {number} [melds]
 * @returns {ShantenDetail}
 */
export function shantenDetail(counts, melds = 0) {
  const normal = shantenNormal(counts, melds);
  const chiitoi = melds === 0 ? shantenChiitoi(counts) : Number.POSITIVE_INFINITY;
  const kokushi = melds === 0 ? shantenKokushi(counts) : Number.POSITIVE_INFINITY;
  return { min: Math.min(normal, chiitoi, kokushi), normal, chiitoi, kokushi };
}

/**
 * シャンテン数（通常形・七対子・国士無双の最小）。
 * @param {readonly number[]} counts 牌種ごとの枚数（長さ34）。手牌は 13-3×副露 枚か、それ+1枚
 * @param {number} [melds] 副露（暗槓含む）の数
 * @returns {number} 和了形 -1、テンパイ 0
 */
export function shanten(counts, melds = 0) {
  return shantenDetail(counts, melds).min;
}
