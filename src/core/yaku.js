// 役判定（1役 = 1関数のテーブル駆動）。役一覧・役解説の元データも兼ねる。

import { DEFAULT_RULES } from './rules.js';
import { isHonor, isTerminal, isYaochu, suitOf } from './tiles.js';

/** @typedef {import('./agari.js').HandShape} HandShape */
/** @typedef {import('./agari.js').Group} Group */
/** @typedef {import('./rules.js').Rules} Rules */

/**
 * 役判定に渡す情報。
 * @typedef {object} YakuInput
 * @property {HandShape} shape 手牌の解釈
 * @property {number[]} kinds 手牌全体（副露含む）に含まれる牌種の一覧
 * @property {readonly number[]} counts 手の内の牌（和了牌を含む）の枚数
 * @property {number} meldCount 副露（暗槓含む）の数
 * @property {boolean} menzen 門前か（暗槓だけなら門前）
 * @property {boolean} tsumo
 * @property {number} winKind 和了牌の牌種
 * @property {number} seatWind 自風の牌種 (27-30)
 * @property {number} roundWind 場風の牌種 (27-30)
 * @property {boolean} riichi
 * @property {boolean} doubleRiichi
 * @property {boolean} ippatsu
 * @property {boolean} rinshan
 * @property {boolean} chankan
 * @property {boolean} haitei
 * @property {boolean} houtei
 * @property {boolean} tenhou
 * @property {boolean} chiihou
 * @property {Readonly<Rules>} rules
 */

/**
 * @typedef {object} YakuDef
 * @property {string} id
 * @property {string} name
 * @property {string} yomi 読み仮名
 * @property {number} han 門前での翻数（役満は 13）
 * @property {number} openHan 鳴いたときの翻数（0 なら門前限定）
 * @property {boolean} yakuman
 * @property {string} [doubleName] ダブル役満になる形の呼び名
 * @property {string} desc 役の説明（役一覧・解説で表示）
 * @property {(h: YakuInput) => number} check 成立しなければ 0。通常役は 1、役満は倍数（1 か 2）
 */

/**
 * @typedef {object} YakuResult
 * @property {string} id
 * @property {string} name
 * @property {number} han 通常役の翻数（役満は 0）
 * @property {number} yakuman 役満の倍数（通常役は 0）
 */

const DRAGONS = [31, 32, 33];
const WINDS = [27, 28, 29, 30];
const GREEN = new Set([19, 20, 21, 23, 25, 32]);

/** @param {boolean} cond */
const yes = (cond) => (cond ? 1 : 0);

/** @param {Group} g */
const isTriplet = (g) => g.type !== 'shuntsu';

/** @param {YakuInput} h @param {number} kind */
const hasTriplet = (h, kind) => h.shape.groups.some((g) => isTriplet(g) && g.kind === kind);

/** @param {YakuInput} h @param {readonly number[]} kinds */
const countTriplets = (h, kinds) => kinds.filter((k) => hasTriplet(h, k)).length;

/** @param {YakuInput} h */
const concealedTriplets = (h) => h.shape.groups.filter((g) => isTriplet(g) && !g.open).length;

/** @param {YakuInput} h */
const kantsuCount = (h) => h.shape.groups.filter((g) => g.type === 'kantsu').length;

/** @param {YakuInput} h 順子の開始牌種の一覧 */
const shuntsuKinds = (h) => h.shape.groups.filter((g) => g.type === 'shuntsu').map((g) => g.kind);

/** @param {YakuInput} h 同じ順子2組の数 */
function peikouCount(h) {
  /** @type {Map<number, number>} */
  const seen = new Map();
  for (const k of shuntsuKinds(h)) seen.set(k, (seen.get(k) ?? 0) + 1);
  let pairs = 0;
  for (const n of seen.values()) pairs += Math.floor(n / 2);
  return pairs;
}

/**
 * 面子と雀頭を、それぞれ含まれる牌種の配列にする。
 * @param {YakuInput} h
 * @returns {number[][]}
 */
function blocks(h) {
  const { shape } = h;
  if (shape.form === 'chiitoi') return shape.pairs.map((k) => [k]);
  return [
    ...shape.groups.map((g) => (g.type === 'shuntsu' ? [g.kind, g.kind + 1, g.kind + 2] : [g.kind])),
    [shape.head],
  ];
}

/** @param {YakuInput} h 数牌の色の種類数 */
const suitCount = (h) => new Set(h.kinds.filter((k) => !isHonor(k)).map(suitOf)).size;

/** @param {YakuInput} h @param {number} kind 雀頭にすると符が付く牌か */
export function isYakuhaiKind(h, kind) {
  return DRAGONS.includes(kind) || kind === h.seatWind || kind === h.roundWind;
}

/** @param {YakuInput} h 九蓮宝燈なら 1、純正なら 2 */
function chuuren(h) {
  if (h.meldCount > 0 || h.shape.form !== 'normal' || suitCount(h) !== 1) return 0;
  if (h.kinds.some(isHonor)) return 0;
  const base = suitOf(h.kinds[0]) * 9;
  for (let i = 0; i < 9; i++) {
    const need = i === 0 || i === 8 ? 3 : 1;
    if (h.counts[base + i] < need) return 0;
  }
  // 和了牌を除いた13枚が 1112345678999 ちょうどなら純正（9面待ち）
  const winIndex = h.winKind - base;
  const before = h.counts[h.winKind] - 1;
  return before === (winIndex === 0 || winIndex === 8 ? 3 : 1) ? 2 : 1;
}

/**
 * 役の一覧。並び順は役一覧ページの表示順（翻数の小さい順 → 役満）。
 * @type {readonly YakuDef[]}
 */
export const YAKU = Object.freeze([
  // --- 1翻 ---
  {
    id: 'riichi',
    name: '立直',
    yomi: 'リーチ',
    han: 1,
    openHan: 0,
    yakuman: false,
    desc: '門前でテンパイして「リーチ」を宣言する。1000点を場に出し、以後は手を変えられない。',
    check: (h) => yes(h.riichi && !h.doubleRiichi),
  },
  {
    id: 'ippatsu',
    name: '一発',
    yomi: 'イッパツ',
    han: 1,
    openHan: 0,
    yakuman: false,
    desc: 'リーチ後、1巡以内に和了する。途中で誰かが鳴くと消える。',
    check: (h) => yes((h.riichi || h.doubleRiichi) && h.ippatsu),
  },
  {
    id: 'tsumo',
    name: '門前清自摸和',
    yomi: 'メンゼンツモ',
    han: 1,
    openHan: 0,
    yakuman: false,
    desc: '鳴かずに、自分で引いた牌で和了する。',
    check: (h) => yes(h.menzen && h.tsumo),
  },
  {
    id: 'pinfu',
    name: '平和',
    yomi: 'ピンフ',
    han: 1,
    openHan: 0,
    yakuman: false,
    desc: '面子4つがすべて順子、雀頭が役牌でなく、両面待ちで和了する。門前限定。',
    check: (h) =>
      yes(
        h.menzen &&
          h.shape.form === 'normal' &&
          h.shape.groups.every((g) => g.type === 'shuntsu') &&
          h.shape.wait === 'ryanmen' &&
          !isYakuhaiKind(h, h.shape.head),
      ),
  },
  {
    id: 'tanyao',
    name: '断么九',
    yomi: 'タンヤオ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '2〜8の数牌だけで手を作る。一九牌と字牌を使わない。',
    check: (h) => yes(h.kinds.every((k) => !isYaochu(k)) && (h.menzen || h.rules.kuitan)),
  },
  {
    id: 'iipeikou',
    name: '一盃口',
    yomi: 'イーペーコー',
    han: 1,
    openHan: 0,
    yakuman: false,
    desc: '同じ順子を2組そろえる（例: 223344）。門前限定。',
    check: (h) => yes(h.menzen && peikouCount(h) === 1),
  },
  {
    id: 'haku',
    name: '役牌 白',
    yomi: 'ヤクハイ ハク',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '白を3枚そろえる。',
    check: (h) => yes(hasTriplet(h, 31)),
  },
  {
    id: 'hatsu',
    name: '役牌 發',
    yomi: 'ヤクハイ ハツ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '發を3枚そろえる。',
    check: (h) => yes(hasTriplet(h, 32)),
  },
  {
    id: 'chun',
    name: '役牌 中',
    yomi: 'ヤクハイ チュン',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '中を3枚そろえる。',
    check: (h) => yes(hasTriplet(h, 33)),
  },
  {
    id: 'jikaze',
    name: '自風牌',
    yomi: 'ジカゼハイ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '自分の席の風牌を3枚そろえる。',
    check: (h) => yes(hasTriplet(h, h.seatWind)),
  },
  {
    id: 'bakaze',
    name: '場風牌',
    yomi: 'バカゼハイ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '場の風牌（東場なら東）を3枚そろえる。自風と重なれば2翻。',
    check: (h) => yes(hasTriplet(h, h.roundWind)),
  },
  {
    id: 'rinshan',
    name: '嶺上開花',
    yomi: 'リンシャンカイホウ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: 'カンをして引いた嶺上牌で和了する。',
    check: (h) => yes(h.rinshan),
  },
  {
    id: 'chankan',
    name: '槍槓',
    yomi: 'チャンカン',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '他家が加槓した牌でロンする。',
    check: (h) => yes(h.chankan),
  },
  {
    id: 'haitei',
    name: '海底摸月',
    yomi: 'ハイテイモーユエ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '山の最後の牌をツモって和了する。',
    check: (h) => yes(h.haitei && h.tsumo),
  },
  {
    id: 'houtei',
    name: '河底撈魚',
    yomi: 'ホウテイラオユイ',
    han: 1,
    openHan: 1,
    yakuman: false,
    desc: '局の最後の捨て牌でロンする。',
    check: (h) => yes(h.houtei && !h.tsumo),
  },
  // --- 2翻 ---
  {
    id: 'doubleRiichi',
    name: 'ダブル立直',
    yomi: 'ダブルリーチ',
    han: 2,
    openHan: 0,
    yakuman: false,
    desc: '誰も鳴いていない1巡目にリーチを宣言する。',
    check: (h) => yes(h.doubleRiichi),
  },
  {
    id: 'chiitoi',
    name: '七対子',
    yomi: 'チートイツ',
    han: 2,
    openHan: 0,
    yakuman: false,
    desc: '対子を7組そろえる。符は25符固定。同じ牌4枚を2組としては使えない。',
    check: (h) => yes(h.shape.form === 'chiitoi'),
  },
  {
    id: 'sanshokuDoujun',
    name: '三色同順',
    yomi: 'サンショクドウジュン',
    han: 2,
    openHan: 1,
    yakuman: false,
    desc: '萬子・筒子・索子で同じ数字の順子をそろえる。鳴くと1翻。',
    check: (h) => {
      const s = new Set(shuntsuKinds(h));
      return yes([0, 1, 2, 3, 4, 5, 6].some((n) => s.has(n) && s.has(n + 9) && s.has(n + 18)));
    },
  },
  {
    id: 'ittsu',
    name: '一気通貫',
    yomi: 'イッキツウカン',
    han: 2,
    openHan: 1,
    yakuman: false,
    desc: '同じ色で123・456・789の順子をそろえる。鳴くと1翻。',
    check: (h) => {
      const s = new Set(shuntsuKinds(h));
      return yes([0, 9, 18].some((b) => s.has(b) && s.has(b + 3) && s.has(b + 6)));
    },
  },
  {
    id: 'chanta',
    name: '混全帯么九',
    yomi: 'チャンタ',
    han: 2,
    openHan: 1,
    yakuman: false,
    desc: 'すべての面子と雀頭に一九牌か字牌を含める（順子を1つ以上、字牌も使う）。鳴くと1翻。',
    check: (h) =>
      yes(
        h.shape.form === 'normal' &&
          blocks(h).every((b) => b.some(isYaochu)) &&
          shuntsuKinds(h).length > 0 &&
          h.kinds.some(isHonor),
      ),
  },
  {
    id: 'toitoi',
    name: '対々和',
    yomi: 'トイトイホー',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '面子4つをすべて刻子（槓子）でそろえる。',
    check: (h) => yes(h.shape.form === 'normal' && h.shape.groups.every(isTriplet)),
  },
  {
    id: 'sanankou',
    name: '三暗刻',
    yomi: 'サンアンコー',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '暗刻（鳴かずにそろえた刻子）を3つ作る。ロンで完成した刻子は暗刻に数えない。',
    check: (h) => yes(concealedTriplets(h) === 3),
  },
  {
    id: 'sanshokuDoukou',
    name: '三色同刻',
    yomi: 'サンショクドウコー',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '萬子・筒子・索子で同じ数字の刻子をそろえる。',
    check: (h) => yes([0, 1, 2, 3, 4, 5, 6, 7, 8].some((n) => countTriplets(h, [n, n + 9, n + 18]) === 3)),
  },
  {
    id: 'sankantsu',
    name: '三槓子',
    yomi: 'サンカンツ',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '槓子を3つ作る。',
    check: (h) => yes(kantsuCount(h) === 3),
  },
  {
    id: 'shousangen',
    name: '小三元',
    yomi: 'ショウサンゲン',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '白・發・中のうち2つを刻子、残り1つを雀頭にする。役牌2つ分と合わせて実質4翻。',
    check: (h) => yes(countTriplets(h, DRAGONS) === 2 && DRAGONS.includes(h.shape.head)),
  },
  {
    id: 'honroutou',
    name: '混老頭',
    yomi: 'ホンロウトウ',
    han: 2,
    openHan: 2,
    yakuman: false,
    desc: '一九牌と字牌だけで手を作る。',
    check: (h) => yes(h.kinds.every(isYaochu)),
  },
  // --- 3翻 ---
  {
    id: 'honitsu',
    name: '混一色',
    yomi: 'ホンイツ',
    han: 3,
    openHan: 2,
    yakuman: false,
    desc: '1色の数牌と字牌だけで手を作る。鳴くと2翻。',
    check: (h) => yes(suitCount(h) === 1 && h.kinds.some(isHonor)),
  },
  {
    id: 'junchan',
    name: '純全帯么九',
    yomi: 'ジュンチャン',
    han: 3,
    openHan: 2,
    yakuman: false,
    desc: 'すべての面子と雀頭に一九牌を含める（字牌なし、順子を1つ以上）。鳴くと2翻。',
    check: (h) =>
      yes(
        h.shape.form === 'normal' && blocks(h).every((b) => b.some(isTerminal)) && shuntsuKinds(h).length > 0,
      ),
  },
  {
    id: 'ryanpeikou',
    name: '二盃口',
    yomi: 'リャンペーコー',
    han: 3,
    openHan: 0,
    yakuman: false,
    desc: '一盃口を2組作る。門前限定。七対子とは複合しない。',
    check: (h) => yes(h.menzen && peikouCount(h) === 2),
  },
  // --- 6翻 ---
  {
    id: 'chinitsu',
    name: '清一色',
    yomi: 'チンイツ',
    han: 6,
    openHan: 5,
    yakuman: false,
    desc: '1色の数牌だけで手を作る。鳴くと5翻。',
    check: (h) => yes(suitCount(h) === 1 && !h.kinds.some(isHonor)),
  },
  // --- 役満 ---
  {
    id: 'kokushi',
    name: '国士無双',
    yomi: 'コクシムソウ',
    han: 13,
    openHan: 0,
    yakuman: true,
    doubleName: '国士無双十三面待ち',
    desc: '一九牌と字牌の13種類をすべて1枚ずつそろえ、そのうち1種類を2枚にする。',
    check: (h) => (h.shape.form !== 'kokushi' ? 0 : h.shape.wait === 'kokushi13' ? 2 : 1),
  },
  {
    id: 'suuankou',
    name: '四暗刻',
    yomi: 'スーアンコー',
    han: 13,
    openHan: 0,
    yakuman: true,
    doubleName: '四暗刻単騎',
    desc: '暗刻を4つ作る。シャンポン待ちはツモ和了のときだけ成立する。',
    check: (h) => (concealedTriplets(h) !== 4 ? 0 : h.shape.wait === 'tanki' ? 2 : 1),
  },
  {
    id: 'daisangen',
    name: '大三元',
    yomi: 'ダイサンゲン',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '白・發・中をすべて刻子でそろえる。',
    check: (h) => yes(countTriplets(h, DRAGONS) === 3),
  },
  {
    id: 'shousuushii',
    name: '小四喜',
    yomi: 'ショウスーシー',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '東南西北のうち3つを刻子、残り1つを雀頭にする。',
    check: (h) => yes(countTriplets(h, WINDS) === 3 && WINDS.includes(h.shape.head)),
  },
  {
    id: 'daisuushii',
    name: '大四喜',
    yomi: 'ダイスーシー',
    han: 13,
    openHan: 13,
    yakuman: true,
    doubleName: '大四喜',
    desc: '東南西北をすべて刻子でそろえる。',
    check: (h) => (countTriplets(h, WINDS) === 4 ? 2 : 0),
  },
  {
    id: 'tsuuiisou',
    name: '字一色',
    yomi: 'ツーイーソー',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '字牌だけで手を作る。',
    check: (h) => yes(h.kinds.every(isHonor)),
  },
  {
    id: 'chinroutou',
    name: '清老頭',
    yomi: 'チンロウトウ',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '一九牌だけで手を作る。',
    check: (h) => yes(h.kinds.every(isTerminal)),
  },
  {
    id: 'ryuuiisou',
    name: '緑一色',
    yomi: 'リューイーソー',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '索子の2・3・4・6・8と發だけで手を作る。',
    check: (h) => yes(h.kinds.every((k) => GREEN.has(k))),
  },
  {
    id: 'chuuren',
    name: '九蓮宝燈',
    yomi: 'チューレンポートー',
    han: 13,
    openHan: 0,
    yakuman: true,
    doubleName: '純正九蓮宝燈',
    desc: '門前で、1色の 1112345678999 に同じ色の牌を1枚加えた形。',
    check: chuuren,
  },
  {
    id: 'suukantsu',
    name: '四槓子',
    yomi: 'スーカンツ',
    han: 13,
    openHan: 13,
    yakuman: true,
    desc: '槓子を4つ作る。',
    check: (h) => yes(kantsuCount(h) === 4),
  },
  {
    id: 'tenhou',
    name: '天和',
    yomi: 'テンホー',
    han: 13,
    openHan: 0,
    yakuman: true,
    desc: '親が配牌の時点で和了している。',
    check: (h) => yes(h.tenhou),
  },
  {
    id: 'chiihou',
    name: '地和',
    yomi: 'チーホー',
    han: 13,
    openHan: 0,
    yakuman: true,
    desc: '子が、誰も鳴いていない最初のツモで和了する。',
    check: (h) => yes(h.chiihou),
  },
]);

/**
 * 手牌の形によらない特殊な役（役一覧ページで YAKU と一緒に表示する）。
 * @type {readonly { id: string, name: string, yomi: string, value: string, desc: string }[]}
 */
export const SPECIAL_YAKU = Object.freeze([
  {
    id: 'nagashiMangan',
    name: '流し満貫',
    yomi: 'ナガシマンガン',
    value: '満貫',
    desc: '流局したとき、自分の捨て牌がすべて一九牌・字牌で、一度も鳴かれていない。',
  },
]);

/**
 * 成立している役を返す。役満が1つでもあれば役満だけを返す。
 * @param {YakuInput} input
 * @returns {YakuResult[]}
 */
export function judgeYaku(input) {
  const rules = input.rules ?? DEFAULT_RULES;
  /** @type {YakuResult[]} */
  const yakuman = [];
  for (const def of YAKU) {
    if (!def.yakuman) continue;
    if (!input.menzen && def.openHan === 0) continue;
    const times = def.check(input);
    if (times === 0) continue;
    const double = times >= 2 && rules.doubleYakuman;
    yakuman.push({
      id: def.id,
      name: double && def.doubleName ? def.doubleName : def.name,
      han: 0,
      yakuman: double ? 2 : 1,
    });
  }
  if (yakuman.length > 0) return yakuman;
  if (input.shape.form === 'kokushi') return [];

  /** @type {YakuResult[]} */
  const result = [];
  for (const def of YAKU) {
    if (def.yakuman) continue;
    const han = input.menzen ? def.han : def.openHan;
    if (han === 0 || def.check(input) === 0) continue;
    result.push({ id: def.id, name: def.name, han, yakuman: 0 });
  }
  return result;
}
