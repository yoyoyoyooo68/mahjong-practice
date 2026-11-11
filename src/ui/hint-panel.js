// ヒント: 牌効率ベースの推奨打牌、牌ごとの受け入れ枚数、待ち牌と想定点、鳴きの警告。
// 計算部分は DOM に依存しない（Node でテストできる）。自分に見えている情報だけを使う。

import { evaluateDiscards, shantenLabel } from '../core/efficiency.js';
import { calcPoints } from '../core/score.js';
import { shanten } from '../core/shanten.js';
import { doraKindOf, kindName, kindOf, toCounts } from '../core/tiles.js';
import { hasYakuPath, visibleCounts } from '../cpu/base.js';
import { estimateRon, isFuriten, viewFor, waitKinds } from '../game/round.js';
import { kindSvg } from './tile-svg.js';
import { termHtml } from './yaku-explainer.js';

/** @typedef {import('../game/state.js').GameState} GameState */

/**
 * @typedef {object} HintModel
 * @property {number | null} best 推奨の打牌（牌ID）。和了形なら null
 * @property {string} reason 理由
 * @property {Record<number, number>} badges 牌ID → その牌を切ったときの受け入れ枚数（シャンテン数が戻る牌は載せない）
 * @property {number} shanten 現在のシャンテン数
 */

/**
 * 自分の手番のヒントを作る。手番でなければ null。
 * @param {GameState} state
 * @param {number} seat
 * @returns {HintModel | null}
 */
export function hintModel(state, seat) {
  if (state.phase !== 'turn' || state.turn !== seat) return null;
  const view = viewFor(state, seat);
  const meldCount = view.players[seat].melds.length;
  const current = shanten(toCounts(view.hand), meldCount);
  if (current < 0) {
    return { best: null, reason: '和了形です。ツモを宣言できます。', badges: {}, shanten: current };
  }
  const legal = view.options
    .filter((o) => o.type === 'discard' && !o.riichi)
    .map((o) => /** @type {number} */ (o.tile));
  // 食い替えで切れない牌は候補から外す
  const options = evaluateDiscards(view.hand, {
    melds: meldCount,
    visible: visibleCounts(view),
    doraKinds: view.doraIndicators.map((id) => doraKindOf(kindOf(id))),
    yakuhaiKinds: [27 + view.seatWind, 27 + view.roundWind, 31, 32, 33],
    redDora: view.rules.redDora,
  }).filter((o) => legal.some((t) => kindOf(t) === o.kind));
  const best = options[0];
  if (!best) return null;

  /** @type {Record<number, number>} */
  const badges = {};
  for (const tile of legal) {
    const option = options.find((o) => o.kind === kindOf(tile));
    if (option && option.shanten === best.shanten) badges[tile] = option.ukeire.total;
  }
  const bestTile = legal.includes(best.tile)
    ? best.tile
    : /** @type {number} */ (legal.find((t) => kindOf(t) === best.kind));

  const { tiles, total } = best.ukeire;
  const names = tiles.slice(0, 5).map((t) => kindName(t.kind));
  const list = `${names.join('・')}${tiles.length > 5 ? ' など' : ''}`;
  let reason =
    best.shanten === 0
      ? total > 0
        ? `${kindName(best.kind)}を切るとテンパイ。待ちは ${tiles.map((t) => `${kindName(t.kind)}（残り${t.count}枚）`).join('、')}。`
        : `${kindName(best.kind)}を切るとテンパイですが、待ち牌が残っていません。`
      : `${kindName(best.kind)}を切ると${shantenLabel(best.shanten)}。受け入れは${tiles.length}種${total}枚（${list}）。`;
  const ties = options.filter((o) => o.shanten === best.shanten && o.ukeire.total === total).length;
  reason +=
    ties > 1
      ? '同じ広さなら、赤・ドラを残して字牌・端牌から切ります。'
      : 'いちばん受け入れが広い切り方です。';
  return { best: bestTile, reason, badges, shanten: current };
}

/**
 * @typedef {object} TenpaiInfo
 * @property {{ kind: number, left: number, points: string }[]} waits 待ち牌・見えていない残り枚数・ロンしたときの想定点
 * @property {boolean} furiten
 */

/**
 * テンパイしていれば、待ち牌と想定点を返す（自分の手番中は対象外）。
 * @param {GameState} state
 * @param {number} seat
 * @returns {TenpaiInfo | null}
 */
export function tenpaiInfo(state, seat) {
  const p = state.players[seat];
  if (state.phase === 'gameEnd' || p.drawn !== null || (state.phase === 'turn' && state.turn === seat))
    return null;
  const waits = waitKinds(p.hand, p.melds.length);
  if (waits.length === 0) return null;
  const visible = visibleCounts(viewFor(state, seat));
  const own = toCounts(p.hand);
  return {
    waits: waits.map((kind) => {
      const est = estimateRon(state, seat, kind);
      const points = est?.valid
        ? `ロン${calcPoints(est.base, seat === state.dealer, false).ron}点`
        : '役なし';
      return { kind, left: Math.max(0, 4 - visible[kind] - own[kind]), points };
    }),
    furiten: isFuriten(state, seat),
  };
}

const ANY_YAKU = { callYakuhai: true, callTanyao: true, callSpeculative: true };

/**
 * 鳴くと役がなくなりそうなときの警告文。問題なければ null。
 * @param {GameState} state
 * @param {number} seat
 * @returns {string | null}
 */
export function callWarning(state, seat) {
  if (state.phase !== 'response') return null;
  const view = viewFor(state, seat);
  const calls = view.options.filter((o) => o.type === 'pon' || o.type === 'chi' || o.type === 'minkan');
  if (calls.length === 0) return null;
  const called = kindOf(/** @type {NonNullable<typeof view.pending>} */ (view.pending).tile);
  const safe = calls.some((o) => {
    const own = o.tiles ?? view.hand.filter((t) => kindOf(t) === called);
    return hasYakuPath(
      view,
      o,
      view.hand.filter((t) => !own.includes(t)),
      ANY_YAKU,
    );
  });
  return safe ? null : '鳴くと役がなくなるかもしれません（役牌もタンヤオも見えていません）。';
}

/**
 * @param {TenpaiInfo} info
 * @returns {string}
 */
export function tenpaiHtml(info) {
  const waits = info.waits
    .map(
      (w) =>
        `<span class="wait">${kindSvg(w.kind, false, { width: 18 })}<span>${kindName(w.kind)} 残り${w.left}枚<br>${w.points}</span></span>`,
    )
    .join('');
  const furiten = info.furiten ? `<strong class="warn">${termHtml('furiten')}</strong>` : '';
  return `<div class="tenpai"><span>${termHtml('tenpai')} 待ち</span>${furiten}${waits}</div>`;
}
