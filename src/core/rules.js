// ルール設定（DESIGN.md 第2章）。【暫定】の項目は設計書の変更履歴と合わせて更新する。

/**
 * @typedef {object} Rules
 * @property {number} startPoints 持ち点
 * @property {number} rounds 局数（東風戦 = 4）
 * @property {boolean} redDora 赤ドラ（5萬・5筒・5索 各1枚）
 * @property {boolean} kuitan 喰いタン
 * @property {boolean} agariYame オーラスのアガリ止め【暫定】
 * @property {boolean} doubleRon ダブロン
 * @property {boolean} tripleRonDraw 三家和了で流局
 * @property {boolean} nagashiMangan 流し満貫
 * @property {boolean} kazoeYakuman 数え役満
 * @property {boolean} doubleYakuman ダブル役満【暫定】
 * @property {boolean} kiriageMangan 切り上げ満貫
 * @property {boolean} pao 責任払い【暫定】
 * @property {boolean} bustEnds 飛び終了
 * @property {number} notenPenalty ノーテン罰符（場の合計）
 * @property {number} honbaValue 1本場あたりの点数
 */

/** @type {Readonly<Rules>} */
export const DEFAULT_RULES = Object.freeze({
  startPoints: 25000,
  rounds: 4,
  redDora: true,
  kuitan: true,
  agariYame: true,
  doubleRon: true,
  tripleRonDraw: true,
  nagashiMangan: true,
  kazoeYakuman: true,
  doubleYakuman: true,
  kiriageMangan: false,
  pao: false,
  bustEnds: true,
  notenPenalty: 3000,
  honbaValue: 300,
});

/**
 * @param {Partial<Rules>} [overrides]
 * @returns {Readonly<Rules>}
 */
export function createRules(overrides = {}) {
  return Object.freeze({ ...DEFAULT_RULES, ...overrides });
}
