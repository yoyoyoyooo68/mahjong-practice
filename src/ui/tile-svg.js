// 牌のSVGを文字列で作る（DOM非依存なのでNodeでもテストできる）。
// 色は styles/tiles.css のクラスで付ける。CSP のため style 属性は使わない。

import { isRed, kindName, kindOf, numberOf, suitOf, tileName } from '../core/tiles.js';

const W = 40;
const H = 56;
const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_KANJI = ['東', '南', '西', '北', '白', '發', '中'];

/** @typedef {[number, number, string]} Mark x, y, 色クラス(blue/green/red) */

/** 筒子の丸の配置。[半径, 丸の一覧] @type {Record<number, [number, Mark[]]>} */
const PIN_LAYOUT = {
  1: [11, [[20, 28, 'red']]],
  2: [
    6.5,
    [
      [20, 15, 'blue'],
      [20, 41, 'green'],
    ],
  ],
  3: [
    5.5,
    [
      [10, 12, 'blue'],
      [20, 28, 'red'],
      [30, 44, 'green'],
    ],
  ],
  4: [
    5.5,
    [
      [12, 15, 'blue'],
      [28, 15, 'green'],
      [12, 41, 'green'],
      [28, 41, 'blue'],
    ],
  ],
  5: [
    5.2,
    [
      [11, 13, 'blue'],
      [29, 13, 'green'],
      [20, 28, 'red'],
      [11, 43, 'green'],
      [29, 43, 'blue'],
    ],
  ],
  6: [
    5,
    [
      [12, 12, 'green'],
      [28, 12, 'green'],
      [12, 28, 'red'],
      [28, 28, 'red'],
      [12, 44, 'red'],
      [28, 44, 'red'],
    ],
  ],
  7: [
    4.3,
    [
      [9, 9, 'green'],
      [20, 14, 'green'],
      [31, 19, 'green'],
      [12, 33, 'red'],
      [28, 33, 'red'],
      [12, 45, 'red'],
      [28, 45, 'red'],
    ],
  ],
  8: [
    4.3,
    [
      [12, 9.5, 'blue'],
      [28, 9.5, 'blue'],
      [12, 22, 'blue'],
      [28, 22, 'blue'],
      [12, 34.5, 'blue'],
      [28, 34.5, 'blue'],
      [12, 47, 'blue'],
      [28, 47, 'blue'],
    ],
  ],
  9: [
    4.5,
    [
      [9, 12, 'blue'],
      [20, 12, 'blue'],
      [31, 12, 'blue'],
      [9, 28, 'red'],
      [20, 28, 'red'],
      [31, 28, 'red'],
      [9, 44, 'green'],
      [20, 44, 'green'],
      [31, 44, 'green'],
    ],
  ],
};

/** 索子の棒の配置（中心座標） @type {Record<number, Mark[]>} */
const SOU_LAYOUT = {
  2: [
    [20, 16, 'green'],
    [20, 40, 'blue'],
  ],
  3: [
    [20, 15, 'green'],
    [12, 41, 'blue'],
    [28, 41, 'blue'],
  ],
  4: [
    [12, 16, 'green'],
    [28, 16, 'blue'],
    [12, 40, 'blue'],
    [28, 40, 'green'],
  ],
  5: [
    [11, 16, 'green'],
    [29, 16, 'blue'],
    [20, 28, 'red'],
    [11, 40, 'blue'],
    [29, 40, 'green'],
  ],
  6: [
    [10, 17, 'green'],
    [20, 17, 'green'],
    [30, 17, 'green'],
    [10, 39, 'blue'],
    [20, 39, 'blue'],
    [30, 39, 'blue'],
  ],
  7: [
    [20, 12, 'red'],
    [10, 28, 'green'],
    [20, 28, 'green'],
    [30, 28, 'green'],
    [10, 44, 'blue'],
    [20, 44, 'blue'],
    [30, 44, 'blue'],
  ],
  8: [
    [8, 17, 'green'],
    [16, 17, 'green'],
    [24, 17, 'green'],
    [32, 17, 'green'],
    [8, 39, 'blue'],
    [16, 39, 'blue'],
    [24, 39, 'blue'],
    [32, 39, 'blue'],
  ],
  9: [
    [10, 12, 'green'],
    [20, 12, 'red'],
    [30, 12, 'green'],
    [10, 28, 'green'],
    [20, 28, 'red'],
    [30, 28, 'green'],
    [10, 44, 'green'],
    [20, 44, 'red'],
    [30, 44, 'green'],
  ],
};

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * 赤ドラの目印の★。
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function star(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${f(cx + radius * Math.cos(angle))},${f(cy + radius * Math.sin(angle))}`);
  }
  return `<polygon class="tile-star" points="${points.join(' ')}"/>`;
}

/**
 * @param {number} n 1-9
 * @param {boolean} red
 */
function manzu(n, red) {
  const numberClass = red ? 'tile-red' : 'tile-ink';
  const mark = red ? star(20, 28.5, 4) : '';
  const [y1, y2] = red ? [21, 52] : [24, 50];
  return (
    `<text class="tile-text ${numberClass}" x="20" y="${y1}" font-size="19" text-anchor="middle">${NUMBER_KANJI[n - 1]}</text>` +
    mark +
    `<text class="tile-text tile-red" x="20" y="${y2}" font-size="19" text-anchor="middle">萬</text>`
  );
}

/**
 * @param {number} n 1-9
 * @param {boolean} red
 */
function pinzu(n, red) {
  const [r, marks] = PIN_LAYOUT[n];
  let out = '';
  for (const [x, y, color] of marks) {
    if (red && x === 20 && y === 28) {
      out += star(x, y, 7);
      continue;
    }
    out += `<circle class="tile-${red ? 'red' : color}" cx="${x}" cy="${y}" r="${r}"/>`;
    out += `<circle class="tile-hole" cx="${x}" cy="${y}" r="${f(r * 0.42)}"/>`;
    if (n === 1) out += `<circle class="tile-${color}" cx="${x}" cy="${y}" r="${f(r * 0.2)}"/>`;
  }
  return out;
}

/**
 * @param {number} n 1-9
 * @param {boolean} red
 */
function souzu(n, red) {
  if (n === 1) {
    // 一索は太い竹1本で表す
    return (
      '<rect class="tile-green" x="15.5" y="9" width="9" height="38" rx="4"/>' +
      '<rect class="tile-red" x="14" y="20" width="12" height="3" rx="1.5"/>' +
      '<rect class="tile-red" x="14" y="33" width="12" height="3" rx="1.5"/>'
    );
  }
  let out = '';
  for (const [x, y, color] of SOU_LAYOUT[n]) {
    if (red && x === 20 && y === 28) {
      out += star(x, y, 7);
      continue;
    }
    out += `<rect class="tile-${red ? 'red' : color}" x="${f(x - 2.3)}" y="${y - 6.5}" width="4.6" height="13" rx="2.3"/>`;
    out += `<rect class="tile-hole" x="${f(x - 2.3)}" y="${y - 0.6}" width="4.6" height="1.2"/>`;
  }
  return out;
}

/** @param {number} n 1-7（東南西北白發中） */
function honor(n) {
  if (n === 5) {
    // 白は内枠だけ描いて、何もない牌と区別できるようにする
    return '<rect class="tile-haku" x="8" y="10" width="24" height="36" rx="2"/>';
  }
  const color = n === 6 ? 'tile-green' : n === 7 ? 'tile-red' : 'tile-ink';
  return `<text class="tile-text ${color}" x="20" y="39" font-size="30" text-anchor="middle">${HONOR_KANJI[n - 1]}</text>`;
}

/**
 * @param {string} inner
 * @param {string} label
 * @param {number} width
 * @param {string} extraClass
 */
function wrap(inner, label, width, extraClass) {
  const height = f((width * H) / W);
  return (
    `<svg class="tile${extraClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${f(width)}" height="${height}" role="img" aria-label="${label}">` +
    `<rect class="tile-face" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4"/>` +
    inner +
    '</svg>'
  );
}

/**
 * @typedef {object} TileSvgOptions
 * @property {number} [width] 表示幅(px)。高さは 40:56 の比で決まる
 * @property {boolean} [redDora] 赤ドラありか（なしなら赤牌も通常の絵柄にする）
 */

/**
 * 牌種と赤かどうかからSVGを作る。
 * @param {number} kind 牌種 (0-33)
 * @param {boolean} red
 * @param {TileSvgOptions} [options]
 * @returns {string}
 */
export function kindSvg(kind, red, options = {}) {
  const suit = suitOf(kind);
  const n = numberOf(kind);
  const isRedTile = red && suit < 3 && n === 5;
  const inner =
    suit === 0
      ? manzu(n, isRedTile)
      : suit === 1
        ? pinzu(n, isRedTile)
        : suit === 2
          ? souzu(n, isRedTile)
          : honor(n);
  const label = isRedTile ? `赤${kindName(kind)}` : kindName(kind);
  return wrap(inner, label, options.width ?? W, isRedTile ? ' tile--red' : '');
}

/**
 * 牌IDからSVGを作る。
 * @param {number} id 牌ID (0-135)
 * @param {TileSvgOptions} [options]
 * @returns {string}
 */
export function tileSvg(id, options = {}) {
  const redDora = options.redDora ?? true;
  const svg = kindSvg(kindOf(id), redDora && isRed(id), options);
  // aria-label は tileName と必ず一致させる
  return svg.replace(/aria-label="[^"]*"/, `aria-label="${tileName(id, redDora)}"`);
}

/**
 * 裏向きの牌。
 * @param {TileSvgOptions} [options]
 * @returns {string}
 */
export function tileBackSvg(options = {}) {
  return wrap(
    '<rect class="tile-back" x="3" y="3" width="34" height="50" rx="3"/>',
    '裏向きの牌',
    options.width ?? W,
    ' tile--back',
  );
}
