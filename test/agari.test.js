import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decompose, enumerateShapes, isAgari, meldToGroup } from '../src/core/agari.js';
import { shanten } from '../src/core/shanten.js';
import { kindOf, parseTiles, toCounts } from '../src/core/tiles.js';
import { createWall, mulberry32 } from '../src/core/wall.js';
import { meld } from './helpers.js';

/** @param {string} text */
const counts = (text) => toCounts(parseTiles(text));
/** @param {string} text */
const kind = (text) => kindOf(parseTiles(text)[0]);

test('和了形でなければ分解は空', () => {
  assert.deepEqual(decompose(counts('123m456p789s1123z')), []);
  assert.ok(!isAgari(counts('123m456p789s1123z')));
  assert.ok(isAgari(counts('123m456p789s11222z')));
});

test('三連刻は「刻子3つ」と「順子3つ」の2通り', () => {
  const list = decompose(counts('111222333m456p99s'));
  assert.equal(list.length, 2);
  const types = list.map((d) => (d.form === 'normal' ? d.sets.map((s) => s.type).join(',') : d.form));
  assert.deepEqual(types.sort(), ['koutsu,koutsu,koutsu,shuntsu', 'shuntsu,shuntsu,shuntsu,shuntsu']);
});

test('二盃口の形は通常形と七対子の両方が出る', () => {
  const forms = decompose(counts('112233m445566p77s')).map((d) => d.form);
  assert.deepEqual(forms.sort(), ['chiitoi', 'normal']);
});

test('九蓮宝燈の形は和了牌ごとに分解できる', () => {
  for (let n = 1; n <= 9; n++) {
    assert.ok(decompose(counts(`1112345678999m${n}m`)).length >= 1, `${n}萬`);
  }
});

test('国士無双', () => {
  const list = decompose(counts('19m19p19s12345677z'));
  assert.deepEqual(list, [{ form: 'kokushi', pair: kind('7z') }]);
  assert.deepEqual(decompose(counts('19m19p19s1234567z2m')), []);
});

test('同じ牌4枚を含む七対子形は和了ではない', () => {
  assert.deepEqual(decompose(counts('1111m223344p5566s')), []);
});

test('副露があると手の内の面子数が減る', () => {
  const list = decompose(counts('123m55z'), 3);
  assert.equal(list.length, 1);
  assert.equal(decompose(counts('123m55z'), 2).length, 0);
  assert.deepEqual(meldToGroup(meld('chi', '324m')), { type: 'shuntsu', kind: kind('2m'), open: true });
  assert.deepEqual(meldToGroup(meld('ankan', '1111z')), { type: 'kantsu', kind: 27, open: false });
  assert.deepEqual(meldToGroup(meld('kakan', '5555p')), { type: 'kantsu', kind: kind('5p'), open: true });
});

test('待ちの形', () => {
  /** @param {string} hand @param {string} w @param {boolean} [tsumo] */
  const waits = (hand, w, tsumo = false) =>
    enumerateShapes(counts(hand + w), [], kind(w), tsumo)
      .map((s) => s.wait)
      .sort();
  assert.deepEqual(waits('123m456p789s23s11z', '4s'), ['ryanmen']);
  assert.deepEqual(waits('123m456p789s13s11z', '2s'), ['kanchan']);
  assert.deepEqual(waits('123m456p789s12s11z', '3s'), ['penchan']);
  assert.deepEqual(waits('123m456p789s89s11z', '7s'), ['penchan']);
  assert.deepEqual(waits('123m456p789s11s11z', '1z'), ['shanpon']);
  assert.deepEqual(waits('123m456p789s111s1z', '1z'), ['tanki']);
  // 3334 は 4 なら単騎、2・5 なら両面
  assert.deepEqual(waits('123m456p789s3334s', '4s'), ['tanki']);
  assert.deepEqual(waits('123m456p789s3334s', '5s'), ['ryanmen']);
  // 同じ順子が2つあっても解釈は重複させない
  assert.deepEqual(waits('223344m456p78s11z', '9s'), ['ryanmen']);
  assert.deepEqual(waits('19m19p19s1234567z', '1m'), ['kokushi13']);
  assert.deepEqual(waits('19m19p19s1234566z', '7z'), ['kokushi']);
});

test('ロンで完成した刻子は明刻、ツモなら暗刻', () => {
  const c = counts('123m456p789s11s11z1z');
  const ron = enumerateShapes(c, [], 27, false)[0];
  const tsumo = enumerateShapes(c, [], 27, true)[0];
  assert.equal(ron.groups.find((g) => g.kind === 27)?.open, true);
  assert.equal(tsumo.groups.find((g) => g.kind === 27)?.open, false);
});

// --- プロパティ検証 ---

test('ランダム牌山: シャンテン数 -1 と和了形分解の有無が一致する', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const c = toCounts(createWall(seed).slice(0, 14));
    assert.equal(isAgari(c), shanten(c) === -1, `seed=${seed}`);
  }
});

test('ランダムに作った和了形は必ず分解でき、どの分解も元の牌を使い切る', () => {
  const random = mulberry32(7);
  let made = 0;
  while (made < 1000) {
    const c = new Array(34).fill(0);
    for (let m = 0; m < 4; m++) {
      if (random() < 0.4) {
        c[Math.floor(random() * 34)] += 3;
      } else {
        const start = Math.floor(random() * 3) * 9 + Math.floor(random() * 7);
        c[start]++;
        c[start + 1]++;
        c[start + 2]++;
      }
    }
    c[Math.floor(random() * 34)] += 2;
    if (c.some((n) => n > 4)) continue;
    made++;
    const list = decompose(c);
    assert.ok(list.length >= 1, c.join(''));
    for (const d of list) {
      if (d.form !== 'normal') continue;
      const rebuilt = new Array(34).fill(0);
      rebuilt[d.head] += 2;
      for (const s of d.sets) {
        if (s.type === 'koutsu') rebuilt[s.kind] += 3;
        else for (let i = 0; i < 3; i++) rebuilt[s.kind + i]++;
      }
      assert.deepEqual(rebuilt, c);
    }
    // 分解に重複がない
    const keys = list.map((d) => JSON.stringify(d));
    assert.equal(new Set(keys).size, keys.length);
  }
});
