import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  doraKindOf,
  formatTiles,
  isRed,
  isTerminal,
  isYaochu,
  kindName,
  kindOf,
  parseTiles,
  sortTiles,
  tileName,
  toCounts,
} from '../src/core/tiles.js';

test('牌種名', () => {
  assert.equal(kindName(0), '一萬');
  assert.equal(kindName(13), '五筒');
  assert.equal(kindName(26), '九索');
  assert.deepEqual([27, 28, 29, 30, 31, 32, 33].map(kindName), ['東', '南', '西', '北', '白', '發', '中']);
  assert.throws(() => kindName(34), RangeError);
});

test('赤ドラは各色の5に1枚ずつ', () => {
  const reds = Array.from({ length: 136 }, (_, i) => i).filter(isRed);
  assert.deepEqual(reds.map(kindOf), [4, 13, 22]);
  assert.equal(tileName(52), '赤五筒');
  assert.equal(tileName(53), '五筒');
  assert.equal(tileName(52, false), '五筒');
});

test('一九牌・么九牌', () => {
  assert.ok(isTerminal(0) && isTerminal(8) && isTerminal(26));
  assert.ok(!isTerminal(1) && !isTerminal(27));
  assert.ok(isYaochu(27) && isYaochu(9) && !isYaochu(10));
});

test('ドラ表示牌の次の牌がドラ', () => {
  assert.equal(doraKindOf(0), 1);
  assert.equal(doraKindOf(8), 0); // 九萬 → 一萬
  assert.equal(doraKindOf(17), 9); // 九筒 → 一筒
  assert.equal(doraKindOf(30), 27); // 北 → 東
  assert.equal(doraKindOf(33), 31); // 中 → 白
  assert.equal(doraKindOf(31), 32); // 白 → 發
});

test('表記の読み書きが往復する', () => {
  const text = '123m406p789s1122z';
  const ids = parseTiles(text);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, 13, '牌IDが重複しない');
  assert.equal(formatTiles(ids), text);
  assert.equal(formatTiles(ids, false), '123m456p789s1122z');
  assert.equal(formatTiles(parseTiles('5550m')), '0555m');
});

test('通常の5は赤以外に割り当てる', () => {
  assert.ok(parseTiles('555p').every((id) => !isRed(id)));
  assert.ok(isRed(parseTiles('0s')[0]));
});

test('不正な表記はエラー', () => {
  assert.throws(() => parseTiles('123'), SyntaxError);
  assert.throws(() => parseTiles('8z'), SyntaxError);
  assert.throws(() => parseTiles('0z'), SyntaxError);
  assert.throws(() => parseTiles('11111m'), RangeError);
  assert.throws(() => parseTiles('00m'), RangeError);
  assert.throws(() => parseTiles('1x'), SyntaxError);
});

test('枚数集計と理牌', () => {
  const counts = toCounts(parseTiles('1123m77z'));
  assert.equal(counts[0], 2);
  assert.equal(counts[33], 2);
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    6,
  );
  assert.deepEqual(sortTiles([100, 3, 52]), [3, 52, 100]);
});
