// ヒント: 牌効率ベースの推奨打牌、牌ごとの受け入れ枚数、待ち牌と想定点、鳴きの警告。
// 計算部分は DOM に依存しない（Node でテストできる）。自分に見えている情報だけを使う。

import { evaluateDiscards, shantenLabel } from '../core/efficiency.js';
import { calcPoints } from '../core/score.js';
import { shanten } from '../core/shanten.js';
import { doraKindOf, isYaochu, kindName, kindOf, toCounts } from '../core/tiles.js';
import { hasYakuPath, visibleCounts } from '../cpu/base.js';
import { estimateRon, isFuriten, viewFor, waitKinds } from '../game/round.js';
import { kindSvg } from './tile-svg.js';
import { kindToken, tileReading } from './tile-text.js';
import { termHtml } from './yaku-explainer.js';

/** @typedef {import('../game/state.js').GameState} GameState */

/**
 * @typedef {object} HintModel
 * @property {number | null} best 推奨の打牌（牌ID）。和了形なら null
 * @property {string} reason 理由。牌は「中{7z}」のように {…} 表記が付くので、richText で絵にして表示する
 * @property {Record<number, number>} badges 牌ID → その牌を切ったときの受け入れ枚数（シャンテン数が戻る牌は載せない）
 * @property {number} shanten 現在のシャンテン数
 */

/**
 * 手の中で、同じ牌も近い数字（2つ以内）もない牌か。
 * @param {number[]} counts
 * @param {number} kind
 */
function isLonely(counts, kind) {
  if (counts[kind] > 1) return false;
  if (kind >= 27) return true;
  const base = kind - (kind % 9);
  for (let k = Math.max(base, kind - 2); k <= Math.min(base + 8, kind + 2); k++) {
    if (k !== kind && counts[k] > 0) return false;
  }
  return true;
}

/**
 * 自分の手番のヒントを作る。手番でなければ null。
 * @param {GameState} state
 * @param {number} seat
 * @param {{ plain?: boolean }} [options] plain: 初心者モード向けに、専門用語を使わない文にする
 * @returns {HintModel | null}
 */
export function hintModel(state, seat, options = {}) {
  if (state.phase !== 'turn' || state.turn !== seat) return null;
  const view = viewFor(state, seat);
  const meldCount = view.players[seat].melds.length;
  const current = shanten(toCounts(view.hand), meldCount);
  if (current < 0) {
    const reason = options.plain
      ? '上がりの形がそろいました！「ツモ」を押しましょう。'
      : '和了形です。ツモを宣言できます。';
    return { best: null, reason, badges: {}, shanten: current };
  }
  const legal = view.options
    .filter((o) => o.type === 'discard' && !o.riichi)
    .map((o) => /** @type {number} */ (o.tile));
  // 食い替えで切れない牌は候補から外す
  const ranked = evaluateDiscards(view.hand, {
    melds: meldCount,
    visible: visibleCounts(view),
    doraKinds: view.doraIndicators.map((id) => doraKindOf(kindOf(id))),
    yakuhaiKinds: [27 + view.seatWind, 27 + view.roundWind, 31, 32, 33],
    redDora: view.rules.redDora,
  }).filter((o) => legal.some((t) => kindOf(t) === o.kind));
  const best = ranked[0];
  if (!best) return null;

  /** @type {Record<number, number>} */
  const badges = {};
  for (const tile of legal) {
    const option = ranked.find((o) => o.kind === kindOf(tile));
    if (option && option.shanten === best.shanten) badges[tile] = option.ukeire.total;
  }
  const bestTile = legal.includes(best.tile)
    ? best.tile
    : /** @type {number} */ (legal.find((t) => kindOf(t) === best.kind));

  const { tiles, total } = best.ukeire;
  if (options.plain) {
    return {
      best: bestTile,
      reason: plainReason(best, toCounts(view.hand), ties(ranked, best)),
      badges,
      shanten: current,
    };
  }
  // 牌の名前のあとに {3p} のような表記を付け、表示時に牌の絵にする（richText）
  /** @param {number} kind */
  const named = (kind) => `${kindName(kind)}${kindToken(kind)}`;
  const names = tiles.slice(0, 5).map((t) => named(t.kind));
  const list = `${names.join('・')}${tiles.length > 5 ? ' など' : ''}`;
  let reason =
    best.shanten === 0
      ? total > 0
        ? `${named(best.kind)}を切るとテンパイ。待ちは ${tiles.map((t) => `${named(t.kind)}（残り${t.count}枚）`).join('、')}。`
        : `${named(best.kind)}を切るとテンパイですが、待ち牌が残っていません。`
      : `${named(best.kind)}を切ると${shantenLabel(best.shanten)}。受け入れは${tiles.length}種${total}枚（${list}）。`;
  reason +=
    ties(ranked, best) > 1
      ? '同じ広さなら、赤・ドラを残して字牌・端牌から切ります。'
      : 'いちばん受け入れが広い切り方です。';
  return { best: bestTile, reason, badges, shanten: current };
}

/**
 * 最善と同じ評価（シャンテン数と受け入れ枚数が同じ）の候補の数。
 * @param {import('../core/efficiency.js').DiscardOption[]} ranked
 * @param {import('../core/efficiency.js').DiscardOption} best
 */
function ties(ranked, best) {
  return ranked.filter((o) => o.shanten === best.shanten && o.ukeire.total === best.ukeire.total).length;
}

/**
 * 初心者モードの理由の文。用語には、かっこで意味を付ける。
 * @param {import('../core/efficiency.js').DiscardOption} best
 * @param {number[]} counts 切る前の手牌（牌種ごとの枚数）
 * @param {number} tieCount
 * @returns {string}
 */
function plainReason(best, counts, tieCount) {
  const { tiles, total } = best.ukeire;
  // 名前はレッスンと同じ「5ピン」の形にそろえる
  /** @param {number} kind */
  const named = (kind) => `${tileReading(kind)}${kindToken(kind)}`;
  const name = named(best.kind);
  if (best.shanten === 0) {
    if (total === 0)
      return `${name}を捨てるとテンパイ（あと1枚で上がり）ですが、上がれる牌はもう残っていません。`;
    const waits = tiles.map((t) => `${named(t.kind)}（残り${t.count}枚）`).join('、');
    return `${name}を捨てるとテンパイ（あと1枚で上がり）！ 上がれる牌は ${waits}。`;
  }
  // 「字牌や1・9から」は、勧める牌が本当に字牌・1・9のときだけ言う
  const why = isLonely(counts, best.kind)
    ? 'この牌は仲間（同じ牌や近い数字）がいません。'
    : tieCount > 1 && isYaochu(best.kind)
      ? '同じくらいなら、字牌や1・9から捨てます。'
      : 'これがいちばん手が進みやすい捨て方です。';
  const list = tiles
    .slice(0, 4)
    .map((t) => kindToken(t.kind))
    .join('');
  // 長いと読まれないので2文にする。数字の意味は使い方の説明とレッスンで教える
  return (
    `${name}を捨てましょう。${why}` +
    `<br><span class="small">テンパイ（あと1枚で上がり）まで、あと${best.shanten}歩。${list}${tiles.length > 4 ? ' など' : ''}を引くと1歩進みます（山に全部で${total}枚）。</span>`
  );
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
 * @param {boolean} [plain] 初心者モード（用語に意味を付ける）
 * @returns {string}
 */
export function tenpaiHtml(info, plain = false) {
  const waits = info.waits
    .map((w) => {
      const name = plain ? tileReading(w.kind) : kindName(w.kind);
      const points =
        plain && w.points === '役なし'
          ? '<strong class="warn">役なし</strong>: このままではロンできません。リーチすれば上がれます'
          : w.points;
      return `<span class="wait">${kindSvg(w.kind, false, { width: 18 })}<span>${name} 残り${w.left}枚<br>${points}</span></span>`;
    })
    .join('');
  const furiten = info.furiten
    ? `<strong class="warn">${termHtml('furiten')}${plain ? '：いまはロンできません（ツモなら上がれます）' : ''}</strong>`
    : '';
  const label = plain ? `${termHtml('tenpai')}（あと1枚で上がり） 上がれる牌` : `${termHtml('tenpai')} 待ち`;
  return `<div class="tenpai"><span>${label}</span>${furiten}${waits}</div>`;
}
