// 卓面。横画面（844×390）基準で、中央に4家の捨て牌を十字に置き、右にヒントと行動ボタン、下に手牌を並べる。
// 状態から HTML 文字列を作るだけで、DOM には触らない。

import { doraKindOf, isYaochu, kindName, kindOf, sortTiles, tileName, toCounts } from '../core/tiles.js';
import { visibleCounts } from '../cpu/base.js';
import { remainingTiles, seatWindOf, viewFor, waitKinds } from '../game/round.js';
import { nextActor } from '../game/runner.js';
import { callWarning, hintModel, tenpaiHtml, tenpaiInfo } from './hint-panel.js';
import { ME } from './session.js';
import { kindSvg, tileSvg } from './tile-svg.js';
import { richText, tileReading } from './tile-text.js';
import { termHtml } from './yaku-explainer.js';

/** @typedef {import('../game/state.js').GameState} GameState */
/** @typedef {import('../game/state.js').Action} Action */
/** @typedef {import('./session.js').Session} Session */

const WINDS = ['東', '南', '西', '北'];

/**
 * 鳴ける牌が役牌（白・發・中・東・自分の風。東風戦なので場の風はいつも東）で、ポンできるか。初心者モードでは、このポンだけはおすすめを変える。
 * @param {GameState} state
 */
function yakuhaiPon(state) {
  if (!state.pending || state.phase !== 'response') return false;
  const k = kindOf(state.pending.tile);
  const yakuhai = k >= 31 || k === 27 || k === 27 + seatWindOf(state, ME);
  return yakuhai && state.options[ME].some((o) => o.type === 'pon');
}

/**
 * リーチできる打牌のうち、上がれる牌がまだ残っているものがあるか。
 * @param {GameState} state
 */
function riichiHasWaits(state) {
  const hand = state.players[ME].hand;
  const visible = visibleCounts(viewFor(state, ME));
  return state.options[ME].some((o) => {
    if (o.type !== 'discard' || !o.riichi) return false;
    const rest = hand.filter((t) => t !== o.tile);
    const own = toCounts(rest);
    return waitKinds(rest, 0).some((k) => 4 - visible[k] - own[k] > 0);
  });
}

/**
 * @typedef {object} TableOptions
 * @property {boolean} [tileNames] 初心者モードで手牌の下に牌の名前を出すか
 */
/** 自分から見た位置（席0=下、席1=右、席2=上、席3=左） */
const POSITIONS = ['bottom', 'right', 'top', 'left'];

/**
 * @param {GameState} state
 * @param {number[]} tiles
 * @param {number} width
 */
function tiles(state, tiles, width) {
  return tiles.map((t) => tileSvg(t, { width, redDora: state.rules.redDora })).join('');
}

/**
 * @param {Session} session
 * @param {number} seat
 */
function seatHtml(session, seat) {
  const state = /** @type {GameState} */ (session.state);
  const p = state.players[seat];
  const wind = WINDS[seatWindOf(state, seat)];
  const turn = state.phase === 'turn' && state.turn === seat;
  const cpu = session.cpus[seat];
  const lastSeat = state.pending?.kind === 'discard' ? state.pending.from : -1;
  const width = seat === ME ? 18 : 14;

  const river = p.discards
    .map((d, i) => {
      const classes = ['river-tile'];
      if (d.riichi) classes.push('is-riichi');
      if (d.called) classes.push('is-called');
      if (seat === lastSeat && i === p.discards.length - 1) classes.push('is-last');
      return `<span class="${classes.join(' ')}">${tileSvg(d.tile, { width, redDora: state.rules.redDora })}</span>`;
    })
    .join('');
  const riverLabel = `${wind}家の捨て牌: ${p.discards.map((d) => tileName(d.tile, state.rules.redDora)).join('、') || 'なし'}`;

  const marks = [];
  if (seat === state.dealer) marks.push(`<span class="mark">${termHtml('oya')}</span>`);
  if (p.riichi > 0)
    marks.push(`<span class="mark is-riichi"><span aria-hidden="true">▬</span>${termHtml('riichi')}</span>`);
  if (turn) marks.push(`<span class="mark is-turn">${seat === ME ? 'あなたの番' : '手番'}</span>`);
  const melds =
    seat !== ME && p.melds.length > 0
      ? `<div class="melds">${p.melds.map((m) => `<span class="meld">${tiles(state, m.type === 'chi' ? sortTiles(m.tiles) : m.tiles, 14)}</span>`).join('')}</div>`
      : '';
  const label =
    `<div class="seat-label"><span class="wind">${wind}</span><span class="name">${session.names[seat]}</span>` +
    `${cpu ? `<span class="style">${cpu.style}</span>` : ''}<span class="score">${state.scores[seat]}</span>${marks.join('')}</div>`;
  const riverHtml = `<div class="river" role="img" aria-label="${riverLabel}">${river}</div>`;
  // 自分の席は捨て牌が上、ラベルが下（手牌に近い側）
  const body = seat === ME ? `${riverHtml}${label}` : `${label}${melds}${riverHtml}`;
  return `<section class="seat pos-${POSITIONS[seat]}${turn ? ' is-turn' : ''}">${body}</section>`;
}

/**
 * 行動ボタン。画面に出したボタンに対応する行動を buttons に入れて返す。
 * @param {Session} session
 * @returns {{ html: string, buttons: Action[] }}
 */
function actionsHtml(session) {
  const state = /** @type {GameState} */ (session.state);
  const { ui } = session;
  /** @type {Action[]} */
  const buttons = [];
  /** @type {string[]} */
  const html = [];
  /** @param {Action} action @param {string} label @param {string} [cls] */
  const add = (action, label, cls = '') => {
    html.push(`<button type="button" data-act="${buttons.length}" class="act ${cls}">${label}</button>`);
    buttons.push(action);
  };

  if (ui.canUndo) html.push('<button type="button" data-cmd="undo" class="act is-quiet">取り消し</button>');
  if (nextActor(state) === ME && !ui.paused) {
    const options = state.options[ME];
    if (ui.riichiMode) {
      html.push('<button type="button" data-cmd="riichi-cancel" class="act is-quiet">キャンセル</button>');
    } else {
      for (const o of options) {
        if (o.type === 'tsumo') add(o, 'ツモ', 'is-win');
        else if (o.type === 'ron') add(o, 'ロン', 'is-win');
        else if (o.type === 'kyuushu') add(o, '九種九牌');
        else if (o.type === 'ankan') add(o, `カン ${kindName(/** @type {number} */ (o.kind))}`);
        else if (o.type === 'kakan') add(o, `カン ${kindName(kindOf(/** @type {number} */ (o.tile)))}`);
        else if (o.type === 'minkan') add(o, 'カン');
        else if (o.type === 'pon' || o.type === 'chi') {
          const pair = tiles(state, /** @type {number[]} */ (o.tiles), 22);
          add(o, `${o.type === 'pon' ? 'ポン' : 'チー'}<span class="act-tiles">${pair}</span>`);
        }
      }
      if (options.some((o) => o.type === 'discard' && o.riichi)) {
        html.push('<button type="button" data-cmd="riichi" class="act is-riichi">リーチ</button>');
      }
      const drawn = state.players[ME].drawn;
      const tsumogiri = options.find((o) => o.type === 'discard' && !o.riichi && o.tile === drawn);
      // 初心者には「ツモ」（上がり）と紛らわしいので、言い換える
      if (tsumogiri && state.phase === 'turn')
        add(tsumogiri, session.beginner ? '引いた牌を捨てる' : 'ツモ切り', 'is-quiet');
      // パスは必ずいちばん下
      const pass = options.find((o) => o.type === 'pass');
      // 初心者モードで鳴けるときは、パスをおすすめとして目立たせる（ロンできるときは除く）
      const recommendPass = session.beginner && !options.some((o) => o.type === 'ron') && !yakuhaiPon(state);
      if (pass)
        add(
          pass,
          recommendPass ? 'パス（おすすめ）' : 'パス',
          recommendPass ? 'is-primary is-pass' : 'is-quiet is-pass',
        );
    }
  }
  return { html: `<div class="actions">${html.join('')}</div>`, buttons };
}

/**
 * @param {Session} session
 * @param {ReturnType<typeof hintModel>} hint
 * @param {boolean} names 牌の下に名前を出すか
 */
function handHtml(session, hint, names) {
  const state = /** @type {GameState} */ (session.state);
  const { ui } = session;
  const me = state.players[ME];
  const myTurn = state.phase === 'turn' && state.turn === ME && !ui.paused;
  const rest = sortTiles(me.hand.filter((t) => t !== me.drawn));
  const order = me.drawn === null ? rest : [...rest, me.drawn];
  const html = order
    .map((t) => {
      const legal =
        myTurn &&
        state.options[ME].some((o) => o.type === 'discard' && o.tile === t && (!ui.riichiMode || o.riichi));
      const classes = ['hand-tile'];
      if (t === me.drawn) classes.push('is-drawn');
      if (t === ui.selected) classes.push('is-selected');
      if (myTurn && !legal) classes.push('is-dim');
      if (hint?.best === t) classes.push('is-hint');
      const badge =
        hint && hint.badges[t] !== undefined
          ? `<span class="badge" aria-label="受け入れ${hint.badges[t]}枚">${hint.badges[t]}</span>`
          : '';
      const mark = hint?.best === t ? '<span class="hint-mark" aria-label="おすすめ">▲</span>' : '';
      const name = names ? `<span class="tile-name" aria-hidden="true">${tileReading(kindOf(t))}</span>` : '';
      return `<button type="button" class="${classes.join(' ')}" data-tile="${t}"${legal ? '' : ' disabled'}>${mark}${tileSvg(t, { redDora: state.rules.redDora })}${badge}${name}</button>`;
    })
    .join('');
  const melds = me.melds
    .map(
      (m) => `<span class="meld">${tiles(state, m.type === 'chi' ? sortTiles(m.tiles) : m.tiles, 28)}</span>`,
    )
    .join('');
  return `<div class="hand${names ? ' has-names' : ''}" role="group" aria-label="あなたの手牌">${html}${melds ? `<div class="hand-melds">${melds}</div>` : ''}</div>`;
}

/**
 * 初心者モードで、いま何をすればよいかの案内（ヒントのオン・オフにかかわらず出す）。
 * @param {Session} session
 * @param {boolean} hintShown 捨てる牌のヒントを表示中か
 * @returns {string[]}
 */
function guideNotes(session, hintShown) {
  const state = /** @type {GameState} */ (session.state);
  const { ui } = session;
  if (!session.beginner || ui.paused || nextActor(state) !== ME) return [];
  const options = state.options[ME];
  /** @param {string} text */
  const note = (text) => `<p class="guide">${text}</p>`;
  if (options.some((o) => o.type === 'ron')) return [note('ロンで上がれます！「ロン」を押しましょう。')];
  if (options.some((o) => o.type === 'tsumo')) return [note('上がりの形です！「ツモ」を押しましょう。')];
  if (yakuhaiPon(state)) {
    return [
      note(
        '白・發・中・東・自分の風の牌は、<strong>ポンしても役（役牌）が付きます</strong>。ポンしても大丈夫です（ただし、リーチはできなくなります）。',
      ),
    ];
  }
  if (options.some((o) => o.type === 'pon' || o.type === 'chi' || o.type === 'minkan')) {
    return [
      note(
        '<strong>おすすめ: パス</strong>。ポン・チー（ほかの人の捨て牌をもらうこと）をすると、リーチができなくなり、役（上がりに必要な条件）がなくなることもあります。',
      ),
    ];
  }
  if (state.phase !== 'turn') return [];
  if (ui.riichiMode) return [note('明るくなっている牌から、捨てる牌を選んでください。')];
  /** @type {string[]} */
  const out = [];
  // 相手のリーチは、気づかないうちにロンされやすいので、その場で知らせる
  const riichi = [1, 2, 3].filter((seat) => state.players[seat].riichi > 0);
  if (riichi.length > 0 && state.players[ME].riichi === 0) {
    const who = riichi.map((seat) => session.names[seat]).join('と');
    out.push(
      note(
        `<strong>${who}がリーチしています</strong>（あと1枚で上がりの状態）。${who}が捨てた牌と同じ牌は、${who}にはロンされません（安全な牌）。`,
      ),
    );
  }
  if (options.some((o) => o.type === 'ankan' || o.type === 'kakan' || o.type === 'kyuushu')) {
    out.push(note('「カン」「九種九牌」のボタンは、押さなくても大丈夫です。'));
  }
  if (options.some((o) => o.type === 'discard' && o.riichi)) {
    out.push(
      riichiHasWaits(state)
        ? note(
            '<strong>リーチできます</strong>。「リーチ」を押してから捨てる牌を選ぶと、役（上がりに必要な条件）が1つ付きます。',
          )
        : note('テンパイですが、上がれる牌がもう残っていません。リーチはしないで、手を変えましょう。'),
    );
  }

  if (!hintShown) out.push(note('あなたの番です。いらない牌を1回タップして、もう1回タップで捨てます。'));
  return out;
}

/**
 * 卓面全体。
 * @param {Session} session
 * @param {TableOptions} [options]
 * @returns {{ html: string, buttons: Action[] }}
 */
export function tableHtml(session, options = {}) {
  const state = /** @type {GameState} */ (session.state);
  const { ui } = session;
  const plain = session.beginner;
  const hint = ui.hintOn ? hintModel(state, ME, { plain }) : null;
  const tenpai = tenpaiInfo(state, ME);
  const actions = actionsHtml(session);

  const notes = [];
  if (hint) {
    const selected = ui.selected !== null ? hint.badges[ui.selected] : undefined;
    notes.push(
      `<p class="hint-text">${richText(hint.reason)}${selected !== undefined ? (plain ? ` 選んでいる牌を捨てると、手が進む牌は${selected}枚。` : ` 選択中の牌は${termHtml('ukeire')}${selected}枚。`) : ''}</p>`,
    );
  }
  notes.push(...guideNotes(session, hint !== null && hint.best !== null));
  if (ui.hintOn && !plain) {
    const warning = callWarning(state, ME);
    if (warning) notes.push(`<p class="hint-text warn">${warning}</p>`);
  }
  if (state.phase === 'response' && state.pending && nextActor(state) === ME) {
    const what = state.pending.kind === 'discard' ? '捨て牌' : 'カン';
    notes.push(
      `<p class="prompt">${session.names[state.pending.from]}の${what}<span class="inline-tiles">${tiles(state, [state.pending.tile], 22)}</span></p>`,
    );
  }
  if (ui.riichiMode && !plain) notes.push('<p class="prompt">明るい牌から宣言牌を選んでください</p>');
  if (tenpai) notes.push(tenpaiHtml(tenpai, plain));

  const indicators = state.doraIndicators.slice(0, state.doraRevealed);
  const dora = tiles(state, indicators, 18);
  // 表示牌そのものをドラと思い込みやすいので、初心者モードでは本当のドラも並べる
  const realDora = plain
    ? `<span class="dora-real">→ ドラ<span class="inline-tiles">${indicators.map((id) => kindSvg(doraKindOf(kindOf(id)), false, { width: 18 })).join('')}</span></span>`
    : '';
  const html =
    `<header class="bar"><strong>東${state.kyoku + 1}局</strong><span>${state.honba}${termHtml('honba')}</span>` +
    `<span>${termHtml('kyotaku')} ${state.kyotaku}</span><span class="spacer"></span>` +
    `<button type="button" data-cmd="hint" class="chip${ui.hintOn ? ' is-on' : ''}" aria-pressed="${ui.hintOn}">ヒント</button>` +
    `<button type="button" data-cmd="sheet" data-id="yaku" class="chip">役一覧</button>` +
    `<button type="button" data-cmd="sheet" data-id="quit" class="chip">中断</button></header>` +
    `<div class="middle"><div class="cross">${[2, 3, 1, ME].map((seat) => seatHtml(session, seat)).join('')}` +
    `<div class="pos-mid"><span>残り <strong>${remainingTiles(state)}</strong></span>` +
    `<span class="dora">${termHtml('dora', 'ドラ表示')}<span class="inline-tiles">${dora}</span>${realDora}</span></div></div>` +
    `<aside class="side"><div class="notes" aria-live="polite">${notes.join('')}</div>${actions.html}</aside></div>` +
    handHtml(session, hint, plain && options.tileNames !== false);
  return { html, buttons: actions.buttons };
}
