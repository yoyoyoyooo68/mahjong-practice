import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kindName, tileName } from '../src/core/tiles.js';
import { kindSvg, tileBackSvg, tileSvg } from '../src/ui/tile-svg.js';

test('全136枚: role と aria-label が付き、style 属性を使わない', () => {
  for (let id = 0; id < 136; id++) {
    const svg = tileSvg(id);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('role="img"'));
    assert.ok(svg.includes(`aria-label="${tileName(id)}"`), `id=${id}`);
    assert.ok(!svg.includes('style='), 'CSPのため style 属性は使わない');
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `id=${id}`);
  }
});

test('赤ドラは★付き（色だけに頼らない）', () => {
  for (const id of [16, 52, 88]) {
    const svg = tileSvg(id);
    assert.ok(svg.includes('tile-star'), `id=${id}`);
    assert.ok(svg.includes('tile--red'));
    assert.ok(svg.includes('aria-label="赤五'));
    // 赤なしルールでは普通の5
    const plain = tileSvg(id, { redDora: false });
    assert.ok(!plain.includes('tile-star'));
    assert.ok(!plain.includes('赤'));
  }
  assert.ok(!tileSvg(17).includes('tile-star'));
});

test('牌種ごとに絵柄が異なる', () => {
  const all = new Set();
  for (let kind = 0; kind < 34; kind++) {
    const svg = kindSvg(kind, false);
    assert.ok(svg.includes(`aria-label="${kindName(kind)}"`));
    all.add(svg);
  }
  assert.equal(all.size, 34);
});

test('筒子の丸と索子の棒は数字と同じ個数', () => {
  for (let n = 1; n <= 9; n++) {
    const pin = kindSvg(9 + n - 1, false);
    assert.equal((pin.match(/class="tile-hole"/g) ?? []).length, n, `${n}筒`);
    if (n === 1) continue;
    const sou = kindSvg(18 + n - 1, false);
    assert.equal((sou.match(/class="tile-hole"/g) ?? []).length, n, `${n}索`);
  }
});

test('サイズ指定は 40:56 の比を保つ', () => {
  const svg = tileSvg(0, { width: 18 });
  assert.ok(svg.includes('width="18"'));
  assert.ok(svg.includes('height="25.2"'));
  assert.ok(tileBackSvg({ width: 14 }).includes('aria-label="裏向きの牌"'));
});
