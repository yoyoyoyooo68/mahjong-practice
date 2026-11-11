import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRules } from '../src/core/rules.js';
import { SPECIAL_YAKU, YAKU } from '../src/core/yaku.js';
import { meld, win, yakuIds } from './helpers.js';

// 既定は「子（南家）・東場・ロン」

test('役データ: id が重複せず、名前・読み・説明がそろっている', () => {
  const ids = [...YAKU, ...SPECIAL_YAKU].map((y) => y.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const y of YAKU) {
    assert.ok(y.name && y.yomi && y.desc, y.id);
    assert.equal(y.yakuman, y.han === 13, y.id);
    assert.ok(y.openHan <= y.han, y.id);
  }
});

// --- 1翻 ---

test('立直・一発・門前清自摸和・平和', () => {
  const r = win('234m567p34567s99p', '8s', { tsumo: true, riichi: true, ippatsu: true });
  assert.deepEqual(yakuIds(r), ['ippatsu', 'pinfu', 'riichi', 'tsumo']);
  // リーチなしの一発は付かない
  assert.deepEqual(yakuIds(win('234m567p34567s99p', '8s', { ippatsu: true })), ['pinfu']);
});

test('平和: 反例（カンチャン待ち・役牌の雀頭・鳴き）', () => {
  assert.deepEqual(yakuIds(win('234m567p345s68s99p', '7s', { riichi: true })), ['riichi']);
  // 雀頭が場風（東）
  assert.deepEqual(yakuIds(win('234m567p34567s11z', '8s', { riichi: true })), ['riichi']);
  // 雀頭が自風（南）
  assert.deepEqual(yakuIds(win('234m567p34567s22z', '8s', { riichi: true })), ['riichi']);
  // 客風（西）の雀頭なら平和
  assert.deepEqual(yakuIds(win('234m567p34567s33z', '8s', { riichi: true })), ['pinfu', 'riichi']);
  // 鳴くと役なし
  const open = win('567p34567s99p', '8s', { melds: [meld('chi', '234m')] });
  assert.equal(open.valid, false);
  assert.deepEqual(open.yaku, []);
});

test('断么九: 喰いタンあり／なし', () => {
  const melds = [meld('pon', '222m')];
  const r = win('345p678s4466p', '6p', { melds });
  assert.deepEqual(yakuIds(r), ['tanyao']);
  const noKuitan = win('345p678s4466p', '6p', { melds, rules: createRules({ kuitan: false }) });
  assert.equal(noKuitan.valid, false);
  // 門前ならルールによらず成立
  const closed = win('222m345p678s4466p', '6p', { rules: createRules({ kuitan: false }) });
  assert.ok(yakuIds(closed).includes('tanyao'));
});

test('一盃口は門前限定', () => {
  assert.deepEqual(yakuIds(win('223344m789p13s99p', '2s')), ['iipeikou']);
  const open = win('234m789p99p12s', '3s', { melds: [meld('chi', '234m')] });
  assert.equal(open.valid, false);
});

test('役牌: 三元牌・自風・場風', () => {
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds: [meld('pon', '555z')] })), ['haku']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds: [meld('pon', '666z')] })), ['hatsu']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds: [meld('pon', '777z')] })), ['chun']);
  // 南家の南は自風、東場の東は場風
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds: [meld('pon', '222z')] })), ['jikaze']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds: [meld('pon', '111z')] })), ['bakaze']);
  // 親の東はダブ東で2翻
  const dabuTon = win('234m567p88s34s', '5s', { melds: [meld('pon', '111z')], seatWind: 0 });
  assert.deepEqual(yakuIds(dabuTon), ['bakaze', 'jikaze']);
  assert.equal(dabuTon.han, 2);
  // 客風は役にならない
  assert.equal(win('234m567p88s34s', '5s', { melds: [meld('pon', '444z')] }).valid, false);
});

test('嶺上開花・槍槓・海底・河底', () => {
  const melds = [meld('pon', '444z')];
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds, tsumo: true, rinshan: true })), ['rinshan']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds, chankan: true })), ['chankan']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds, tsumo: true, haitei: true })), ['haitei']);
  assert.deepEqual(yakuIds(win('234m567p88s34s', '5s', { melds, houtei: true })), ['houtei']);
});

// --- 2翻 ---

test('ダブル立直は立直と重ならない', () => {
  const r = win('234m567p345s68s99p', '7s', { riichi: true, doubleRiichi: true });
  assert.deepEqual(yakuIds(r), ['doubleRiichi']);
  assert.equal(r.han, 2);
});

test('七対子', () => {
  const r = win('113355m7799p11z2z', '2z');
  assert.deepEqual(yakuIds(r), ['chiitoi']);
  assert.equal(r.fu, 25);
  // 断么九・混一色とは複合する
  assert.deepEqual(yakuIds(win('2244668m224466p', '8m')), ['chiitoi', 'tanyao']);
  assert.deepEqual(yakuIds(win('1133557799m11z2z', '2z')), ['chiitoi', 'honitsu']);
});

test('三色同順・一気通貫・全帯么九は鳴くと1翻下がる', () => {
  const sanshoku = win('234m234p234s789m9p', '9p');
  assert.deepEqual(yakuIds(sanshoku), ['sanshokuDoujun']);
  assert.equal(sanshoku.han, 2);
  const sanshokuOpen = win('234p234s789m9p', '9p', { melds: [meld('chi', '234m')] });
  assert.equal(sanshokuOpen.han, 1);

  const ittsu = win('123456789m11p78s', '9s');
  assert.deepEqual(yakuIds(ittsu), ['ittsu', 'pinfu']);
  const ittsuOpen = win('456789m11p78s', '9s', { melds: [meld('chi', '123m')] });
  assert.deepEqual(yakuIds(ittsuOpen), ['ittsu']);
  assert.equal(ittsuOpen.han, 1);

  const chanta = win('123m789p999s11z12s', '3s');
  assert.deepEqual(yakuIds(chanta), ['chanta']);
  assert.equal(chanta.han, 2);
  const chantaOpen = win('789p999s11z12s', '3s', { melds: [meld('chi', '123m')] });
  assert.equal(chantaOpen.han, 1);
});

test('純全帯么九 + 三色同順', () => {
  const r = win('123m123p123s789m9p', '9p');
  assert.deepEqual(yakuIds(r), ['junchan', 'sanshokuDoujun']);
  assert.equal(r.han, 5);
  const open = win('123p123s789m9p', '9p', { melds: [meld('chi', '123m')] });
  assert.deepEqual(yakuIds(open), ['junchan', 'sanshokuDoujun']);
  assert.equal(open.han, 3);
});

test('対々和・三暗刻・役牌（ロンのシャンポンは明刻）', () => {
  const r = win('111m222p333s44z55z', '5z');
  assert.deepEqual(yakuIds(r), ['haku', 'sanankou', 'toitoi']);
  assert.equal(r.han, 5);
});

test('三暗刻 vs 一盃口: 点数の高い三暗刻を採用する', () => {
  const r = win('111222333m456p9s', '9s');
  assert.deepEqual(yakuIds(r), ['sanankou']);
  assert.equal(r.fu, 50);
});

test('二盃口 vs 七対子: 二盃口を採用する', () => {
  const r = win('112233m445566p7s', '7s');
  assert.deepEqual(yakuIds(r), ['ryanpeikou']);
  assert.equal(r.han, 3);
  assert.equal(r.fu, 40);
});

test('三色同刻・三槓子・小三元・混老頭', () => {
  const doukou = win('222m222p345m9s', '9s', { melds: [meld('pon', '222s')] });
  assert.deepEqual(yakuIds(doukou), ['sanshokuDoukou']);

  const kans = [meld('minkan', '2222m'), meld('ankan', '3333p'), meld('kakan', '4444s')];
  const sankantsu = win('123m6z', '6z', { melds: kans });
  assert.deepEqual(yakuIds(sankantsu), ['sankantsu']);

  const shousangen = win('666z77z123m45p', '6p', { melds: [meld('pon', '555z')] });
  assert.deepEqual(yakuIds(shousangen), ['haku', 'hatsu', 'shousangen']);
  assert.equal(shousangen.han, 4);

  const honroutou = win('111z99s11p', '1p', { melds: [meld('pon', '111m'), meld('pon', '999p')] });
  assert.deepEqual(yakuIds(honroutou), ['bakaze', 'honroutou', 'toitoi']);
  assert.equal(honroutou.han, 5);
  // 七対子の混老頭
  assert.deepEqual(yakuIds(win('1199m1199p1122z3z', '3z')), ['chiitoi', 'honroutou']);
});

// --- 3翻・6翻 ---

test('混一色・清一色', () => {
  const honitsu = win('123456789m5z', '5z', { melds: [meld('pon', '111z')] });
  assert.deepEqual(yakuIds(honitsu), ['bakaze', 'honitsu', 'ittsu']);
  assert.equal(honitsu.han, 4);

  const chinitsu = win('222m345m567m88m99m', '9m');
  assert.deepEqual(yakuIds(chinitsu), ['chinitsu']);
  assert.equal(chinitsu.han, 6);
  const chinitsuOpen = win('345m567m88m99m', '9m', { melds: [meld('pon', '222m')] });
  assert.equal(chinitsuOpen.han, 5);
});

// --- 役満 ---

test('国士無双', () => {
  const single = win('19m19p19s1234566z', '7z');
  assert.deepEqual(yakuIds(single), ['kokushi']);
  assert.equal(single.yakuman, 1);
  const thirteen = win('19m19p19s1234567z', '1m');
  assert.equal(thirteen.yakuman, 2);
  assert.equal(thirteen.yaku[0].name, '国士無双十三面待ち');
  assert.equal(thirteen.limitName, 'ダブル役満');
  // ダブル役満なしのルール
  const noDouble = win('19m19p19s1234567z', '1m', { rules: createRules({ doubleYakuman: false }) });
  assert.equal(noDouble.yakuman, 1);
  assert.equal(noDouble.yaku[0].name, '国士無双');
});

test('四暗刻: ツモのシャンポンは役満、単騎はダブル、ロンのシャンポンは不成立', () => {
  assert.equal(win('111m222p333s44z55z', '5z', { tsumo: true }).yakuman, 1);
  const tanki = win('111m222p333s444z5z', '5z');
  assert.equal(tanki.yakuman, 2);
  assert.equal(tanki.yaku[0].name, '四暗刻単騎');
  assert.equal(win('111m222p333s44z55z', '5z').yakuman, 0);
});

test('大三元・小四喜・大四喜・字一色', () => {
  const daisangen = win('777z123m9p', '9p', { melds: [meld('pon', '555z'), meld('pon', '666z')] });
  assert.deepEqual(yakuIds(daisangen), ['daisangen']);

  const shousuushii = win('333z4z123m', '4z', { melds: [meld('pon', '111z'), meld('pon', '222z')] });
  assert.deepEqual(yakuIds(shousuushii), ['shousuushii']);
  assert.equal(shousuushii.yakuman, 1);

  const daisuushii = win('333z444z5m', '5m', { melds: [meld('pon', '111z'), meld('pon', '222z')] });
  assert.deepEqual(yakuIds(daisuushii), ['daisuushii']);
  assert.equal(daisuushii.yakuman, 2);

  // 字一色 + 大四喜（単騎でもロン牌以外は鳴いているので四暗刻ではない）
  const both = win('333z444z5z', '5z', { melds: [meld('pon', '111z'), meld('pon', '222z')] });
  assert.deepEqual(yakuIds(both), ['daisuushii', 'tsuuiisou']);
  assert.equal(both.yakuman, 3);
  assert.equal(both.limitName, 'トリプル役満');

  // 七対子形の字一色
  assert.deepEqual(yakuIds(win('1122334455667z', '7z')), ['tsuuiisou']);
});

test('清老頭・緑一色・四槓子', () => {
  const chinroutou = win('111m999p1s', '1s', { melds: [meld('pon', '999m'), meld('pon', '111p')] });
  assert.deepEqual(yakuIds(chinroutou), ['chinroutou']);

  const ryuuiisou = win('223344666888s6z', '6z');
  assert.deepEqual(yakuIds(ryuuiisou), ['ryuuiisou']);
  // 5索が混ざると緑一色ではない
  assert.equal(win('234s456s666888s6z', '6z').yakuman, 0);

  const kans = [
    meld('minkan', '2222m'),
    meld('ankan', '3333p'),
    meld('kakan', '4444s'),
    meld('ankan', '1111z'),
  ];
  assert.deepEqual(yakuIds(win('6z', '6z', { melds: kans })), ['suukantsu']);
});

test('九蓮宝燈', () => {
  const junsei = win('1112345678999m', '5m', { tsumo: true });
  assert.deepEqual(yakuIds(junsei), ['chuuren']);
  assert.equal(junsei.yakuman, 2);
  assert.equal(junsei.yaku[0].name, '純正九蓮宝燈');
  assert.equal(win('1112345678999m', '1m').yakuman, 2);

  const normal = win('1112345678899m', '9m');
  assert.deepEqual(yakuIds(normal), ['chuuren']);
  assert.equal(normal.yakuman, 1);

  // 鳴いていたら清一色どまり
  const open = win('2345678899m', '9m', { melds: [meld('pon', '111m')] });
  assert.equal(open.yakuman, 0);
  assert.ok(yakuIds(open).includes('chinitsu'));
});

test('天和・地和', () => {
  const tenhou = win('234m567p34567s99p', '8s', { tsumo: true, seatWind: 0, tenhou: true });
  assert.deepEqual(yakuIds(tenhou), ['tenhou']);
  const chiihou = win('234m567p34567s99p', '8s', { tsumo: true, chiihou: true });
  assert.deepEqual(yakuIds(chiihou), ['chiihou']);
  // 役満のときは通常役・ドラを数えない
  assert.equal(chiihou.han, 0);
  assert.deepEqual(chiihou.dora, { dora: 0, ura: 0, red: 0 });
});
