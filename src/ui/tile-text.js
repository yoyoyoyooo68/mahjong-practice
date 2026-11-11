// 説明文の中に牌の絵を入れる。文中の {123m} のような部分を、小さな牌のSVGに置き換える。
// 表記は parseTiles と同じ（m=萬 p=筒 s=索 z=字、0 は赤五）。同じ牌が何枚あってもよい。

import { kindName } from '../core/tiles.js';
import { kindSvg } from './tile-svg.js';

const SUIT_READING = ['マン', 'ピン', 'ソー'];

/**
 * 初心者向けの牌の読み方（「3マン」「5ピン」「東」など）。レッスン・ヒント・手牌の名前でそろえる。
 * @param {number} kind
 * @returns {string}
 */
export function tileReading(kind) {
  return kind >= 27 ? kindName(kind) : `${(kind % 9) + 1}${SUIT_READING[Math.floor(kind / 9)]}`;
}

/** 文中の牌の幅(px) */
export const INLINE_TILE_WIDTH = 18;

const SUITS = 'mpsz';

/**
 * "123m55z" を [牌種, 赤か] の列にする。
 * @param {string} text
 * @returns {{ kind: number, red: boolean }[]}
 */
export function parseKinds(text) {
  /** @type {{ kind: number, red: boolean }[]} */
  const out = [];
  /** @type {number[]} */
  let pending = [];
  for (const ch of text.replace(/\s+/g, '')) {
    const suit = SUITS.indexOf(ch);
    if (suit === -1) {
      if (ch < '0' || ch > '9') throw new SyntaxError(`牌の表記が不正です: "${text}"`);
      pending.push(Number(ch));
      continue;
    }
    for (const n of pending) {
      if (suit === 3 && (n === 0 || n > 7)) throw new SyntaxError(`字牌は1〜7です: "${text}"`);
      out.push({ kind: suit * 9 + (n === 0 ? 4 : n - 1), red: n === 0 });
    }
    pending = [];
  }
  if (pending.length > 0) throw new SyntaxError(`末尾に種類(m/p/s/z)がありません: "${text}"`);
  return out;
}

/**
 * 牌の列を、横に並んだ小さな絵にする。
 * @param {string} text "123m" など
 * @param {number} [width]
 * @returns {string}
 */
export function tileRowHtml(text, width = INLINE_TILE_WIDTH) {
  const tiles = parseKinds(text);
  const label = tiles.map((t) => (t.red ? `赤${kindName(t.kind)}` : kindName(t.kind))).join('・');
  // 読み上げは列全体で1回にする（1枚ずつ読むと長くなるため）
  const svgs = tiles.map((t) =>
    kindSvg(t.kind, t.red, { width }).replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"'),
  );
  return `<span class="inline-tiles" role="img" aria-label="${label}">${svgs.join('')}</span>`;
}

/**
 * 説明文の {…} を牌の絵に置き換える。それ以外の文字はそのまま（HTMLとして扱う）。
 * @param {string} text
 * @param {number} [width]
 * @returns {string}
 */
export function richText(text, width = INLINE_TILE_WIDTH) {
  return text.replace(/\{([0-9mpsz\s]+)\}/g, (_, tiles) => tileRowHtml(tiles, width));
}

/**
 * 牌種1つを {…} 表記にする（ヒント文などで使う）。
 * @param {number} kind
 * @returns {string}
 */
export function kindToken(kind) {
  return `{${(kind % 9) + 1}${SUITS[Math.floor(kind / 9)]}}`;
}
