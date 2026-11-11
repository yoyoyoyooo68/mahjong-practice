import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRules } from '../src/core/rules.js';
import { calcPayments, calcPoints, evaluateHand, limitOf, pointsLabel } from '../src/core/score.js';
import { parseTiles } from '../src/core/tiles.js';
import { mulberry32 } from '../src/core/wall.js';
import { meld, win, yakuIds } from './helpers.js';

/** @param {number} han @param {number} fu @param {boolean} dealer @param {boolean} tsumo */
const pts = (han, fu, dealer, tsumo) => calcPoints(limitOf(han, fu).base, dealer, tsumo);

// --- 点数表 ---

test('点数表: 子のロン', () => {
  assert.equal(pts(1, 30, false, false).ron, 1000);
  assert.equal(pts(2, 30, false, false).ron, 2000);
  assert.equal(pts(3, 30, false, false).ron, 3900);
  assert.equal(pts(4, 30, false, false).ron, 7700);
  assert.equal(pts(1, 40, false, false).ron, 1300);
  assert.equal(pts(2, 40, false, false).ron, 2600);
  assert.equal(pts(3, 40, false, false).ron, 5200);
  assert.equal(pts(2, 25, false, false).ron, 1600);
  assert.equal(pts(4, 25, false, false).ron, 6400);
  assert.equal(pts(1, 110, false, false).ron, 3600);
  assert.equal(pts(2, 110, false, false).ron, 7100);
});

test('点数表: 親のロン', () => {
  assert.equal(pts(1, 30, true, false).ron, 1500);
  assert.equal(pts(2, 30, true, false).ron, 2900);
  assert.equal(pts(3, 30, true, false).ron, 5800);
  assert.equal(pts(4, 30, true, false).ron, 11600);
  assert.equal(pts(2, 25, true, false).ron, 2400);
  assert.equal(pts(3, 50, true, false).ron, 9600);
});

test('点数表: ツモ', () => {
  assert.deepEqual(pts(2, 20, false, true), { total: 1500, ron: 0, fromDealer: 700, fromOthers: 400 });
  assert.deepEqual(pts(3, 20, false, true), { total: 2700, ron: 0, fromDealer: 1300, fromOthers: 700 });
  assert.deepEqual(pts(1, 30, false, true), { total: 1100, ron: 0, fromDealer: 500, fromOthers: 300 });
  assert.deepEqual(pts(3, 40, false, true), { total: 5200, ron: 0, fromDealer: 2600, fromOthers: 1300 });
  assert.deepEqual(pts(2, 30, true, true), { total: 3000, ron: 0, fromDealer: 0, fromOthers: 1000 });
  assert.deepEqual(pts(4, 20, true, true), { total: 7800, ron: 0, fromDealer: 0, fromOthers: 2600 });
});

test('満貫以上', () => {
  assert.deepEqual(limitOf(4, 40), { base: 2000, name: '満貫' });
  assert.deepEqual(limitOf(3, 70), { base: 2000, name: '満貫' });
  assert.deepEqual(limitOf(5, 30), { base: 2000, name: '満貫' });
  assert.deepEqual(limitOf(6, 30), { base: 3000, name: '跳満' });
  assert.deepEqual(limitOf(7, 30), { base: 3000, name: '跳満' });
  assert.deepEqual(limitOf(8, 30), { base: 4000, name: '倍満' });
  assert.deepEqual(limitOf(10, 30), { base: 4000, name: '倍満' });
  assert.deepEqual(limitOf(11, 30), { base: 6000, name: '三倍満' });
  assert.deepEqual(limitOf(12, 30), { base: 6000, name: '三倍満' });
  assert.deepEqual(limitOf(13, 30), { base: 8000, name: '数え役満' });
  assert.deepEqual(limitOf(13, 30, createRules({ kazoeYakuman: false })), { base: 6000, name: '三倍満' });
  assert.equal(pts(5, 30, false, false).ron, 8000);
  assert.equal(pts(5, 30, true, false).ron, 12000);
  assert.equal(pts(6, 30, false, false).ron, 12000);
  assert.equal(pts(8, 30, true, false).ron, 24000);
  assert.equal(pts(13, 30, false, false).ron, 32000);
  assert.deepEqual(pts(5, 30, false, true), { total: 8000, ron: 0, fromDealer: 4000, fromOthers: 2000 });
});

test('切り上げ満貫はルールで切り替え（既定はなし）', () => {
  assert.equal(limitOf(4, 30).base, 1920);
  assert.equal(limitOf(3, 60).base, 1920);
  const kiriage = createRules({ kiriageMangan: true });
  assert.deepEqual(limitOf(4, 30, kiriage), { base: 2000, name: '満貫' });
  assert.deepEqual(limitOf(3, 60, kiriage), { base: 2000, name: '満貫' });
});

test('点数の表示', () => {
  assert.equal(pointsLabel(pts(3, 30, false, false), false, false), '3900点');
  assert.equal(pointsLabel(pts(3, 40, false, true), false, true), '1300-2600点');
  assert.equal(pointsLabel(pts(5, 30, true, true), true, true), '4000点オール');
});

// --- 符 ---

test('符: 平和ツモは20符、平和ロンは30符', () => {
  const tsumo = win('234m567p34567s99p', '8s', { tsumo: true });
  assert.equal(tsumo.fu, 20);
  assert.equal(tsumo.han, 2);
  const ron = win('234m567p34567s99p', '8s');
  assert.equal(ron.fu, 30);
  assert.equal(calcPoints(ron.base, false, false).ron, 1000);
});

test('符: 鳴いた平和形のロンは30符', () => {
  const r = win('345p678s4466p', '6p', { melds: [meld('chi', '234m')] });
  // 6筒のシャンポン（明刻2符）→ 22符 → 30符
  assert.equal(r.fu, 30);
  const flat = win('567p34567s88p', '8s', { melds: [meld('chi', '234m')] });
  assert.deepEqual(yakuIds(flat), ['tanyao']);
  assert.equal(flat.fu, 30);
  assert.ok(flat.fuDetails.some((d) => d.label === '喰い平和形'));
});

test('符: 刻子・槓子・雀頭・待ち・門前ロン', () => {
  // 副底20 + 門前ロン10 + 九萬暗槓32 + 一筒暗刻8 + 雀頭(自風の南)2 + ペンチャン2 = 74 → 80符
  const r = win('111p456s22z12s', '3s', { melds: [meld('ankan', '9999m')], riichi: true });
  assert.equal(r.fu, 80);
  assert.deepEqual(
    r.fuDetails.map((d) => d.fu),
    [20, 10, 8, 32, 2, 2],
  );
  assert.equal(r.han, 1);
  assert.equal(calcPoints(r.base, false, false).ron, 2600);

  // 副底20 + 明槓8 + 暗槓16 + 加槓8 + 雀頭(發)2 + 単騎2 = 56 → 60符
  const kans = [meld('minkan', '2222m'), meld('ankan', '3333p'), meld('kakan', '4444s')];
  const sankantsu = win('123m6z', '6z', { melds: kans });
  assert.equal(sankantsu.fu, 60);
  assert.equal(calcPoints(sankantsu.base, false, false).ron, 3900);
});

test('符: 連風牌の雀頭は4符', () => {
  // 親（東家）の東場: 副底20 + 門前ロン10 + 雀頭4 + カンチャン2 = 36 → 40符
  const r = win('234m567p345s68s11z', '7s', { seatWind: 0, riichi: true });
  assert.equal(r.fu, 40);
  assert.equal(r.fuDetails.find((d) => d.label.startsWith('雀頭'))?.fu, 4);
});

test('符: ツモの2符と、ロンで完成した刻子は明刻', () => {
  // ツモ: 20 + 暗刻(1萬)8 + 暗刻(2筒)4 + 暗刻(3索)4 + 暗刻(白)8 + ツモ2 → 四暗刻なので役満
  // ロン: 20 + 10 + 8 + 4 + 4 + 明刻(白)4 = 50符
  const ron = win('111m222p333s44z55z', '5z');
  assert.equal(ron.fu, 50);
  assert.equal(ron.limitName, '満貫');
  // 鳴いてツモ: 20 + 明刻(2萬)2 + 暗刻(6筒)4 + ツモ2 = 28 → 30符
  const openTsumo = win('345p678s4466p', '6p', { melds: [meld('pon', '222m')], tsumo: true });
  assert.equal(openTsumo.fu, 30);
});

// --- ドラ ---

test('ドラ・裏ドラ・赤ドラ', () => {
  const options = { tsumo: true, riichi: true, ippatsu: true, dora: '8p', ura: '1m' };
  const r = win('234m067p345s67s99p', '8s', options);
  assert.deepEqual(r.dora, { dora: 2, ura: 1, red: 1 });
  assert.equal(r.han, 8);
  assert.equal(r.limitName, '倍満');
  assert.deepEqual(calcPoints(r.base, false, true), {
    total: 16000,
    ron: 0,
    fromDealer: 8000,
    fromOthers: 4000,
  });

  // リーチしていなければ裏ドラは数えない
  const noRiichi = win('234m067p345s67s99p', '8s', { tsumo: true, dora: '8p', ura: '1m' });
  assert.deepEqual(noRiichi.dora, { dora: 2, ura: 0, red: 1 });
  // 赤なしルール
  const noRed = win('234m067p345s67s99p', '8s', { tsumo: true, rules: createRules({ redDora: false }) });
  assert.equal(noRed.dora.red, 0);
  // 副露した牌のドラも数える。カンドラは表示牌が複数になる
  const open = win('345p678s4466p', '6p', { melds: [meld('pon', '222m')], dora: '1m1m' });
  assert.equal(open.dora.dora, 6);
});

test('役がなければドラがあっても和了できない', () => {
  const r = win('567p34567s99p', '8s', { melds: [meld('chi', '234m')], dora: '8p' });
  assert.equal(r.valid, false);
  assert.equal(r.han, 0);
  assert.equal(r.base, 0);
});

test('数え役満', () => {
  // 清一色6 + 立直1 + ツモ1 + ドラ(2萬)3 + 裏(9萬)2 = 13翻
  const r = win('222m345m567m88m99m', '9m', { riichi: true, tsumo: true, dora: '1m', ura: '8m' });
  assert.equal(r.yakuman, 0);
  assert.ok(r.han >= 13);
  assert.equal(r.limitName, '数え役満');
  assert.equal(r.base, 8000);
});

test('和了形でなければ null', () => {
  const ids = parseTiles('123m456p789s1123z');
  assert.equal(evaluateHand(ids, [], parseTiles('4z')[0], { tsumo: false, seatWind: 0, roundWind: 0 }), null);
});

test('役満の点数', () => {
  const yakuman = win('777z123m9p', '9p', { melds: [meld('pon', '555z'), meld('pon', '666z')] });
  assert.equal(calcPoints(yakuman.base, false, false).ron, 32000);
  assert.equal(calcPoints(yakuman.base, true, false).ron, 48000);
  const tenhou = win('234m567p34567s99p', '8s', { tsumo: true, seatWind: 0, tenhou: true });
  assert.equal(pointsLabel(calcPoints(tenhou.base, true, true), true, true), '16000点オール');
  const double = win('19m19p19s1234567z', '1m');
  assert.equal(calcPoints(double.base, false, false).ron, 64000);
});

// --- 支払い ---

test('支払い: ロン（本場・供託つき）', () => {
  const base = limitOf(3, 30).base;
  const d = calcPayments({ base, winner: 1, dealer: 0, tsumo: false, loser: 3, honba: 2, kyotaku: 1 });
  assert.deepEqual(d, [0, 3900 + 600 + 1000, 0, -(3900 + 600)]);
});

test('支払い: 親のツモと子のツモ', () => {
  const mangan = limitOf(5, 30).base;
  assert.deepEqual(
    calcPayments({ base: mangan, winner: 0, dealer: 0, tsumo: true, honba: 1 }),
    [12300, -4100, -4100, -4100],
  );
  assert.deepEqual(
    calcPayments({ base: mangan, winner: 2, dealer: 0, tsumo: true }),
    [-4000, -2000, 8000, -2000],
  );
});

test('支払い: ロンは放銃者が必要', () => {
  assert.throws(() => calcPayments({ base: 2000, winner: 1, dealer: 0, tsumo: false }), RangeError);
  assert.throws(() => calcPayments({ base: 2000, winner: 1, dealer: 0, tsumo: false, loser: 1 }), RangeError);
});

test('プロパティ: 点棒の増減の合計は供託ぶんだけ', () => {
  const random = mulberry32(5);
  const hans = [1, 2, 3, 4, 5, 6, 8, 11, 13];
  const fus = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  for (let i = 0; i < 2000; i++) {
    const base = limitOf(
      hans[Math.floor(random() * hans.length)],
      fus[Math.floor(random() * fus.length)],
    ).base;
    const winner = Math.floor(random() * 4);
    const dealer = Math.floor(random() * 4);
    const tsumo = random() < 0.5;
    const loser = (winner + 1 + Math.floor(random() * 3)) % 4;
    const honba = Math.floor(random() * 4);
    const kyotaku = Math.floor(random() * 3);
    const d = calcPayments({ base, winner, dealer, tsumo, loser, honba, kyotaku });
    assert.equal(
      d.reduce((a, b) => a + b, 0),
      kyotaku * 1000,
    );
    assert.ok(d.every((n, seat) => (seat === winner ? n > 0 : n <= 0)));
    assert.ok(d.every((n) => n % 100 === 0));
  }
});
