// 符・翻・点数の計算と、点棒の支払い配分。

import { enumerateShapes } from './agari.js';
import { DEFAULT_RULES } from './rules.js';
import { doraKindOf, isRed, isYaochu, kindName, kindOf, toCounts } from './tiles.js';
import { judgeYaku } from './yaku.js';

/** @typedef {import('./agari.js').Meld} Meld */
/** @typedef {import('./agari.js').HandShape} HandShape */
/** @typedef {import('./rules.js').Rules} Rules */
/** @typedef {import('./yaku.js').YakuInput} YakuInput */
/** @typedef {import('./yaku.js').YakuResult} YakuResult */

/**
 * 和了したときの状況。
 * @typedef {object} WinContext
 * @property {boolean} tsumo ツモ和了か
 * @property {number} seatWind 自風 (0=東, 1=南, 2=西, 3=北)
 * @property {number} roundWind 場風 (0=東, 1=南)
 * @property {boolean} [riichi]
 * @property {boolean} [doubleRiichi]
 * @property {boolean} [ippatsu]
 * @property {boolean} [rinshan]
 * @property {boolean} [chankan]
 * @property {boolean} [haitei]
 * @property {boolean} [houtei]
 * @property {boolean} [tenhou]
 * @property {boolean} [chiihou]
 * @property {readonly number[]} [doraIndicators] 表のドラ表示牌（牌ID）
 * @property {readonly number[]} [uraIndicators] 裏ドラ表示牌（牌ID）。リーチ時のみ数える
 * @property {Readonly<Rules>} [rules]
 */

/** @typedef {{ label: string, fu: number }} FuDetail */

/**
 * @typedef {object} HandResult
 * @property {boolean} valid 役があって和了できるか（false なら役なし）
 * @property {HandShape} shape 採用した手牌の解釈
 * @property {YakuResult[]} yaku 成立した役
 * @property {{ dora: number, ura: number, red: number }} dora ドラの枚数
 * @property {number} han 合計翻数（ドラ込み。役満は 0）
 * @property {number} fu 符（10符単位に切り上げ済み。役満は 0）
 * @property {FuDetail[]} fuDetails 符の内訳
 * @property {number} yakuman 役満の倍数（役満でなければ 0）
 * @property {number} base 基本点（子のロンはこの4倍、親のロンは6倍）
 * @property {string} limitName 「満貫」「跳満」など（なければ空文字）
 */

const WAIT_LABEL = { kanchan: 'カンチャン待ち', penchan: 'ペンチャン待ち', tanki: '単騎待ち' };

/** @param {number} n */
const ceil100 = (n) => Math.ceil(n / 100) * 100;

/**
 * 符を計算する。
 * @param {YakuInput} h
 * @param {boolean} pinfu 平和が成立しているか
 * @returns {{ fu: number, details: FuDetail[] }}
 */
export function calcFu(h, pinfu) {
  const { shape } = h;
  if (shape.form === 'chiitoi') return { fu: 25, details: [{ label: '七対子', fu: 25 }] };
  if (shape.form === 'kokushi') return { fu: 0, details: [] };

  /** @type {FuDetail[]} */
  const details = [{ label: '副底', fu: 20 }];
  if (pinfu) {
    // 平和はツモなら20符固定、ロンなら30符
    if (!h.tsumo) details.push({ label: '門前ロン', fu: 10 });
    return { fu: h.tsumo ? 20 : 30, details };
  }
  if (h.menzen && !h.tsumo) details.push({ label: '門前ロン', fu: 10 });
  for (const g of shape.groups) {
    if (g.type === 'shuntsu') continue;
    let fu = g.open ? 2 : 4;
    if (isYaochu(g.kind)) fu *= 2;
    if (g.type === 'kantsu') fu *= 4;
    const kindLabel = `${g.open ? '明' : '暗'}${g.type === 'kantsu' ? '槓' : '刻'}`;
    details.push({ label: `${kindName(g.kind)}の${kindLabel}`, fu });
  }
  let headFu = 0;
  if (shape.head >= 31) headFu = 2;
  if (shape.head === h.seatWind) headFu += 2;
  if (shape.head === h.roundWind) headFu += 2;
  if (headFu > 0) details.push({ label: `雀頭（${kindName(shape.head)}）`, fu: headFu });
  if (shape.wait === 'kanchan' || shape.wait === 'penchan' || shape.wait === 'tanki') {
    details.push({ label: WAIT_LABEL[shape.wait], fu: 2 });
  }
  if (h.tsumo) details.push({ label: 'ツモ', fu: 2 });

  let raw = details.reduce((sum, d) => sum + d.fu, 0);
  if (raw === 20) {
    // 鳴いた平和形のロンは30符として扱う
    details.push({ label: '喰い平和形', fu: 10 });
    raw = 30;
  }
  return { fu: Math.ceil(raw / 10) * 10, details };
}

/**
 * 翻と符から基本点と呼び名を求める。
 * @param {number} han
 * @param {number} fu
 * @param {Readonly<Rules>} [rules]
 * @returns {{ base: number, name: string }}
 */
export function limitOf(han, fu, rules = DEFAULT_RULES) {
  if (han >= 13) {
    return rules.kazoeYakuman ? { base: 8000, name: '数え役満' } : { base: 6000, name: '三倍満' };
  }
  if (han >= 11) return { base: 6000, name: '三倍満' };
  if (han >= 8) return { base: 4000, name: '倍満' };
  if (han >= 6) return { base: 3000, name: '跳満' };
  if (han >= 5) return { base: 2000, name: '満貫' };
  const base = fu * 2 ** (han + 2);
  if (base >= 2000 || (rules.kiriageMangan && base === 1920)) return { base: 2000, name: '満貫' };
  return { base, name: '' };
}

/**
 * @param {number} multiplier 役満の倍数
 * @returns {string}
 */
function yakumanName(multiplier) {
  if (multiplier === 1) return '役満';
  if (multiplier === 2) return 'ダブル役満';
  if (multiplier === 3) return 'トリプル役満';
  return `${multiplier}倍役満`;
}

/**
 * 和了した手牌を評価し、最高点になる解釈を返す。和了形でなければ null。
 * 役がない場合は valid が false の結果を返す。
 * @param {readonly number[]} concealed 手の内の牌ID（和了牌を含まない。13-3×副露 枚）
 * @param {readonly Meld[]} melds 副露（暗槓含む）
 * @param {number} winTile 和了牌の牌ID
 * @param {WinContext} ctx
 * @returns {HandResult | null}
 */
export function evaluateHand(concealed, melds, winTile, ctx) {
  const rules = ctx.rules ?? DEFAULT_RULES;
  const counts = toCounts([...concealed, winTile]);
  const winKind = kindOf(winTile);
  const shapes = enumerateShapes(counts, melds, winKind, ctx.tsumo);
  if (shapes.length === 0) return null;

  const allTiles = [...concealed, winTile, ...melds.flatMap((m) => m.tiles)];
  const allCounts = toCounts(allTiles);
  const kinds = allCounts.flatMap((n, k) => (n > 0 ? [k] : []));
  const riichi = Boolean(ctx.riichi || ctx.doubleRiichi);

  /** @param {readonly number[] | undefined} indicators */
  const countDora = (indicators) =>
    (indicators ?? []).reduce((sum, id) => sum + allCounts[doraKindOf(kindOf(id))], 0);
  const dora = {
    dora: countDora(ctx.doraIndicators),
    ura: riichi ? countDora(ctx.uraIndicators) : 0,
    red: rules.redDora ? allTiles.filter(isRed).length : 0,
  };

  /** @type {HandResult | null} */
  let best = null;
  for (const shape of shapes) {
    /** @type {YakuInput} */
    const input = {
      shape,
      kinds,
      counts,
      meldCount: melds.length,
      menzen: melds.every((m) => m.type === 'ankan'),
      tsumo: ctx.tsumo,
      winKind,
      seatWind: 27 + ctx.seatWind,
      roundWind: 27 + ctx.roundWind,
      riichi: Boolean(ctx.riichi),
      doubleRiichi: Boolean(ctx.doubleRiichi),
      ippatsu: Boolean(ctx.ippatsu),
      rinshan: Boolean(ctx.rinshan),
      chankan: Boolean(ctx.chankan),
      haitei: Boolean(ctx.haitei),
      houtei: Boolean(ctx.houtei),
      tenhou: Boolean(ctx.tenhou),
      chiihou: Boolean(ctx.chiihou),
      rules,
    };
    const yaku = judgeYaku(input);
    const yakuman = yaku.reduce((sum, y) => sum + y.yakuman, 0);
    /** @type {HandResult} */
    let result;
    if (yakuman > 0) {
      result = {
        valid: true,
        shape,
        yaku,
        dora: { dora: 0, ura: 0, red: 0 },
        han: 0,
        fu: 0,
        fuDetails: [],
        yakuman,
        base: 8000 * yakuman,
        limitName: yakumanName(yakuman),
      };
    } else {
      const yakuHan = yaku.reduce((sum, y) => sum + y.han, 0);
      const { fu, details } = calcFu(
        input,
        yaku.some((y) => y.id === 'pinfu'),
      );
      const valid = yakuHan > 0;
      // ドラは役ではないので、役がなければ数えない
      const han = valid ? yakuHan + dora.dora + dora.ura + dora.red : 0;
      const limit = valid ? limitOf(han, fu, rules) : { base: 0, name: '' };
      result = {
        valid,
        shape,
        yaku,
        dora: valid ? dora : { dora: 0, ura: 0, red: 0 },
        han,
        fu,
        fuDetails: details,
        yakuman: 0,
        base: limit.base,
        limitName: limit.name,
      };
    }
    if (
      best === null ||
      result.base > best.base ||
      (result.base === best.base &&
        (result.han > best.han || (result.han === best.han && result.fu > best.fu)))
    ) {
      best = result;
    }
  }
  return best;
}

/**
 * @typedef {object} Points
 * @property {number} total 和了者が受け取る点数（本場・供託を除く）
 * @property {number} ron ロンのとき放銃者が払う点数（ツモなら 0）
 * @property {number} fromDealer ツモのとき親が払う点数（親の和了なら 0）
 * @property {number} fromOthers ツモのとき子1人が払う点数
 */

/**
 * 基本点から、本場・供託を除いた点数を求める。
 * @param {number} base
 * @param {boolean} dealer 和了者が親か
 * @param {boolean} tsumo
 * @returns {Points}
 */
export function calcPoints(base, dealer, tsumo) {
  if (!tsumo) {
    const ron = ceil100(base * (dealer ? 6 : 4));
    return { total: ron, ron, fromDealer: 0, fromOthers: 0 };
  }
  if (dealer) {
    const each = ceil100(base * 2);
    return { total: each * 3, ron: 0, fromDealer: 0, fromOthers: each };
  }
  const fromDealer = ceil100(base * 2);
  const fromOthers = ceil100(base);
  return { total: fromDealer + fromOthers * 2, ron: 0, fromDealer, fromOthers };
}

/**
 * @param {Points} points
 * @param {boolean} dealer
 * @param {boolean} tsumo
 * @returns {string} 「3900点」「1300-2600点」「4000点オール」
 */
export function pointsLabel(points, dealer, tsumo) {
  if (!tsumo) return `${points.ron}点`;
  if (dealer) return `${points.fromOthers}点オール`;
  return `${points.fromOthers}-${points.fromDealer}点`;
}

/**
 * @typedef {object} PaymentInput
 * @property {number} base 基本点
 * @property {number} winner 和了者の席 (0-3)
 * @property {number} dealer 親の席 (0-3)
 * @property {boolean} tsumo
 * @property {number} [loser] 放銃者の席（ロンのとき必須）
 * @property {number} [honba] 本場数
 * @property {number} [kyotaku] 供託のリーチ棒の本数（この和了者が取る分）
 * @property {Readonly<Rules>} [rules]
 */

/**
 * 1人の和了による点棒の移動（席ごとの増減）を求める。
 * ダブロンのときは和了者ごとに呼び、本場と供託は受け取る人の分だけ渡す。
 * @param {PaymentInput} input
 * @returns {number[]} 席ごとの増減（合計は 供託本数×1000）
 */
export function calcPayments(input) {
  const { base, winner, dealer, tsumo } = input;
  const rules = input.rules ?? DEFAULT_RULES;
  const honba = input.honba ?? 0;
  const deltas = [0, 0, 0, 0];
  const points = calcPoints(base, winner === dealer, tsumo);
  if (tsumo) {
    for (let seat = 0; seat < 4; seat++) {
      if (seat === winner) continue;
      const pay = (seat === dealer ? points.fromDealer : points.fromOthers) + (honba * rules.honbaValue) / 3;
      deltas[seat] -= pay;
      deltas[winner] += pay;
    }
  } else {
    if (input.loser === undefined || input.loser === winner) {
      throw new RangeError('ロンのときは放銃者の席を指定してください');
    }
    const pay = points.ron + honba * rules.honbaValue;
    deltas[input.loser] -= pay;
    deltas[winner] += pay;
  }
  deltas[winner] += (input.kyotaku ?? 0) * 1000;
  return deltas;
}
