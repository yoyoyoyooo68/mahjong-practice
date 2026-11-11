import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWall, deal, mulberry32, shuffle } from '../src/core/wall.js';

test('乱数は同じシードで同じ列になる', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('shuffle は元の配列を変えない', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, mulberry32(1));
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), src);
});

test('牌山は136枚で重複なし、シードで再現できる', () => {
  const wall = createWall(2026);
  assert.equal(wall.length, 136);
  assert.equal(new Set(wall).size, 136);
  assert.deepEqual(createWall(2026), wall);
  assert.notDeepEqual(createWall(2027), wall);
});

test('配牌: 各13枚、ツモ山70枚、王牌14枚で合計136枚', () => {
  for (const dealer of [0, 1, 2, 3]) {
    const wall = createWall(7);
    const d = deal(wall, dealer);
    assert.deepEqual(
      d.hands.map((h) => h.length),
      [13, 13, 13, 13],
    );
    assert.equal(d.live.length, 70);
    assert.equal(d.rinshan.length, 4);
    assert.equal(d.doraIndicators.length, 5);
    assert.equal(d.uraIndicators.length, 5);
    const all = [...d.hands.flat(), ...d.live, ...d.rinshan, ...d.doraIndicators, ...d.uraIndicators];
    assert.equal(new Set(all).size, 136);
    // 親が最初の4枚を取る
    assert.deepEqual(d.hands[dealer].slice(0, 4), wall.slice(0, 4));
  }
});

test('枚数が違う牌山はエラー', () => {
  assert.throws(() => deal([1, 2, 3]), RangeError);
});
