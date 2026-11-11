// 牌効率: 受け入れ枚数と最善打牌。ヒントとCPUが共有する。
// 計算は牌種（0〜33）で行い、赤・ドラは同評価のときのタイブレークにだけ使う。

import { shanten } from './shanten.js';
import { isHonor, isRed, isTerminal, kindName, kindOf, numberOf, toCounts } from './tiles.js';

/**
 * @typedef {object} UkeireTile
 * @property {number} kind 受け入れ牌の牌種
 * @property {number} count 見えていない残り枚数
 */

/**
 * @typedef {object} Ukeire
 * @property {number} shanten 現在のシャンテン数
 * @property {UkeireTile[]} tiles シャンテン数が進む牌（残り0枚のものは含めない）
 * @property {number} total 受け入れ枚数の合計
 */

/**
 * @typedef {object} DiscardOption
 * @property {number} tile 切る牌の牌ID
 * @property {number} kind 切る牌の牌種
 * @property {number} shanten 切った後のシャンテン数
 * @property {Ukeire} ukeire 切った後の受け入れ
 * @property {number} keepValue 手に残したい度合い（小さいほど先に切る。タイブレーク用）
 */

/**
 * @typedef {object} EfficiencyOptions
 * @property {number} [melds] 副露（暗槓含む）の数
 * @property {readonly number[]} [visible] 自分の手牌以外で見えている牌の枚数（長さ34。河・副露・ドラ表示牌）
 * @property {readonly number[]} [doraKinds] ドラの牌種
 * @property {readonly number[]} [yakuhaiKinds] 役牌になる字牌の牌種（同評価なら客風より後に切る）
 * @property {boolean} [redDora] 赤ドラありか
 */

/**
 * @param {readonly number[]} counts 手牌（ツモ前の枚数）
 * @param {number} melds
 * @param {readonly number[]} unseen 牌種ごとの見えていない枚数
 * @returns {Ukeire}
 */
function ukeireWith(counts, melds, unseen) {
  const current = shanten(counts, melds);
  const work = [...counts];
  /** @type {UkeireTile[]} */
  const tiles = [];
  let total = 0;
  for (let k = 0; k < 34; k++) {
    if (work[k] >= 4 || unseen[k] <= 0) continue;
    work[k]++;
    if (shanten(work, melds) < current) {
      tiles.push({ kind: k, count: unseen[k] });
      total += unseen[k];
    }
    work[k]--;
  }
  return { shanten: current, tiles, total };
}

/**
 * @param {readonly number[]} counts 自分の手牌
 * @param {readonly number[] | undefined} visible
 * @returns {number[]}
 */
function unseenCounts(counts, visible) {
  return counts.map((n, k) => Math.max(0, 4 - n - (visible ? visible[k] : 0)));
}

/**
 * ツモ前の手牌（13-3×副露 枚）の受け入れを求める。
 * @param {readonly number[]} counts 牌種ごとの枚数（長さ34）
 * @param {EfficiencyOptions} [options]
 * @returns {Ukeire}
 */
export function calcUkeire(counts, options = {}) {
  return ukeireWith(counts, options.melds ?? 0, unseenCounts(counts, options.visible));
}

/**
 * @param {number} tile 牌ID
 * @param {EfficiencyOptions} options
 * @returns {number}
 */
function keepValueOf(tile, options) {
  const kind = kindOf(tile);
  let value = 0;
  if (isHonor(kind)) value = options.yakuhaiKinds?.includes(kind) ? 0.5 : 0;
  else if (isTerminal(kind)) value = 1;
  else if (numberOf(kind) === 2 || numberOf(kind) === 8) value = 2;
  else value = 3;
  if (options.doraKinds?.includes(kind)) value += 50;
  if ((options.redDora ?? true) && isRed(tile)) value += 100;
  return value;
}

/**
 * ツモ後の手牌（14-3×副露 枚）について、切る牌の候補を良い順に並べて返す。
 * 並び順: シャンテン数が小さい → 受け入れ枚数が多い → 赤・ドラを残し字牌・端牌から切る。
 * @param {readonly number[]} hand 手牌の牌ID
 * @param {EfficiencyOptions} [options]
 * @returns {DiscardOption[]}
 */
export function evaluateDiscards(hand, options = {}) {
  const melds = options.melds ?? 0;
  const counts = toCounts(hand);
  // 切った牌は自分の河に見えるので、見えていない枚数は切る前の手牌から数える
  const unseen = unseenCounts(counts, options.visible);

  /** @type {Map<number, number>} 牌種 → 切る牌ID（同じ牌種なら残したい度合いの低い牌） */
  const candidates = new Map();
  for (const tile of hand) {
    const kind = kindOf(tile);
    const current = candidates.get(kind);
    if (current === undefined || keepValueOf(tile, options) < keepValueOf(current, options)) {
      candidates.set(kind, tile);
    }
  }

  /** @type {DiscardOption[]} */
  const result = [];
  for (const [kind, tile] of candidates) {
    counts[kind]--;
    const ukeire = ukeireWith(counts, melds, unseen);
    counts[kind]++;
    result.push({
      tile,
      kind,
      shanten: ukeire.shanten,
      ukeire,
      keepValue: keepValueOf(tile, options),
    });
  }
  result.sort(
    (a, b) =>
      a.shanten - b.shanten ||
      b.ukeire.total - a.ukeire.total ||
      a.keepValue - b.keepValue ||
      a.kind - b.kind,
  );
  return result;
}

/**
 * @param {number} value シャンテン数
 * @returns {string} 「和了形」「テンパイ」「2シャンテン」など
 */
export function shantenLabel(value) {
  if (value < 0) return '和了形';
  if (value === 0) return 'テンパイ';
  return `${value}シャンテン`;
}

/**
 * @typedef {object} DiscardAdvice
 * @property {number} currentShanten ツモ後の手牌のシャンテン数（-1 なら和了形）
 * @property {DiscardOption[]} options 全候補（良い順）
 * @property {DiscardOption | null} best 推奨の打牌（和了形のときは null）
 * @property {string} reason 推奨の理由（日本語）
 */

/**
 * ヒント用: 最善の打牌と理由を返す。
 * @param {readonly number[]} hand ツモ後の手牌の牌ID
 * @param {EfficiencyOptions} [options]
 * @returns {DiscardAdvice}
 */
export function adviseDiscard(hand, options = {}) {
  const currentShanten = shanten(toCounts(hand), options.melds ?? 0);
  const all = evaluateDiscards(hand, options);
  if (currentShanten < 0) {
    return { currentShanten, options: all, best: null, reason: '和了形です。' };
  }
  const best = all[0];
  return { currentShanten, options: all, best, reason: explainDiscard(best, all) };
}

/**
 * @param {DiscardOption} option 説明したい候補
 * @param {readonly DiscardOption[]} all evaluateDiscards() の結果
 * @returns {string}
 */
export function explainDiscard(option, all) {
  const name = kindName(option.kind);
  const { tiles, total } = option.ukeire;
  const state = shantenLabel(option.shanten);
  const parts = [];
  if (option.shanten === 0) {
    const waits = tiles.map((t) => `${kindName(t.kind)} 残り${t.count}枚`).join('、');
    parts.push(
      total > 0
        ? `${name}を切るとテンパイ。待ちは ${waits}。`
        : `${name}を切るとテンパイですが、待ち牌が残っていません。`,
    );
  } else {
    const list = tiles.map((t) => kindName(t.kind)).join('・');
    parts.push(`${name}を切ると${state}。受け入れは${tiles.length}種${total}枚（${list}）。`);
  }

  const same = all.filter((o) => o.shanten === option.shanten && o.ukeire.total === total);
  const better = all.some(
    (o) => o.shanten < option.shanten || (o.shanten === option.shanten && o.ukeire.total > total),
  );
  if (!better) {
    if (same.length === 1) {
      parts.push('受け入れ枚数がいちばん多い切り方です。');
    } else if (same[0] === option) {
      parts.push('同じ広さの候補の中では、赤・ドラを残して字牌・端牌から切ります。');
    } else {
      parts.push('受け入れ枚数は最多タイです。');
    }
  }
  return parts.join('');
}
