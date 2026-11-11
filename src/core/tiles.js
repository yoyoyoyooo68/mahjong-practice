// 牌の表現。
// - 牌種 (kind): 0〜33。萬子 0-8、筒子 9-17、索子 18-26、字牌 27-33（東南西北白發中）
// - 牌ID (id): 0〜135。kind = id >> 2。各牌種の 0 枚目が 5 のとき赤ドラ扱い

export const NUM_KINDS = 34;
export const NUM_TILES = 136;

/** 赤ドラの牌ID（赤五萬・赤五筒・赤五索） */
export const RED_IDS = Object.freeze([16, 52, 88]);

const SUIT_LETTERS = ['m', 'p', 's', 'z'];
const NUMBER_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_KANJI = ['萬', '筒', '索'];
const HONOR_KANJI = ['東', '南', '西', '北', '白', '發', '中'];

/**
 * @param {number} id 牌ID (0-135)
 * @returns {number} 牌種 (0-33)
 */
export function kindOf(id) {
  return id >> 2;
}

/**
 * @param {number} id
 * @returns {boolean} 赤ドラに割り当てられた牌かどうか（ルールで赤なしの場合は呼び出し側で無視する）
 */
export function isRed(id) {
  return id === 16 || id === 52 || id === 88;
}

/**
 * @param {number} kind
 * @returns {number} 0=萬子, 1=筒子, 2=索子, 3=字牌
 */
export function suitOf(kind) {
  return Math.floor(kind / 9);
}

/**
 * @param {number} kind
 * @returns {number} 数牌は 1-9、字牌は 1-7（東南西北白發中）
 */
export function numberOf(kind) {
  return (kind % 9) + 1;
}

/** @param {number} kind */
export function isHonor(kind) {
  return kind >= 27;
}

/** @param {number} kind 一九牌かどうか（字牌は含まない） */
export function isTerminal(kind) {
  return kind < 27 && (kind % 9 === 0 || kind % 9 === 8);
}

/** @param {number} kind 么九牌（一九字牌）かどうか */
export function isYaochu(kind) {
  return isHonor(kind) || isTerminal(kind);
}

/**
 * @param {number} kind
 * @returns {string} 「三萬」「東」など
 */
export function kindName(kind) {
  if (kind < 0 || kind >= NUM_KINDS) throw new RangeError(`牌種が範囲外です: ${kind}`);
  if (isHonor(kind)) return HONOR_KANJI[kind - 27];
  return NUMBER_KANJI[kind % 9] + SUIT_KANJI[suitOf(kind)];
}

/**
 * @param {number} id
 * @param {boolean} [redDora] 赤ドラありのルールか
 * @returns {string} 「三萬」「赤五筒」など
 */
export function tileName(id, redDora = true) {
  const name = kindName(kindOf(id));
  return redDora && isRed(id) ? `赤${name}` : name;
}

/**
 * ドラ表示牌からドラの牌種を求める。
 * @param {number} indicatorKind
 * @returns {number}
 */
export function doraKindOf(indicatorKind) {
  if (indicatorKind < 27) {
    const base = indicatorKind - (indicatorKind % 9);
    return base + (((indicatorKind % 9) + 1) % 9);
  }
  if (indicatorKind < 31) return 27 + ((indicatorKind - 27 + 1) % 4);
  return 31 + ((indicatorKind - 31 + 1) % 3);
}

/**
 * 牌IDの配列を牌種ごとの枚数（長さ34）にまとめる。
 * @param {readonly number[]} ids
 * @returns {number[]}
 */
export function toCounts(ids) {
  const counts = new Array(NUM_KINDS).fill(0);
  for (const id of ids) counts[kindOf(id)]++;
  return counts;
}

/**
 * 理牌（萬筒索字の順、同じ牌種では赤を先に）。元の配列は変更しない。
 * @param {readonly number[]} ids
 * @returns {number[]}
 */
export function sortTiles(ids) {
  return [...ids].sort((a, b) => a - b);
}

/**
 * "123m406p789s1122z" のような表記を牌IDの配列にする。0 は赤五。
 * 同じ牌種は別々の牌IDに割り当てる（通常の5は赤以外を優先）。
 * @param {string} text
 * @param {Set<number>} [used] 使用済みの牌ID。複数回に分けて読むときに同じ Set を渡すと牌IDが重ならない
 * @returns {number[]}
 */
export function parseTiles(text, used = new Set()) {
  /** @type {number[]} */
  const ids = [];
  /** @type {string[]} */
  let pending = [];
  for (const ch of text.replace(/\s+/g, '')) {
    const suit = SUIT_LETTERS.indexOf(ch);
    if (suit === -1) {
      if (ch < '0' || ch > '9') throw new SyntaxError(`牌の表記が不正です: "${text}"`);
      pending.push(ch);
      continue;
    }
    for (const digit of pending) {
      const n = Number(digit);
      const red = n === 0;
      if (suit === 3 && (red || n > 7)) throw new SyntaxError(`字牌は1〜7です: "${text}"`);
      const kind = suit * 9 + (red ? 4 : n - 1);
      const five = suit < 3 && kind % 9 === 4;
      const order = red ? [0] : five ? [1, 2, 3, 0] : [0, 1, 2, 3];
      const copy = order.find((c) => !used.has(kind * 4 + c));
      if (copy === undefined) throw new RangeError(`同じ牌が多すぎます: ${kindName(kind)}`);
      used.add(kind * 4 + copy);
      ids.push(kind * 4 + copy);
    }
    pending = [];
  }
  if (pending.length > 0) throw new SyntaxError(`末尾に種類(m/p/s/z)がありません: "${text}"`);
  return ids;
}

/**
 * 牌IDの配列を "123m406p" 形式の文字列にする（理牌済みで出力）。
 * @param {readonly number[]} ids
 * @param {boolean} [redDora]
 * @returns {string}
 */
export function formatTiles(ids, redDora = true) {
  let out = '';
  let currentSuit = -1;
  for (const id of sortTiles(ids)) {
    const kind = kindOf(id);
    const suit = suitOf(kind);
    if (suit !== currentSuit) {
      if (currentSuit !== -1) out += SUIT_LETTERS[currentSuit];
      currentSuit = suit;
    }
    out += redDora && isRed(id) ? '0' : String(numberOf(kind));
  }
  if (currentSuit !== -1) out += SUIT_LETTERS[currentSuit];
  return out;
}
