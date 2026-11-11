import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adviseDiscard, calcUkeire, evaluateDiscards, shantenLabel } from '../src/core/efficiency.js';
import { shanten } from '../src/core/shanten.js';
import { isRed, kindOf, parseTiles, toCounts } from '../src/core/tiles.js';
import { createWall } from '../src/core/wall.js';

/** @param {string} text */
const counts = (text) => toCounts(parseTiles(text));
/** @param {string} text 1枚だけの表記 */
const kind = (text) => kindOf(parseTiles(text)[0]);

test('受け入れ: 両面待ち', () => {
  const u = calcUkeire(counts('123m456p789s23s11z'));
  assert.equal(u.shanten, 0);
  assert.deepEqual(u.tiles, [
    { kind: kind('1s'), count: 4 },
    { kind: kind('4s'), count: 4 },
  ]);
  assert.equal(u.total, 8);
});

test('受け入れ: 九蓮宝燈は9種23枚', () => {
  const u = calcUkeire(counts('1112345678999m'));
  assert.equal(u.tiles.length, 9);
  assert.equal(u.total, 23);
});

test('受け入れ: 見えている牌は引く。残り0枚の牌は載せない', () => {
  const visible = new Array(34).fill(0);
  visible[kind('1s')] = 3;
  visible[kind('4s')] = 4;
  const u = calcUkeire(counts('123m456p789s23s11z'), { visible });
  assert.deepEqual(u.tiles, [{ kind: kind('1s'), count: 1 }]);
  assert.equal(u.total, 1);
});

test('受け入れ: 自分で4枚持っている牌は待ちにならない', () => {
  const u = calcUkeire(counts('1111m456p789s222z'));
  assert.equal(u.shanten, 0);
  assert.equal(u.total, 0);
});

test('受け入れ: 副露ありの単騎', () => {
  const u = calcUkeire(counts('5p'), { melds: 4 });
  assert.deepEqual(u.tiles, [{ kind: kind('5p'), count: 3 }]);
});

test('最善打牌: 孤立した字牌を切ってテンパイ', () => {
  const advice = adviseDiscard(parseTiles('123m456p789s23s11z7z'));
  assert.equal(advice.currentShanten, 0);
  assert.equal(advice.best?.kind, kind('7z'));
  assert.equal(advice.best?.shanten, 0);
  assert.equal(advice.best?.ukeire.total, 8);
  assert.match(advice.reason, /中を切るとテンパイ/);
  assert.match(advice.reason, /一索 残り4枚/);
});

test('最善打牌: 受け入れが広い方を選ぶ', () => {
  // 13m(カンチャン)・45p(両面)・孤立の9p → 9p を切れば 2m・3p・6p の12枚
  const advice = adviseDiscard(parseTiles('13m459p456s789s11z'));
  assert.ok(advice.best);
  assert.equal(advice.best.kind, kind('9p'));
  assert.equal(advice.best.shanten, 1);
  assert.equal(advice.best.ukeire.total, 12);
  // 搭子を崩すとシャンテン数が戻る
  assert.equal(advice.options.find((o) => o.kind === kind('1m'))?.shanten, 2);
  // 切った自分の牌は受け入れから引かれる
  for (const o of advice.options) {
    const self = o.ukeire.tiles.find((t) => t.kind === o.kind);
    if (self) assert.ok(self.count <= 3);
  }
});

test('タイブレーク: 同評価なら字牌 → 端牌 → 中張牌の順に切る', () => {
  const options = evaluateDiscards(parseTiles('123m456p789s5m9p1z3z2s'));
  const top = options.filter(
    (o) => o.shanten === options[0].shanten && o.ukeire.total === options[0].ukeire.total,
  );
  assert.ok(top.length >= 2);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].keepValue <= top[i].keepValue);
});

test('タイブレーク: ドラと赤は残す', () => {
  const hand = parseTiles('123m456p789s1z2z3z4z5z');
  const plain = evaluateDiscards(hand);
  assert.equal(plain[0].kind, kind('1z'));
  const withDora = evaluateDiscards(hand, { doraKinds: [kind('1z')] });
  assert.equal(withDora[0].kind, kind('2z'));

  // 赤5と通常の5があれば、切る候補は通常の5
  const fives = evaluateDiscards(parseTiles('05m123p456s789s11z9p'));
  const five = fives.find((o) => o.kind === kind('5m'));
  assert.ok(five && !isRed(five.tile));
  // 赤なしルールなら赤も普通の牌
  const single = evaluateDiscards(parseTiles('0m'), { melds: 4, redDora: false });
  assert.equal(single[0].keepValue, 3);
});

test('和了形のときは推奨なし', () => {
  const advice = adviseDiscard(parseTiles('123m456p789s11222z'));
  assert.equal(advice.currentShanten, -1);
  assert.equal(advice.best, null);
});

test('シャンテン数の表示', () => {
  assert.equal(shantenLabel(-1), '和了形');
  assert.equal(shantenLabel(0), 'テンパイ');
  assert.equal(shantenLabel(3), '3シャンテン');
});

test('ランダム牌山: 受け入れ牌は実際にシャンテン数を下げる牌と一致する', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const c = toCounts(createWall(seed).slice(0, 13));
    const u = calcUkeire(c);
    const accepted = new Set(u.tiles.map((t) => t.kind));
    let total = 0;
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue;
      c[k]++;
      const improves = shanten(c) < u.shanten;
      c[k]--;
      assert.equal(accepted.has(k), improves, `seed=${seed} kind=${k}`);
      if (improves) total += 4 - c[k];
    }
    assert.equal(u.total, total, `seed=${seed}`);
  }
});

test('ランダム牌山: 推奨打牌は14枚時点のシャンテン数を保つ', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const hand = createWall(seed).slice(0, 14);
    const advice = adviseDiscard(hand);
    if (!advice.best) continue;
    assert.equal(advice.best.shanten, advice.currentShanten, `seed=${seed}`);
    assert.ok(hand.includes(advice.best.tile));
    assert.ok(advice.reason.length > 0);
  }
});
