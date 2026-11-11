import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  shanten,
  shantenChiitoi,
  shantenDetail,
  shantenKokushi,
  shantenNormal,
} from '../src/core/shanten.js';
import { parseTiles, toCounts } from '../src/core/tiles.js';
import { createWall, mulberry32 } from '../src/core/wall.js';

/** @param {string} text */
const counts = (text) => toCounts(parseTiles(text));

// --- テスト専用: 実装とは独立した和了形チェック ---

/**
 * @param {number[]} c
 * @param {number} need 残り面子数
 * @returns {boolean}
 */
function canFormMentsu(c, need) {
  if (need === 0) return c.every((n) => n === 0);
  const i = c.findIndex((n) => n > 0);
  if (i === -1) return false;
  if (c[i] >= 3) {
    c[i] -= 3;
    const ok = canFormMentsu(c, need - 1);
    c[i] += 3;
    if (ok) return true;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--;
    c[i + 1]--;
    c[i + 2]--;
    const ok = canFormMentsu(c, need - 1);
    c[i]++;
    c[i + 1]++;
    c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/**
 * @param {readonly number[]} src 14枚の手牌
 * @returns {boolean}
 */
function isAgariBruteForce(src) {
  const c = [...src];
  if (c.filter((n) => n === 2).length === 7) return true;
  const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  if (yaochu.every((k) => c[k] >= 1) && yaochu.reduce((s, k) => s + c[k], 0) === 14) return true;
  for (let k = 0; k < 34; k++) {
    if (c[k] < 2) continue;
    c[k] -= 2;
    const ok = canFormMentsu(c, 4);
    c[k] += 2;
    if (ok) return true;
  }
  return false;
}

// --- 既知の手 ---

test('和了形は -1', () => {
  assert.equal(shanten(counts('123m456p789s11222z')), -1);
  assert.equal(shanten(counts('11122233344455m')), -1);
  assert.equal(shanten(counts('11223344556677p')), -1); // 七対子でも二盃口形でも和了
  assert.equal(shanten(counts('19m19p19s12345677z')), -1); // 国士無双
});

test('テンパイは 0', () => {
  assert.equal(shanten(counts('123m456p789s1122z')), 0); // シャンポン
  assert.equal(shanten(counts('123m456p789s1112z')), 0); // 単騎
  assert.equal(shanten(counts('1112345678999m')), 0); // 九蓮宝燈
  assert.equal(shanten(counts('1133557799m113p')), 0); // 七対子
  assert.equal(shanten(counts('19m19p19s1234567z')), 0); // 国士13面
});

test('形ごとのシャンテン数', () => {
  const worst = shantenDetail(counts('147m258p369s1234z'));
  assert.equal(worst.normal, 8);
  assert.equal(worst.chiitoi, 6);
  assert.equal(worst.kokushi, 7);
  assert.equal(worst.min, 6);

  // カンチャン6つ: 搭子は4つまでしか数えない
  assert.equal(shantenNormal(counts('2468m2468p2468s1z')), 4);
  // 搭子オーバー（面子2 + 雀頭 + 搭子3 → 使える搭子は2つ）
  assert.equal(shantenNormal(counts('123m456m11p12s45s79p')), 1);
  // 同じ牌4枚は七対子では1対子
  assert.equal(shantenChiitoi(counts('1111m2233445566p')), 1);
  assert.equal(shantenKokushi(counts('19m19p19s123456z5m')), 1);
});

test('副露があるときは通常形だけを数える', () => {
  // 3副露 + 1234m → ノベタンのテンパイ
  assert.equal(shanten(counts('1234m'), 3), 0);
  assert.equal(shanten(counts('1123m'), 3), 0);
  assert.equal(shanten(counts('11m'), 4), -1);
  assert.equal(shanten(counts('1m'), 4), 0);
  const d = shantenDetail(counts('1133557799m'), 1);
  assert.equal(d.chiitoi, Number.POSITIVE_INFINITY);
  assert.equal(d.kokushi, Number.POSITIVE_INFINITY);
});

// --- プロパティ検証 ---

test('ランダム牌山: -1 のときだけ和了形（独立実装と一致）', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const c = toCounts(createWall(seed).slice(0, 14));
    assert.equal(shanten(c) === -1, isAgariBruteForce(c), `seed=${seed}`);
  }
});

test('ランダムに作った和了形は -1、1枚抜くと 0', () => {
  const random = mulberry32(99);
  let made = 0;
  while (made < 1000) {
    const c = new Array(34).fill(0);
    for (let m = 0; m < 4; m++) {
      if (random() < 0.5) {
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
    assert.ok(isAgariBruteForce(c));
    assert.equal(shanten(c), -1, c.join(''));
    const k = c.findIndex((n) => n > 0);
    c[k]--;
    assert.equal(shanten(c), 0, c.join(''));
  }
});

test('ランダム牌山: 1枚の出し入れでシャンテン数は高々1しか動かない', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const c = toCounts(createWall(seed).slice(0, 13));
    const s13 = shanten(c);
    assert.ok(s13 >= 0 && s13 <= 6, `seed=${seed}`);
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue;
      c[k]++;
      const s14 = shanten(c);
      assert.ok(s14 === s13 || s14 === s13 - 1, `seed=${seed} draw=${k}`);
      // 14枚からどれを切っても悪化は1まで、最善の打牌ならシャンテン数は変わらない
      let bestAfter = 99;
      for (let d = 0; d < 34; d++) {
        if (c[d] === 0) continue;
        c[d]--;
        const after = shanten(c);
        c[d]++;
        assert.ok(after === s14 || after === s14 + 1, `seed=${seed} draw=${k} discard=${d}`);
        bestAfter = Math.min(bestAfter, after);
      }
      assert.equal(bestAfter, Math.max(s14, 0), `seed=${seed} draw=${k}`);
      c[k]--;
    }
  }
});
