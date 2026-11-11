// 和了形の分解。同じ手牌でも面子の取り方が複数あるので、全部を列挙する。
// 点数計算（score.js）が、その中から最高点になる取り方を選ぶ。

import { kindOf } from './tiles.js';

/** @typedef {'chi' | 'pon' | 'minkan' | 'kakan' | 'ankan'} MeldType */

/**
 * 副露（暗槓も含む）。
 * @typedef {object} Meld
 * @property {MeldType} type
 * @property {number[]} tiles 牌ID（チー・ポンは3枚、カンは4枚）
 */

/**
 * @typedef {object} TileSet 手の内の面子
 * @property {'shuntsu' | 'koutsu'} type
 * @property {number} kind 順子は一番小さい牌種、刻子はその牌種
 */

/**
 * @typedef {{ form: 'normal', head: number, sets: TileSet[] }
 *   | { form: 'chiitoi', pairs: number[] }
 *   | { form: 'kokushi', pair: number }} Decomposition
 */

/**
 * @typedef {object} Group 副露も含めた面子
 * @property {'shuntsu' | 'koutsu' | 'kantsu'} type
 * @property {number} kind 順子は一番小さい牌種
 * @property {boolean} open 明刻・明槓・鳴いた順子なら true（ロンで完成した刻子も明刻扱い）
 */

/** @typedef {'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki' | 'kokushi' | 'kokushi13'} WaitType */

/**
 * 和了牌をどこに使ったかまで決めた、手牌の解釈ひとつ。
 * @typedef {object} HandShape
 * @property {'normal' | 'chiitoi' | 'kokushi'} form
 * @property {number} head 雀頭の牌種（七対子は -1）
 * @property {Group[]} groups 面子4つ（通常形のみ。手の内 → 副露の順）
 * @property {number[]} pairs 七対子の対子7つ（それ以外は空）
 * @property {WaitType} wait 待ちの形
 */

const YAOCHU_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/**
 * @param {number[]} c 作業用の枚数（書き換えて戻す）
 * @param {number} need 残り面子数
 * @param {TileSet[]} acc
 * @param {TileSet[][]} out
 */
function splitSets(c, need, acc, out) {
  const i = c.findIndex((n) => n > 0);
  if (need === 0) {
    if (i === -1) out.push([...acc]);
    return;
  }
  if (i === -1) return;
  // いちばん小さい牌を刻子に使うか順子に使うかで分岐する（取り方の重複は出ない）
  if (c[i] >= 3) {
    c[i] -= 3;
    acc.push({ type: 'koutsu', kind: i });
    splitSets(c, need - 1, acc, out);
    acc.pop();
    c[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--;
    c[i + 1]--;
    c[i + 2]--;
    acc.push({ type: 'shuntsu', kind: i });
    splitSets(c, need - 1, acc, out);
    acc.pop();
    c[i]++;
    c[i + 1]++;
    c[i + 2]++;
  }
}

/**
 * 手の内の牌（和了牌を含む）を和了形に分解する。和了形でなければ空配列。
 * @param {readonly number[]} counts 牌種ごとの枚数（長さ34）
 * @param {number} [meldCount] 副露（暗槓含む）の数
 * @returns {Decomposition[]}
 */
export function decompose(counts, meldCount = 0) {
  /** @type {Decomposition[]} */
  const out = [];
  const work = [...counts];
  for (let head = 0; head < 34; head++) {
    if (work[head] < 2) continue;
    work[head] -= 2;
    /** @type {TileSet[][]} */
    const found = [];
    splitSets(work, 4 - meldCount, [], found);
    work[head] += 2;
    for (const sets of found) out.push({ form: 'normal', head, sets });
  }
  if (meldCount === 0) {
    const pairs = [];
    let onlyPairs = true;
    for (let k = 0; k < 34; k++) {
      if (counts[k] === 2) pairs.push(k);
      else if (counts[k] !== 0) onlyPairs = false;
    }
    if (onlyPairs && pairs.length === 7) out.push({ form: 'chiitoi', pairs });

    const total = counts.reduce((a, b) => a + b, 0);
    const yaochuTotal = YAOCHU_KINDS.reduce((a, k) => a + counts[k], 0);
    if (total === 14 && yaochuTotal === 14 && YAOCHU_KINDS.every((k) => counts[k] >= 1)) {
      const pair = YAOCHU_KINDS.find((k) => counts[k] === 2);
      if (pair !== undefined) out.push({ form: 'kokushi', pair });
    }
  }
  return out;
}

/**
 * @param {readonly number[]} counts
 * @param {number} [meldCount]
 * @returns {boolean}
 */
export function isAgari(counts, meldCount = 0) {
  return decompose(counts, meldCount).length > 0;
}

/**
 * @param {Meld} meld
 * @returns {Group}
 */
export function meldToGroup(meld) {
  const kind = Math.min(...meld.tiles.map(kindOf));
  if (meld.type === 'chi') return { type: 'shuntsu', kind, open: true };
  if (meld.type === 'pon') return { type: 'koutsu', kind, open: true };
  return { type: 'kantsu', kind, open: meld.type !== 'ankan' };
}

/**
 * 和了牌をどの面子（または雀頭）に使ったかの違いまで含めて、手牌の解釈を全部列挙する。
 * @param {readonly number[]} counts 手の内の牌（和了牌を含む）の枚数
 * @param {readonly Meld[]} melds
 * @param {number} winKind 和了牌の牌種
 * @param {boolean} tsumo ツモ和了か
 * @returns {HandShape[]}
 */
export function enumerateShapes(counts, melds, winKind, tsumo) {
  /** @type {HandShape[]} */
  const out = [];
  const meldGroups = melds.map(meldToGroup);
  for (const d of decompose(counts, melds.length)) {
    if (d.form === 'kokushi') {
      const wait = d.pair === winKind ? 'kokushi13' : 'kokushi';
      out.push({ form: 'kokushi', head: d.pair, groups: [], pairs: [], wait });
      continue;
    }
    if (d.form === 'chiitoi') {
      out.push({ form: 'chiitoi', head: -1, groups: [], pairs: d.pairs, wait: 'tanki' });
      continue;
    }
    /** @type {Group[]} */
    const concealed = d.sets.map((s) => ({ type: s.type, kind: s.kind, open: false }));
    if (d.head === winKind) {
      out.push({
        form: 'normal',
        head: d.head,
        groups: [...concealed, ...meldGroups],
        pairs: [],
        wait: 'tanki',
      });
    }
    const seen = new Set();
    d.sets.forEach((set, index) => {
      const key = `${set.type}${set.kind}`;
      if (seen.has(key)) return;
      /** @type {WaitType | null} */
      let wait = null;
      if (set.type === 'koutsu') {
        if (set.kind === winKind) wait = 'shanpon';
      } else if (winKind === set.kind + 1) {
        wait = 'kanchan';
      } else if (winKind === set.kind) {
        wait = set.kind % 9 === 6 ? 'penchan' : 'ryanmen';
      } else if (winKind === set.kind + 2) {
        wait = set.kind % 9 === 0 ? 'penchan' : 'ryanmen';
      }
      if (wait === null) return;
      seen.add(key);
      const groups = concealed.map((g, i) =>
        // ロンで完成した刻子は明刻として扱う
        i === index && set.type === 'koutsu' && !tsumo ? { ...g, open: true } : g,
      );
      out.push({ form: 'normal', head: d.head, groups: [...groups, ...meldGroups], pairs: [], wait });
    });
  }
  return out;
}
