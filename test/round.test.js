import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kindOf } from '../src/core/tiles.js';
import { createGame, isFuriten, next, remainingTiles, viewFor, waitingSeats } from '../src/game/round.js';
import {
  buildWall,
  discard,
  JUNK,
  kind,
  optionsOf,
  passAll,
  playPassive,
  tsumogiri,
} from './game-helpers.js';

/** @typedef {import('../src/game/state.js').GameState} GameState */

// 親は席0（東家）。席1=南家、席2=西家、席3=北家。
const NOTEN = `${JUNK}3456z`;
/** 2・5・8索待ちの平和テンパイ */
const TENPAI_258S = '234m567p34567s99p';

/** @param {Parameters<typeof buildWall>[0]} spec @param {import('../src/game/state.js').GameConfig} [config] */
const start = (spec, config = {}) => createGame({ ...config, wall: buildWall(spec) });

/** @param {GameState} s */
const yakuOf = (s) => (s.result?.wins ?? []).map((w) => w.hand.yaku.map((y) => y.id).sort());

const NEXT = /** @type {const} */ ({ type: 'nextRound', seat: 0 });

// --- 和了 ---

test('天和: 親の配牌和了は役満。連荘して1本場になる', () => {
  let s = start({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  assert.equal(s.phase, 'turn');
  assert.equal(s.turn, 0);
  assert.equal(optionsOf(s, 0, 'tsumo').length, 1);
  s = next(s, { type: 'tsumo', seat: 0 });
  assert.equal(s.phase, 'roundEnd');
  assert.deepEqual(yakuOf(s), [['tenhou']]);
  assert.deepEqual(s.result?.deltas, [48000, -16000, -16000, -16000]);
  assert.deepEqual(s.scores, [73000, 9000, 9000, 9000]);
  assert.equal(s.result?.renchan, true);
  assert.equal(s.result?.end, false);

  s = next(s, NEXT);
  assert.equal(s.phase, 'turn');
  assert.deepEqual([s.kyoku, s.honba, s.dealer, s.turn], [0, 1, 0, 0]);
  assert.equal(s.players[0].hand.length, 14);
});

test('ロン: 子の和了で親が流れ、本場は0に戻る', () => {
  let s = start({ hands: [`${JUNK}8s345z`, TENPAI_258S, NOTEN, NOTEN] });
  s = discard(s, '8s');
  assert.equal(s.phase, 'response');
  assert.deepEqual(waitingSeats(s), [1]);
  // 67索でチーもできる形。選択肢はロンが先頭、パスが最後
  assert.deepEqual(
    s.options[1].map((o) => o.type),
    ['ron', 'chi', 'pass'],
  );
  s = next(s, { type: 'ron', seat: 1 });
  assert.deepEqual(yakuOf(s), [['pinfu']]);
  assert.equal(s.result?.wins[0].from, 0);
  assert.deepEqual(s.result?.deltas, [-1000, 1000, 0, 0]);
  assert.equal(s.result?.renchan, false);

  s = next(s, NEXT);
  assert.deepEqual([s.kyoku, s.honba, s.dealer, s.turn], [1, 0, 1, 1]);
});

test('ダブロン: 本場と供託は放銃者に近い和了者が受け取る', () => {
  const spec = { hands: [`${JUNK}8s345z`, TENPAI_258S, '234p567m34567s11m', NOTEN] };
  let s = { ...start(spec), honba: 2, kyotaku: 1 };
  s = discard(s, '8s');
  assert.deepEqual(waitingSeats(s), [1, 2]);
  s = next(s, { type: 'ron', seat: 2 });
  assert.equal(s.phase, 'response', '全員の応答がそろうまで解決しない');
  s = next(s, { type: 'ron', seat: 1 });
  assert.equal(s.phase, 'roundEnd');
  assert.deepEqual(
    s.result?.wins.map((w) => w.seat),
    [1, 2],
  );
  assert.deepEqual(s.result?.wins[0].deltas, [-1600, 2600, 0, 0]);
  assert.deepEqual(s.result?.wins[1].deltas, [-1000, 0, 1000, 0]);
  assert.deepEqual(s.result?.deltas, [-2600, 2600, 1000, 0]);
  assert.equal(s.kyotaku, 0);

  // ダブロンなしのルールなら頭ハネ
  let single = start(spec, { rules: { doubleRon: false } });
  single = discard(single, '8s');
  single = next(single, { type: 'ron', seat: 1 });
  single = next(single, { type: 'ron', seat: 2 });
  assert.deepEqual(
    single.result?.wins.map((w) => w.seat),
    [1],
  );
});

test('三家和了は流局（親は流れず1本場）', () => {
  let s = start({ hands: [`${JUNK}8s345z`, TENPAI_258S, '234p567m34567s11m', '234s567m345p67s11p'] });
  s = discard(s, '8s');
  for (const seat of [1, 2, 3]) s = next(s, { type: 'ron', seat });
  assert.equal(s.result?.type, 'draw');
  assert.equal(s.result?.reason, 'sanchahou');
  assert.deepEqual(s.result?.deltas, [0, 0, 0, 0]);
  assert.deepEqual(s.nextInfo, { kyoku: 0, honba: 1, end: false });
});

// --- フリテン ---

test('捨て牌フリテン: 自分で待ち牌を切っているとロンできないが、ツモ和了はできる', () => {
  let s = start({
    hands: [NOTEN, TENPAI_258S, `${JUNK}8s345z`, NOTEN],
    live: '7z5s7z7z7z2s',
  });
  s = tsumogiri(s);
  assert.equal(optionsOf(s, 1, 'tsumo').length, 1, '5索でツモ和了できる');
  s = tsumogiri(s); // 和了せずに5索を切る
  assert.equal(isFuriten(s, 1), true);
  s = discard(s, '8s');
  assert.equal(s.phase, 'turn', '席1にロンの選択肢が出ない');
  assert.equal(s.turn, 3);
  s = tsumogiri(tsumogiri(s));
  assert.equal(s.turn, 1);
  assert.equal(optionsOf(s, 1, 'tsumo').length, 1, 'フリテンでも2索でツモ和了できる');
});

test('同巡内フリテン: 見逃すと次の自分のツモまでロンできない', () => {
  let s = start({
    hands: [NOTEN, TENPAI_258S, `${JUNK}28s34z`, `${JUNK}8s345z`],
    live: '7z7z7z7z1z1z1z',
  });
  s = tsumogiri(tsumogiri(s));
  s = discard(s, '8s');
  assert.equal(optionsOf(s, 1, 'ron').length, 1);
  s = next(s, { type: 'pass', seat: 1 });
  assert.equal(s.players[1].furitenTemp, true);
  assert.equal(s.turn, 3);
  s = discard(s, '8s');
  assert.equal(s.phase, 'turn', '同巡なのでロンの選択肢が出ない');
  assert.equal(s.turn, 0);
  s = tsumogiri(s);
  assert.equal(s.turn, 1);
  assert.equal(s.players[1].furitenTemp, false, '自分のツモで解除');
  s = tsumogiri(s);
  s = discard(s, '2s');
  assert.equal(optionsOf(s, 1, 'ron').length, 1);
  s = next(s, { type: 'ron', seat: 1 });
  assert.equal(s.result?.wins[0].seat, 1);
});

test('リーチ: 1000点を供託し、以後はツモ切りだけ。見逃すと局の終わりまでフリテン', () => {
  let s = start({
    hands: [NOTEN, TENPAI_258S, `${JUNK}28s34z`, `${JUNK}8s345z`],
    live: '7z7z7z7z1z1z1z1z',
  });
  s = tsumogiri(s);
  assert.ok(
    optionsOf(s, 1, 'discard').some((o) => o.riichi),
    'リーチできる',
  );
  s = passAll(discard(s, undefined, true));
  assert.equal(s.players[1].riichi, 2, '1巡目なのでダブル立直');
  assert.equal(s.players[1].ippatsu, true);
  assert.equal(s.scores[1], 24000);
  assert.equal(s.kyotaku, 1);
  assert.equal(s.players[1].discards[0].riichi, true);

  s = discard(s, '8s');
  assert.equal(optionsOf(s, 1, 'ron').length, 1);
  s = next(s, { type: 'pass', seat: 1 });
  assert.equal(s.players[1].furitenPerm, true);
  s = tsumogiri(tsumogiri(s));
  assert.equal(s.turn, 1);
  assert.deepEqual(
    s.options[1].map((o) => [o.type, o.tile, Boolean(o.riichi)]),
    [['discard', s.players[1].drawn, false]],
    'リーチ後はツモ切りだけ',
  );
  s = tsumogiri(s);
  assert.equal(s.players[1].ippatsu, false, '自分の打牌で一発は消える');
  s = discard(s, '2s');
  assert.equal(s.phase, 'turn', 'リーチ後の見逃しはずっとフリテン');
  assert.equal(s.turn, 3);
});

// --- カン ---

test('槍槓: 加槓した牌でロンできる（カンドラはめくられない）', () => {
  // 赤5筒は席1のポンに入れておく（あとで引く4枚目が赤だと、ロンした側に赤ドラが付くため）
  let s = start({
    hands: [`${JUNK}3z5z7z1p`, '05p147m369s22z3z4z7z', '123m789s111z34p99m', '147m28p369s3z4z5z5z7z'],
    live: '6z6z6z6z5p',
    dora: '7z',
  });
  s = discard(s, '5p');
  assert.deepEqual(waitingSeats(s), [1, 2]);
  const pon = optionsOf(s, 1, 'pon')[0];
  assert.ok(pon);
  s = next(s, pon);
  s = next(s, { type: 'pass', seat: 2 }); // 席2は見逃す
  assert.equal(s.turn, 1);
  assert.equal(s.players[1].melds[0].type, 'pon');
  assert.equal(s.players[1].drawn, null);
  assert.equal(s.players[0].discards[0].called, true);
  assert.ok(
    optionsOf(s, 1, 'discard').every((o) => kindOf(/** @type {number} */ (o.tile)) !== kind('5p')),
    'ポンした牌と同じ牌は切れない',
  );
  s = passAll(discard(s, '2z'));
  s = playPassive(s, (x) => x.turn === 1);
  const kakan = optionsOf(s, 1, 'kakan')[0];
  assert.ok(kakan);
  s = next(s, kakan);
  assert.equal(s.phase, 'response');
  assert.deepEqual(
    s.options[2].map((o) => o.type),
    ['ron', 'pass'],
  );
  s = next(s, { type: 'ron', seat: 2 });
  assert.deepEqual(yakuOf(s), [['bakaze', 'chankan']]);
  assert.equal(s.result?.wins[0].hand.fu, 40);
  assert.deepEqual(s.result?.deltas, [0, -2600, 2600, 0]);
  assert.equal(s.doraRevealed, 1);
});

test('暗槓: カンドラを即めくり、嶺上牌で和了すると嶺上開花', () => {
  const others = '2468m2468p2468s5z';
  let s = start({
    hands: ['1111m456p789s23s9p', others, others, others],
    live: '9p',
    rinshan: '4s',
    dora: '7z7z',
  });
  assert.equal(optionsOf(s, 0, 'tsumo').length, 0);
  const ankan = optionsOf(s, 0, 'ankan')[0];
  assert.equal(ankan.kind, kind('1m'));
  s = next(s, ankan);
  assert.equal(s.phase, 'turn');
  assert.equal(s.doraRevealed, 2);
  assert.equal(s.kanCount, 1);
  assert.equal(s.players[0].melds[0].type, 'ankan');
  assert.equal(remainingTiles(s), 68, 'ツモ山は親の第1ツモとカンの1枚ぶん減る');
  s = next(s, { type: 'tsumo', seat: 0 });
  // 暗槓は門前のまま。天和は付かない
  assert.deepEqual(yakuOf(s), [['rinshan', 'tsumo']]);
  assert.equal(s.result?.wins[0].hand.fu, 60);
  assert.deepEqual(s.result?.deltas, [6000, -2000, -2000, -2000]);
});

// --- 途中流局 ---

test('九種九牌', () => {
  let s = start({ hands: ['19m19p19s123z2468m', NOTEN, NOTEN, NOTEN] });
  assert.equal(optionsOf(s, 0, 'kyuushu').length, 1);
  s = next(s, { type: 'kyuushu', seat: 0 });
  assert.equal(s.result?.reason, 'kyuushu');
  assert.deepEqual(s.nextInfo, { kyoku: 0, honba: 1, end: false });
  // 九種に届かない手では宣言できない
  assert.equal(optionsOf(start({ hands: [NOTEN, NOTEN, NOTEN, NOTEN] }), 0, 'kyuushu').length, 0);
});

test('四風連打', () => {
  const hand = `${JUNK}3456z`;
  let s = start({ hands: [hand, hand, hand, hand] });
  for (let i = 0; i < 3; i++) {
    s = passAll(discard(s, '3z'));
    assert.equal(s.phase, 'turn');
  }
  s = passAll(discard(s, '3z'));
  assert.equal(s.result?.reason, 'suufon');
  assert.equal(s.result?.renchan, true);
});

test('四家立直: 供託は次の局に持ち越す', () => {
  let s = start({
    hands: ['234m567m345p67p88s', '234m567m345s67s88p', '123p456p789p12s99m', '123s456s789s11z99p'],
    live: '4z4z4z4z',
  });
  for (let i = 0; i < 4; i++) {
    assert.equal(s.phase, 'turn');
    s = passAll(discard(s, undefined, true));
  }
  assert.equal(s.result?.reason, 'suucha');
  assert.deepEqual(s.scores, [24000, 24000, 24000, 24000]);
  assert.equal(s.kyotaku, 4);
  s = next(s, NEXT);
  assert.deepEqual([s.kyoku, s.honba, s.kyotaku, s.dealer], [0, 1, 4, 0]);
});

test('四開槓: 2人で4回カンすると、次の打牌が通った時点で流局', () => {
  const others = '68m2468p2468s567z';
  let s = start({
    hands: ['1111m2222m57p57s9p', '3333m4444m57p57s9p', others, others],
    live: '1z1z',
  });
  s = next(s, { type: 'ankan', seat: 0, kind: kind('1m') });
  s = next(s, { type: 'ankan', seat: 0, kind: kind('2m') });
  assert.equal(s.suukanPending, false);
  s = tsumogiri(s);
  assert.equal(s.turn, 1);
  s = next(s, { type: 'ankan', seat: 1, kind: kind('3m') });
  s = next(s, { type: 'ankan', seat: 1, kind: kind('4m') });
  assert.equal(s.kanCount, 4);
  assert.equal(s.doraRevealed, 5);
  assert.equal(s.suukanPending, true);
  assert.equal(optionsOf(s, 1, 'ankan').length, 0, '5回目のカンはできない');
  s = tsumogiri(s);
  assert.equal(s.result?.reason, 'suukan');
});

// --- 荒牌平局 ---

test('荒牌平局: ノーテン罰符。親がノーテンなら親が流れて1本場', () => {
  let s = start({ hands: [NOTEN, TENPAI_258S, NOTEN, NOTEN] });
  s = playPassive(s);
  assert.equal(s.result?.reason, 'exhaustive');
  assert.deepEqual(s.result?.tenpai, [false, true, false, false]);
  assert.deepEqual(s.result?.nagashi, []);
  assert.deepEqual(s.result?.deltas, [-1000, 3000, -1000, -1000]);
  assert.deepEqual(
    s.players.map((p) => p.discards.length),
    [18, 18, 17, 17],
  );
  assert.deepEqual(s.nextInfo, { kyoku: 1, honba: 1, end: false });
});

test('荒牌平局: 親がテンパイなら連荘', () => {
  let s = start({ hands: [TENPAI_258S, NOTEN, NOTEN, NOTEN] });
  s = playPassive(s);
  assert.deepEqual(s.result?.deltas, [3000, -1000, -1000, -1000]);
  assert.deepEqual(s.nextInfo, { kyoku: 0, honba: 1, end: false });
});

test('海底摸月: 最後のツモ牌で和了', () => {
  let s = start({ hands: [NOTEN, TENPAI_258S, NOTEN, NOTEN], liveEnd: '2s' });
  s = playPassive(s, (x) => remainingTiles(x) === 0);
  assert.equal(s.turn, 1, '最後の牌を引くのは南家');
  assert.equal(optionsOf(s, 1, 'ankan').length + optionsOf(s, 1, 'kakan').length, 0);
  s = next(s, { type: 'tsumo', seat: 1 });
  assert.ok(yakuOf(s)[0].includes('haitei'));
});

test('河底撈魚: 最後の捨て牌でロン。最後の牌は鳴けない', () => {
  const noten = `${JUNK}2s345z`;
  let s = start({ hands: [noten, noten, '123m456p789m13s11z', noten], liveEnd: '2s' });
  s = playPassive(s, (x) => remainingTiles(x) === 0);
  s = discard(s);
  assert.deepEqual(waitingSeats(s), [2]);
  assert.deepEqual(
    s.options[2].map((o) => o.type),
    ['ron', 'pass'],
  );
  s = next(s, { type: 'ron', seat: 2 });
  assert.deepEqual(yakuOf(s), [['houtei']]);
  assert.equal(s.result?.wins[0].from, 1);
});

test('流し満貫: 満貫ツモと同じ支払い。ノーテン罰符はなし', () => {
  const yaochu = [
    '1m',
    '9m',
    '1p',
    '9p',
    '1s',
    '9s',
    '1z',
    '2z',
    '3z',
    '4z',
    '5z',
    '6z',
    '7z',
    '1m',
    '9m',
    '1p',
    '9p',
    '1s',
  ];
  /** @type {Record<number, string>} */
  const liveAt = {};
  yaochu.forEach((t, i) => {
    liveAt[i * 4] = t;
  });
  const base = '2468m2468p2468s';
  let s = start({ hands: [`${base}5m`, `${base}5p`, `${base}5s`, `${base}5m`], liveAt });
  s = playPassive(s);
  assert.equal(s.result?.reason, 'exhaustive');
  assert.deepEqual(s.result?.nagashi, [0]);
  assert.deepEqual(s.result?.deltas, [12000, -4000, -4000, -4000]);
  assert.deepEqual(s.nextInfo, { kyoku: 1, honba: 1, end: false });
});

// --- 鳴き ---

test('チー: 上家からだけ鳴ける。食い替え（現物・スジ）は切れない', () => {
  let s = start({ hands: [NOTEN, '1234m258p369s345z', NOTEN, NOTEN] });
  s = discard(s, '4m');
  assert.deepEqual(waitingSeats(s), [1], '下家だけがチーできる');
  const chi = optionsOf(s, 1, 'chi');
  assert.equal(chi.length, 1);
  assert.deepEqual(chi[0].tiles?.map(kindOf), [kind('2m'), kind('3m')]);
  s = next(s, chi[0]);
  assert.equal(s.turn, 1);
  assert.equal(s.uninterrupted, false);
  const kinds = optionsOf(s, 1, 'discard').map((o) => kindOf(/** @type {number} */ (o.tile)));
  assert.ok(!kinds.includes(kind('4m')), '鳴いた牌と同じ牌は切れない');
  assert.ok(!kinds.includes(kind('1m')), '反対側のスジも切れない');
  assert.ok(kinds.includes(kind('2p')));
  assert.equal(optionsOf(s, 1, 'tsumo').length + optionsOf(s, 1, 'ankan').length, 0);
  assert.ok(!s.options[1].some((o) => o.riichi), '鳴いたらリーチできない');
});

// --- 対局の終了 ---

test('飛び終了: 持ち点が0未満になったら終了', () => {
  let s = {
    ...start({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' }),
    scores: [55000, 15000, 15000, 15000],
  };
  s = next(s, { type: 'tsumo', seat: 0 });
  assert.equal(s.result?.end, true);
  s = next(s, NEXT);
  assert.equal(s.phase, 'gameEnd');
  assert.equal(s.ranking[0], 0);
  assert.throws(() => next(s, NEXT));
});

test('オーラス: 子が和了すれば終了。親がトップで和了すればアガリ止め', () => {
  const ronSpec = { hands: [`${JUNK}8s345z`, TENPAI_258S, NOTEN, NOTEN] };
  let s = { ...start(ronSpec), kyoku: 3 };
  s = next(discard(s, '8s'), { type: 'ron', seat: 1 });
  assert.equal(s.result?.end, true);

  const tenhou = { hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' };
  let top = { ...start(tenhou), kyoku: 3 };
  top = next(top, { type: 'tsumo', seat: 0 });
  assert.equal(top.result?.end, true, '親がトップなので終了');

  let noYame = { ...start(tenhou, { rules: { agariYame: false } }), kyoku: 3 };
  noYame = next(noYame, { type: 'tsumo', seat: 0 });
  assert.equal(noYame.result?.end, false, 'アガリ止めなしなら続行');
  assert.deepEqual(noYame.nextInfo, { kyoku: 3, honba: 1, end: false });
});

test('オーラス: 親が和了してもトップでなければ続行', () => {
  const others = '2468m2468p2468s5z';
  let s = start({
    hands: ['1111m456p789s23s9p', others, others, others],
    live: '9p',
    rinshan: '4s',
    dora: '7z7z',
  });
  s = { ...s, kyoku: 3, scores: [10000, 50000, 20000, 20000] };
  s = next(s, { type: 'ankan', seat: 0, kind: kind('1m') });
  s = next(s, { type: 'tsumo', seat: 0 });
  assert.deepEqual(s.scores, [16000, 48000, 18000, 18000]);
  assert.equal(s.result?.end, false);
});

test('終了時に残った供託はトップが受け取る', () => {
  let s = {
    ...start({ hands: [NOTEN, TENPAI_258S, NOTEN, NOTEN] }),
    kyoku: 3,
    kyotaku: 2,
    scores: [23000, 25000, 25000, 25000],
  };
  s = playPassive(s);
  assert.equal(s.result?.end, true);
  assert.equal(s.result?.kyotakuTo, 1);
  assert.deepEqual(s.scores, [22000, 30000, 24000, 24000]);
  assert.equal(s.kyotaku, 0);
});

// --- その他 ---

test('合法手でない行動は例外になる。元の状態は書き換わらない', () => {
  const s = start({ hands: [NOTEN, NOTEN, NOTEN, NOTEN] });
  const before = JSON.stringify(s);
  assert.throws(
    () => next(s, { type: 'discard', seat: 1, tile: s.players[1].hand[0] }),
    /合法手ではありません/,
  );
  assert.throws(() => next(s, { type: 'tsumo', seat: 0 }), /合法手ではありません/);
  assert.throws(() => next(s, NEXT), /合法手ではありません/);
  const after = tsumogiri(s);
  assert.notEqual(after, s);
  assert.equal(JSON.stringify(s), before);
});

test('viewFor: 他家の手牌・山・裏ドラを含まない', () => {
  const s = start({ hands: [NOTEN, TENPAI_258S, NOTEN, NOTEN] });
  const view = viewFor(s, 1);
  assert.deepEqual(view.hand, s.players[1].hand);
  assert.equal(view.seatWind, 1);
  assert.equal(view.doraIndicators.length, 1);
  assert.deepEqual(Object.keys(view.players[0]).sort(), ['discards', 'handCount', 'melds', 'riichi']);
  const text = JSON.stringify(view);
  for (const key of ['live', 'rinshan', 'uraIndicators', 'furiten']) assert.ok(!text.includes(key), key);
});
