import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/cpu/base.js';
import { GENTLE } from '../src/cpu/personalities/index.js';
import { next, viewFor } from '../src/game/round.js';
import { nextActor } from '../src/game/runner.js';
import { defaultStore, migrate } from '../src/storage/store.js';
import { hintModel } from '../src/ui/hint-panel.js';
import { homeHtml, settingsHtml } from '../src/ui/home.js';
import { roundResultHtml } from '../src/ui/result.js';
import { cpusFor, createSession, ME } from '../src/ui/session.js';
import { tableHtml } from '../src/ui/table.js';
import { tileReading } from '../src/ui/tile-text.js';
import { buildWall, JUNK, kind } from './game-helpers.js';

/** @typedef {import('../src/game/state.js').GameState} GameState */

const NOTEN = `${JUNK}3456z`;
const FAST = { cpuTurn: 0, cpuResponse: 0, auto: 0 };

/**
 * @param {Parameters<typeof buildWall>[0] | null} spec null なら牌山を固定しない
 * @param {boolean} beginner
 */
function open(spec, beginner = true) {
  const session = createSession({ onChange: () => {}, delays: FAST });
  session.start({
    ...(spec ? { wall: buildWall(spec) } : { seed: 3 }),
    ...(beginner ? { beginner: true } : {}),
  });
  session.setPaused(true);
  return session;
}

/** 自動で進まないように止めたうえで、表示だけできる状態にする @param {ReturnType<typeof open>} session @param {GameState} state */
function show(session, state) {
  session.stop();
  session.state = state;
  session.ui.paused = false;
}

test('初心者モードの相手は、やさしい3人', () => {
  assert.deepEqual(
    cpusFor({ seed: 3, beginner: true }).map((c) => c?.id ?? null),
    [null, 'gentle-1', 'gentle-2', 'gentle-3'],
  );
  assert.deepEqual(
    cpusFor({ seed: 3 }).map((c) => c?.id ?? null),
    [null, 'balance', 'attack', 'defense'],
  );
});

test('やさしい相手は鳴かない', () => {
  // 席3が中を切り、席1が中の対子を持っている → 普通の相手ならポンする場面
  const session = open({ hands: [NOTEN, '77z147m258p369s12z', NOTEN, `${JUNK}3457z`] }, true);
  let state = /** @type {GameState} */ (session.state);
  for (let i = 0; i < 3; i++) {
    state = next(state, {
      type: 'discard',
      seat: state.turn,
      tile: /** @type {number} */ (state.players[state.turn].drawn),
    });
    while (state.phase === 'response') state = next(state, { type: 'pass', seat: nextActor(state) });
  }
  const chun = state.players[3].hand.find((t) => t >> 2 === kind('7z'));
  state = next(state, { type: 'discard', seat: 3, tile: /** @type {number} */ (chun) });
  assert.ok(
    state.options[1].some((o) => o.type === 'pon'),
    'ポンできる場面',
  );
  assert.equal(decide(viewFor(state, 1), GENTLE[0]).type, 'pass');
  session.stop();
});

test('ヒント: 初心者モードは最初からオンで、ボタンで消せる', () => {
  const session = open(null, true);
  assert.equal(session.beginner, true);
  assert.equal(session.ui.hintOn, true);
  session.toggleHint();
  assert.equal(session.ui.hintOn, false);
  session.stop();

  const normal = open(null, false);
  assert.equal(normal.beginner, false);
  assert.equal(normal.ui.hintOn, false, '普通の対局は初期オフのまま');
  normal.stop();
});

test('ヒント: 初心者向けの文は用語に意味を付け、「受け入れ」を使わない', () => {
  const session = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  const state = /** @type {GameState} */ (session.state);
  const plain = hintModel(state, ME, { plain: true });
  assert.ok(plain);
  assert.match(plain.reason, /を捨てるとテンパイ（あと1枚で上がり）/);
  assert.match(plain.reason, /2ソー\{2s\}/, '上がれる牌に名前と牌の絵');
  assert.doesNotMatch(plain.reason, /受け入れ|シャンテン/);
  assert.equal(plain.best, hintModel(state, ME)?.best, 'おすすめの牌は普通のヒントと同じ');
  session.stop();

  // 仲間のいない牌を切る場面
  const s2 = open({ hands: ['1236m456p55789s1z', NOTEN, NOTEN, NOTEN], live: '9p', dora: '2z' });
  const h2 = hintModel(/** @type {GameState} */ (s2.state), ME, { plain: true });
  assert.match(h2?.reason ?? '', /仲間/);
  assert.match(h2?.reason ?? '', /テンパイ（あと1枚で上がり）まで、あと1歩/);
  assert.match(h2?.reason ?? '', /^(東|9ピン|6マン)\{/, '牌の名前はレッスンと同じ「9ピン」の形');
  s2.stop();
});

test('卓: 初心者モードは手牌の下に牌の名前を出す（設定で消せる）', () => {
  const session = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  show(session, /** @type {GameState} */ (session.state));
  const html = tableHtml(session).html;
  assert.match(html, /<span class="tile-name" aria-hidden="true">2マン<\/span>/);
  assert.match(html, />中<\/span><\/button>/, 'ツモった中');
  assert.doesNotMatch(tableHtml(session, { tileNames: false }).html, /tile-name/);
  session.stop();

  const normal = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' }, false);
  show(normal, /** @type {GameState} */ (normal.state));
  assert.doesNotMatch(tableHtml(normal).html, /tile-name/, '普通の対局では出さない');
  normal.stop();
});

test('卓: ヒントを消しても、いま何をするかの案内は出る', () => {
  const session = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  show(session, /** @type {GameState} */ (session.state));
  assert.match(tableHtml(session).html, /class="hint-text"/);
  session.ui.hintOn = false;
  const html = tableHtml(session).html;
  assert.doesNotMatch(html, /class="hint-text"/);
  assert.match(html, /あなたの番です/);
  assert.match(html, /リーチできます/);
  session.stop();
});

test('卓: 鳴ける場面では「おすすめ: パス」を出す', () => {
  // 席3が4萬を切り、自分は23萬でチーできる
  const session = open({ hands: ['239m1589p1369s12z', NOTEN, NOTEN, NOTEN] });
  let state = /** @type {GameState} */ (session.state);
  for (let i = 0; i < 3; i++) {
    state = next(state, {
      type: 'discard',
      seat: state.turn,
      tile: /** @type {number} */ (state.players[state.turn].drawn),
    });
    while (state.phase === 'response') state = next(state, { type: 'pass', seat: nextActor(state) });
  }
  const four = state.players[3].hand.find((t) => t >> 2 === kind('4m'));
  state = next(state, { type: 'discard', seat: 3, tile: /** @type {number} */ (four) });
  assert.ok(state.options[ME].some((o) => o.type === 'chi'));
  show(session, state);
  const table = tableHtml(session);
  assert.match(table.html, /おすすめ: パス/);
  assert.match(table.html, /class="act is-primary is-pass">パス（おすすめ）/);
  assert.ok(
    table.buttons.some((a) => a.type === 'chi'),
    'チーのボタンは残す',
  );
  session.stop();
});

test('結果: 初心者モードは一言のまとめを出し、内訳は「詳しく見る」に入れる', () => {
  const session = open({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  show(session, /** @type {GameState} */ (session.state));
  const tsumo = /** @type {GameState} */ (session.state).options[ME].find((o) => o.type === 'tsumo');
  assert.ok(tsumo);
  session.act(tsumo);
  assert.equal(session.ui.resultStep, 3, '段階開示せず、最初から全部入れる');
  const html = roundResultHtml(session);
  assert.match(html, /あなたが .+ で上がりました！/);
  assert.match(html, /もらいました/);
  assert.match(html, /<details class="result-details"><summary>詳しく見る/);
  assert.match(html, /次は: おめでとう/);
  session.stop();
});

test('牌の読み方', () => {
  assert.equal(tileReading(kind('3m')), '3マン');
  assert.equal(tileReading(kind('5p')), '5ピン');
  assert.equal(tileReading(kind('9s')), '9ソー');
  assert.equal(tileReading(kind('1z')), '東');
  assert.equal(tileReading(kind('6z')), '發');
});

test('設定: 初心者モードと牌の名前。古いデータでは初心者モードはオフ・牌の名前はオン', () => {
  const old = migrate({ version: 1, settings: { redDora: true } });
  assert.equal(old?.settings.beginner, false);
  assert.equal(old?.settings.tileNames, true);
  const store = defaultStore();
  store.settings.beginner = true;
  assert.match(homeHtml(store, { corrupted: false, updateReady: false }), /初心者モード: オン/);
  assert.match(homeHtml(store, { corrupted: false, updateReady: false }), /ハル/);
  const settings = settingsHtml(store, true);
  assert.match(settings, /data-id="beginner"/);
  assert.match(settings, /data-id="tileNames"/);
});

test('やさしい相手のミスは局面から決まる（同じ局面なら同じ手。牌譜の再生がずれない）', () => {
  let differs = 0;
  // ミスなしの同じ相手と比べて、最善でない打牌を選ぶ局面がある
  const base = open(null, true);
  let state = /** @type {GameState} */ (base.state);
  base.stop();
  for (let i = 0; i < 40 && state.phase !== 'roundEnd'; i++) {
    const seat = nextActor(state);
    if (seat === -1) break;
    const view = viewFor(state, seat);
    const a = decide(view, GENTLE[0]);
    assert.deepEqual(decide(view, GENTLE[0]), a, '同じ入力には同じ行動');
    if (
      view.phase === 'turn' &&
      JSON.stringify(a) !== JSON.stringify(decide(view, { ...GENTLE[0], mistakeRate: 0 }))
    )
      differs++;
    state = next(state, a);
  }
  assert.ok(differs > 0, 'ときどき最善でない牌を切る');
});

test('卓: 役牌のポンだけは「ポンしても大丈夫」と案内し、パスを勧めない', () => {
  // 席3が中を切り、自分は中を2枚持っている
  const session = open({ hands: ['77z147m258p369s12z', NOTEN, NOTEN, `${JUNK}3457z`] });
  let state = /** @type {GameState} */ (session.state);
  for (let i = 0; i < 3; i++) {
    state = next(state, {
      type: 'discard',
      seat: state.turn,
      tile: /** @type {number} */ (state.players[state.turn].drawn),
    });
    while (state.phase === 'response') state = next(state, { type: 'pass', seat: nextActor(state) });
  }
  const chun = state.players[3].hand.find((t) => t >> 2 === kind('7z'));
  state = next(state, { type: 'discard', seat: 3, tile: /** @type {number} */ (chun) });
  assert.ok(state.options[ME].some((o) => o.type === 'pon'));
  show(session, state);
  const html = tableHtml(session).html;
  assert.match(html, /ポンしても役（役牌）が付きます/);
  assert.doesNotMatch(html, /おすすめ: パス/);
  assert.match(html, /class="act is-quiet is-pass">パス</);
  session.stop();
});

test('卓: 相手のリーチを知らせ、ドラは表示牌と本当のドラを並べる', () => {
  const session = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  const state = /** @type {GameState} */ (session.state);
  show(session, {
    ...state,
    players: state.players.map((p, seat) => (seat === 2 ? { ...p, riichi: 1 } : p)),
  });
  const html = tableHtml(session).html;
  assert.match(html, /ナツがリーチしています/);
  assert.match(html, /ナツにはロンされません/);
  assert.match(html, /ドラ表示/);
  // 表示牌が東ならドラは南
  assert.match(html, /<span class="dora-real">→ ドラ<span class="inline-tiles"><svg[^>]*aria-label="南"/);
  assert.match(html, />引いた牌を捨てる</, '「ツモ切り」は言い換える');
  session.stop();
});

test('ヒント: 「字牌や1・9から」は、勧める牌が字牌・1・9のときだけ言う', () => {
  // 国士無双を目指す手では、真ん中の数字を勧める
  const session = open({ hands: ['19m19p1s12345z468p', NOTEN, NOTEN, NOTEN], live: '6z', dora: '2s' });
  const hint = hintModel(/** @type {GameState} */ (session.state), ME, { plain: true });
  assert.ok(hint);
  const bestKind = /** @type {number} */ (hint.best) >> 2;
  if (bestKind < 27 && bestKind % 9 !== 0 && bestKind % 9 !== 8) {
    assert.doesNotMatch(hint.reason, /字牌や1・9から/);
  }
  session.stop();
});

test('再開: 初心者モードの結果画面で中断していたら、まとめの形で戻る', () => {
  const session = open({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  show(session, /** @type {GameState} */ (session.state));
  const tsumo = /** @type {GameState} */ (session.state).options[ME].find((o) => o.type === 'tsumo');
  session.act(/** @type {import('../src/game/state.js').Action} */ (tsumo));
  const data = { record: session.record, hintUses: 0, hintTotal: 0 };
  session.stop();
  const again = createSession({ onChange: () => {}, delays: FAST });
  assert.ok(again.resume(data));
  assert.equal(again.ui.resultStep, 3);
  assert.match(roundResultHtml(again), /詳しく見る/);
  assert.doesNotMatch(roundResultHtml(again), /まとめて見る/);
  again.stop();
});
