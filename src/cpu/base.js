// CPUの共通基盤。decide(view, personality) → action。
// 受け取るのは PlayerView（その席から見えている情報）だけで、他家の手牌や山は見ない。
// 牌効率はヒントと同じ efficiency.js を使い、守備は現物・スジ・字牌の安全度で判断する。

import { evaluateDiscards } from '../core/efficiency.js';
import { shanten } from '../core/shanten.js';
import { doraKindOf, isHonor, isYaochu, kindOf, toCounts } from '../core/tiles.js';
import { BALANCE } from './personalities/index.js';

/** @typedef {import('../game/round.js').PlayerView} PlayerView */
/** @typedef {import('../game/state.js').Action} Action */
/** @typedef {import('./personalities/index.js').Personality} Personality */

/**
 * 自分の手牌以外で見えている牌の枚数（河・副露・ドラ表示牌）。
 * @param {PlayerView} view
 * @returns {number[]}
 */
export function visibleCounts(view) {
  const tiles = [...view.doraIndicators];
  for (const p of view.players) {
    for (const d of p.discards) if (!d.called) tiles.push(d.tile);
    for (const m of p.melds) tiles.push(...m.tiles);
  }
  return toCounts(tiles);
}

/**
 * その牌種を切る危険度（小さいほど安全）。リーチ者ごとの値を合計する。
 * @param {number} kind
 * @param {PlayerView} view
 * @param {number[]} threats リーチしている他家の席
 * @param {readonly number[]} visible
 * @returns {number}
 */
export function dangerOf(kind, view, threats, visible) {
  let total = 0;
  for (const seat of threats) {
    const safe = new Set(view.players[seat].discards.map((d) => kindOf(d.tile)));
    if (safe.has(kind)) continue; // 現物
    if (isHonor(kind)) {
      // 字牌は見えている枚数が多いほど安全
      total += visible[kind] >= 3 ? 1 : visible[kind] === 2 ? 2 : 4;
      continue;
    }
    const n = kind % 9;
    const low = n >= 3 && safe.has(kind - 3);
    const high = n <= 5 && safe.has(kind + 3);
    // スジ: 1・9 は片側、4・5・6 は両側が通っていれば安全寄り
    const suji = n <= 2 ? high : n >= 6 ? low : low && high;
    const edge = Math.min(n, 8 - n); // 0=端牌 … 4=真ん中
    total += suji ? 2 + Math.min(edge, 2) : 6 + Math.min(edge, 4);
  }
  return total;
}

/**
 * @param {PlayerView} view
 * @param {number} kind
 * @returns {boolean} 役牌（三元牌・自風・場風）か
 */
function isYakuhai(view, kind) {
  return kind >= 31 || kind === 27 + view.seatWind || kind === 27 + view.roundWind;
}

/**
 * 鳴いたあとに役が付く見込みがあるか。
 * @param {PlayerView} view
 * @param {Action} option ポン・チー・大明槓
 * @param {number[]} rest 鳴いたあとの手の内
 * @param {Pick<Personality, 'callYakuhai' | 'callTanyao' | 'callSpeculative'>} who
 */
export function hasYakuPath(view, option, rest, who) {
  const called = kindOf(/** @type {NonNullable<PlayerView['pending']>} */ (view.pending).tile);
  const melds = view.players[view.seat].melds;
  const counts = toCounts(rest);
  if (who.callYakuhai) {
    if (option.type !== 'chi' && isYakuhai(view, called)) return true;
    if (melds.some((m) => m.type !== 'chi' && isYakuhai(view, kindOf(m.tiles[0])))) return true;
    if (counts.some((n, k) => n >= 3 && isYakuhai(view, k))) return true;
    if (who.callSpeculative && counts.some((n, k) => n === 2 && isYakuhai(view, k))) return true;
  }
  if (who.callTanyao && view.rules.kuitan) {
    const meldKinds = melds.flatMap((m) => m.tiles.map(kindOf));
    const own = (option.tiles ?? []).map(kindOf);
    const yaochuInHand = rest.filter((t) => isYaochu(kindOf(t))).length;
    if (![called, ...own, ...meldKinds].some(isYaochu) && yaochuInHand <= 1) return true;
  }
  return false;
}

/**
 * 他家の打牌・カンへの応答を決める。
 * @param {PlayerView} view
 * @param {Personality} who
 * @param {number[]} threats
 * @returns {Action}
 */
function decideResponse(view, who, threats) {
  const options = view.options;
  const ron = options.find((o) => o.type === 'ron');
  if (ron) return ron;
  const pass = /** @type {Action} */ (options.find((o) => o.type === 'pass'));

  const meldCount = view.players[view.seat].melds.length;
  const current = shanten(toCounts(view.hand), meldCount);
  if (threats.length > 0 && current >= who.foldShanten) return pass;

  const visible = visibleCounts(view);
  /** @type {{ option: Action, shanten: number } | null} */
  let best = null;
  for (const option of options) {
    if (option.type !== 'pon' && option.type !== 'chi') continue;
    const own = /** @type {number[]} */ (option.tiles);
    const rest = view.hand.filter((t) => !own.includes(t));
    const after = evaluateDiscards(rest, { melds: meldCount + 1, visible })[0];
    if (!after || after.shanten >= current || after.shanten > who.callMaxShanten) continue;
    if (!hasYakuPath(view, option, rest, who)) continue;
    // 同じ進み具合ならポンを優先（チーより手役が残りやすい）
    if (
      best === null ||
      after.shanten < best.shanten ||
      (after.shanten === best.shanten && option.type === 'pon')
    ) {
      best = { option, shanten: after.shanten };
    }
  }
  return best ? best.option : pass;
}

/**
 * 自分の手番の行動を決める。
 * @param {PlayerView} view
 * @param {Personality} who
 * @param {number[]} threats
 * @returns {Action}
 */
function decideTurn(view, who, threats) {
  const options = view.options;
  const tsumo = options.find((o) => o.type === 'tsumo');
  if (tsumo) return tsumo;

  const meldCount = view.players[view.seat].melds.length;
  const counts = toCounts(view.hand);
  const current = shanten(counts, meldCount);

  const kyuushu = options.find((o) => o.type === 'kyuushu');
  if (kyuushu && current >= 3) return kyuushu;

  const discards = options.filter((o) => o.type === 'discard' && !o.riichi);
  const fold = threats.length > 0 && current >= who.foldShanten;

  if (who.kan && !fold) {
    for (const o of options) {
      if (o.type === 'ankan') {
        const k = /** @type {number} */ (o.kind);
        const rest = view.hand.filter((t) => kindOf(t) !== k);
        if (shanten(toCounts(rest), meldCount + 1) <= current) return o;
      } else if (o.type === 'kakan' && threats.length === 0) {
        const rest = view.hand.filter((t) => t !== o.tile);
        if (shanten(toCounts(rest), meldCount) <= current) return o;
      }
    }
  }
  if (discards.length === 1) return discards[0];

  const visible = visibleCounts(view);
  const doraKinds = view.doraIndicators.map((id) => doraKindOf(kindOf(id)));
  const yakuhaiKinds = [27 + view.seatWind, 27 + view.roundWind, 31, 32, 33];
  const ranked = evaluateDiscards(view.hand, {
    melds: meldCount,
    visible,
    doraKinds,
    yakuhaiKinds,
    redDora: view.rules.redDora,
  });
  /** @param {number} kind 牌効率の順位（小さいほど良い） */
  const rankOf = (kind) => {
    const i = ranked.findIndex((r) => r.kind === kind);
    return i === -1 ? ranked.length : i;
  };
  /** @param {number} kind その牌種の合法な打牌（評価で選ばれた牌IDを優先） */
  const legalOf = (kind) => {
    const preferred = ranked.find((r) => r.kind === kind)?.tile;
    return (
      discards.find((o) => o.tile === preferred) ??
      discards.find((o) => kindOf(/** @type {number} */ (o.tile)) === kind)
    );
  };

  if (fold) {
    // ベタオリ: いちばん安全な牌。同じ安全度なら牌効率の良い方
    let best = discards[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const o of discards) {
      const kind = kindOf(/** @type {number} */ (o.tile));
      const score = dangerOf(kind, view, threats, visible) * 100 + rankOf(kind);
      if (score < bestScore) {
        best = o;
        bestScore = score;
      }
    }
    return best;
  }

  for (const r of ranked) {
    const discard = legalOf(r.kind);
    if (!discard) continue; // 食い替えで切れない牌
    if (r.shanten === 0 && r.ukeire.total >= who.riichiMinWaits) {
      const riichi = options.find((o) => o.type === 'discard' && o.riichi && o.tile === discard.tile);
      if (riichi) return riichi;
    }
    return discard;
  }
  return discards[0];
}

/**
 * CPUの行動を決める。同じ入力には必ず同じ行動を返す（乱数を使わない）。
 * @param {PlayerView} view
 * @param {Personality} [who]
 * @returns {Action}
 */
export function decide(view, who = BALANCE) {
  if (view.options.length === 0) throw new Error('行動できる場面ではありません');
  const threats = [0, 1, 2, 3].filter((seat) => seat !== view.seat && view.players[seat].riichi);
  return view.phase === 'response' ? decideResponse(view, who, threats) : decideTurn(view, who, threats);
}

/**
 * runner.js に渡す打ち手を作る。
 * @param {Personality} who
 * @returns {(view: PlayerView) => Action}
 */
export function createCpu(who) {
  return (view) => decide(view, who);
}
