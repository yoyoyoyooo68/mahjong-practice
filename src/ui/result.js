// 局の結果と対局終了の画面。和了は 役 → 符・翻 → 点数 → 点数移動 の順に段階開示する。

import { calcPoints, pointsLabel } from '../core/score.js';
import { sortTiles } from '../core/tiles.js';
import { seatWindOf } from '../game/round.js';
import { ME } from './session.js';
import { tileSvg } from './tile-svg.js';
import { termHtml, yakuItemHtml } from './yaku-explainer.js';

/** @typedef {import('../game/state.js').GameState} GameState */
/** @typedef {import('./session.js').Session} Session */

const WINDS = ['東', '南', '西', '北'];
const DRAW_LABEL = {
  exhaustive: '流局',
  kyuushu: '九種九牌で流局',
  suufon: '四風連打で流局',
  suucha: '四家立直で流局',
  suukan: '四開槓で流局',
  sanchahou: '三家和了で流局',
};

/** @param {number} n */
const signed = (n) => (n > 0 ? `+${n}` : String(n));

/**
 * @param {GameState} state
 * @param {number[]} tiles
 * @param {number} width
 */
const tilesHtml = (state, tiles, width) =>
  tiles.map((t) => tileSvg(t, { width, redDora: state.rules.redDora })).join('');

/**
 * @param {Session} session
 * @param {import('../game/state.js').WinInfo} w
 * @param {number} step
 */
function winHtml(session, w, step) {
  const state = /** @type {GameState} */ (session.state);
  const p = state.players[w.seat];
  const tsumo = w.from === null;
  const h = w.hand;
  const concealed = sortTiles(p.hand.filter((t) => t !== w.tile));
  const melds = p.melds
    .map(
      (m) =>
        `<span class="gap"></span>${tilesHtml(state, m.type === 'chi' ? sortTiles(m.tiles) : m.tiles, 28)}`,
    )
    .join('');
  const how = tsumo ? 'ツモ' : `ロン（${session.names[/** @type {number} */ (w.from)]}から）`;
  let html =
    `<h3>${session.names[w.seat]}の${how}</h3>` +
    `<div class="result-hand">${tilesHtml(state, concealed, 28)}<span class="gap"></span>${tilesHtml(state, [w.tile], 28)}${melds}</div>` +
    `<ul class="yaku-list">${h.yaku.map(yakuItemHtml).join('')}</ul>`;

  if (step >= 1) {
    const dora = [
      ['ドラ', h.dora.dora],
      ['裏ドラ', h.dora.ura],
      ['赤ドラ', h.dora.red],
    ]
      .filter(([, n]) => Number(n) > 0)
      .map(([label, n]) => `${label} ${n}翻`)
      .join('、');
    if (h.yakuman > 0) {
      html += `<p class="points">${h.limitName}</p>`;
    } else {
      const fu = h.fuDetails.map((d) => `${d.label} ${d.fu}`).join(' ＋ ');
      html +=
        `<p class="points">${h.fu}${termHtml('fu')} ${h.han}${termHtml('han')}${h.limitName ? `　${h.limitName}` : ''}</p>` +
        `${dora ? `<p class="small">${termHtml('dora')}: ${dora}</p>` : ''}<p class="small">符の内訳: ${fu}</p>`;
    }
    if (p.riichi > 0) {
      const ura = tilesHtml(state, state.uraIndicators.slice(0, state.doraRevealed), 18);
      html += `<p class="small">裏ドラ表示牌 <span class="inline-tiles">${ura}</span></p>`;
    }
  }
  if (step >= 2) {
    const dealer = w.seat === state.dealer;
    html += `<p class="points is-big">${pointsLabel(calcPoints(h.base, dealer, tsumo), dealer, tsumo)}</p>`;
  }
  return html;
}

/**
 * 次に意識するとよいことを1行で返す。
 * @param {Session} session
 */
function nextGoal(session) {
  const r = /** @type {GameState} */ (session.state).result;
  if (!r) return '';
  if (r.wins.some((w) => w.seat === ME)) return 'ナイス和了。次は打点（ドラや手役）も意識してみましょう。';
  if (r.wins.some((w) => w.from === ME))
    return 'リーチや鳴きが入ったら、相手の捨て牌にある牌（現物）から切ると放銃を減らせます。';
  if (r.reason === 'exhaustive' && !r.tenpai[ME])
    return '終盤はテンパイを目指して、受け入れ枚数の多い切り方を選んでみましょう。';
  if (r.reason === 'exhaustive')
    return 'テンパイまで届きました。待ちの残り枚数も見て、広い待ちを選べるとさらに良いです。';
  return '他家の和了は、役と符の内訳を見ておくと点数計算の練習になります。';
}

/**
 * 初心者モードの「次回の課題」。
 * @param {Session} session
 */
function plainGoal(session) {
  const r = /** @type {GameState} */ (session.state).result;
  if (!r) return '';
  if (r.wins.some((w) => w.seat === ME)) return 'おめでとう！ 次も上がりを目指しましょう。';
  if (r.wins.some((w) => w.from === ME))
    return 'リーチした人が捨てた牌と同じ牌は、その人にはロンされません。だれかがリーチしたら試してみましょう。';
  if (r.reason === 'exhaustive' && !r.tenpai[ME])
    return 'ヒントのおすすめの牌を捨てて、テンパイ（あと1枚で上がり）を目指しましょう。';
  if (r.reason === 'exhaustive') return 'あと少し！ テンパイしたら「リーチ」をしてみましょう。';
  return 'ほかの人が上がりました。次の局でがんばりましょう。';
}

/**
 * 初心者モードの、局の結果の一言まとめ。
 * @param {Session} session
 * @returns {string}
 */
function plainSummary(session) {
  const state = /** @type {GameState} */ (session.state);
  const r = /** @type {NonNullable<GameState['result']>} */ (state.result);
  /** @param {number} n */
  const pts = (n) => `${Math.abs(n)}点`;
  const mine = r.deltas[ME];
  const lines = [];
  if (r.type === 'win') {
    for (const w of r.wins) {
      const yaku = w.hand.yaku.map((y) => y.name).join('・');
      const how = w.from === null ? 'ツモ（自分で引いた牌）' : 'ロン（ほかの人の捨て牌）';
      if (w.seat === ME)
        lines.push(`<strong>あなたが ${yaku} で上がりました！</strong> ${how}で上がりです。`);
      else if (w.from === ME)
        lines.push(
          `あなたが捨てた<span class="inline-tiles">${tilesHtml(state, [w.tile], 22)}</span>で、${session.names[w.seat]}が上がりました（${yaku}）。ロンのときは、捨てた人が1人で全部払います。`,
        );
      else if (w.from === null)
        lines.push(
          `${session.names[w.seat]}が ${yaku} で上がりました（${how}）。ツモのときは、ほかの3人全員が少しずつ払います。`,
        );
      else
        lines.push(
          `${session.names[w.seat]}が ${yaku} で上がりました（${session.names[w.from]}の捨て牌でロン）。払うのは捨てた人だけです。`,
        );
    }
  } else if (r.reason === 'exhaustive') {
    lines.push('牌がなくなり、だれも上がらずに終わりました（流局）。');
    const all = r.tenpai.every(Boolean);
    const none = !r.tenpai.some(Boolean);
    lines.push(
      all || none
        ? `${all ? '全員がテンパイ（あと1枚で上がり）だった' : 'だれもテンパイ（あと1枚で上がり）していなかった'}ので、点数のやりとりはありません。`
        : r.tenpai[ME]
          ? 'あなたはテンパイ（あと1枚で上がり）だったので、していない人から点数をもらいます。'
          : 'あなたはテンパイ（あと1枚で上がり）していなかったので、している人に点数を払います。',
    );
  } else {
    const reason = /** @type {keyof typeof DRAW_LABEL} */ (r.reason ?? 'exhaustive');
    lines.push(`${DRAW_LABEL[reason]}（特別なルールで、この局は終わりです）。`);
  }
  const change =
    mine > 0
      ? `<p class="points is-big plus">+${pts(mine)} もらいました</p>`
      : mine < 0
        ? `<p class="points is-big minus">${pts(mine)} 払いました</p>`
        : '<p class="points">点数の変化はありません</p>';
  return `<div class="plain-summary">${lines.map((l) => `<p>${l}</p>`).join('')}${change}<p class="small">いまの点数: ${r.scores[ME]}点</p></div>`;
}

/**
 * 局の結果（roundEnd のとき）。
 * @param {Session} session
 * @returns {string}
 */
export function roundResultHtml(session) {
  const state = /** @type {GameState} */ (session.state);
  const r = state.result;
  if (state.phase !== 'roundEnd' || !r) return '';
  const step = session.ui.resultStep;
  let body = '';
  if (r.type === 'win') {
    body = r.wins.map((w) => winHtml(session, w, step)).join('');
  } else {
    const reason = /** @type {keyof typeof DRAW_LABEL} */ (r.reason ?? 'exhaustive');
    body = `<h3>${DRAW_LABEL[reason]}</h3>`;
    if (r.reason === 'exhaustive') {
      const names = r.tenpai.flatMap((t, seat) => (t ? [session.names[seat]] : []));
      body += `<p class="small">${termHtml('tenpai')}: ${names.length > 0 ? names.join('、') : 'なし'}</p>`;
      if (r.nagashi.length > 0) {
        body += `<p class="points">流し満貫: ${r.nagashi.map((seat) => session.names[seat]).join('、')}</p>`;
      }
    }
  }

  let footer = '';
  if (step >= 3) {
    const rows = [0, 1, 2, 3]
      .map((seat) => {
        const d = r.deltas[seat];
        const cls = d > 0 ? 'plus' : d < 0 ? 'minus' : '';
        return `<tr><td>${WINDS[seatWindOf(state, seat)]}家</td><td>${session.names[seat]}</td><td class="num ${cls}">${d === 0 ? '±0' : signed(d)}</td><td class="num">${r.scores[seat]}</td></tr>`;
      })
      .join('');
    const kyotaku =
      r.kyotakuTo >= 0
        ? `<p class="small">残った供託は${session.names[r.kyotakuTo]}が受け取りました。</p>`
        : '';
    const hints = session.ui.hintUses > 0 ? `ヒント使用 ${session.ui.hintUses}回。` : '';
    footer = `<table class="score-table"><caption class="small">点数の移動</caption>${rows}</table>${kyotaku}`;
    if (!session.beginner) footer += `<p class="small goal">${hints}次回の課題: ${nextGoal(session)}</p>`;
  }
  if (session.beginner) {
    // 一言のまとめを先に出し、役・符・翻・点数の内訳は折りたたむ
    body =
      `${plainSummary(session)}<details class="result-details"><summary>詳しく見る（役・点数の内訳）</summary>${body}${footer}</details>` +
      `<p class="small goal">次は: ${plainGoal(session)}</p>`;
    footer = '';
  }
  const buttons =
    step >= 3
      ? `<button type="button" data-cmd="next-round" class="act">${r.end ? '最終結果へ' : '次の局へ'}</button>`
      : '<button type="button" data-cmd="reveal-all" class="act is-quiet">まとめて見る</button>' +
        '<button type="button" data-cmd="reveal" class="act">次へ</button>';
  return (
    `<div class="overlay"><div class="panel result" role="dialog" aria-label="局の結果">` +
    `<h2>東${state.kyoku + 1}局 ${state.honba}本場</h2><div class="panel-body">${body}${footer}</div>` +
    `<div class="panel-buttons">${buttons}</div></div></div>`
  );
}

/**
 * 対局終了（gameEnd のとき）。
 * @param {Session} session
 * @returns {string}
 */
export function gameResultHtml(session) {
  const state = /** @type {GameState} */ (session.state);
  if (state.phase !== 'gameEnd') return '';
  const rows = state.ranking
    .map((seat, i) => {
      const cpu = session.cpus[seat];
      return `<tr${seat === ME ? ' class="is-me"' : ''}><td>${i + 1}位</td><td>${session.names[seat]}${cpu ? `（${cpu.style}）` : ''}</td><td class="num">${state.scores[seat]}</td></tr>`;
    })
    .join('');
  const rank = state.ranking.indexOf(ME) + 1;
  const hints = session.ui.hintTotal > 0 ? `ヒント使用 ${session.ui.hintTotal}回。` : '';
  return (
    `<div class="overlay"><div class="panel result" role="dialog" aria-label="対局終了">` +
    `<h2>対局終了　あなたは${rank}位</h2><div class="panel-body"><table class="score-table">${rows}</table>` +
    `<p class="small goal">${hints}おつかれさまでした。</p></div>` +
    `<div class="panel-buttons"><button type="button" data-cmd="home" class="act is-quiet">ホーム</button>` +
    `<button type="button" data-cmd="new-game" class="act">もう1局</button></div></div></div>`
  );
}
