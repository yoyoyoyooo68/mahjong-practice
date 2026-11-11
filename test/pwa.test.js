import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const read = (path) => readFileSync(join(decodeURIComponent(root), path), 'utf8');

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const base = join(decodeURIComponent(root), dir);
  return readdirSync(base).flatMap((name) => {
    if (name === '.DS_Store') return [];
    const path = `${dir}/${name}`;
    return statSync(join(base, name)).isDirectory() ? walk(path) : [path];
  });
}

test('Service Worker: 配信するファイルがすべて先読み一覧に入っている', () => {
  const sw = read('sw.js');
  const listed = [...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]);
  const expected = [
    './',
    'index.html',
    'tiles.html',
    'manifest.webmanifest',
    ...walk('icons'),
    ...walk('src'),
    ...walk('styles'),
  ];
  assert.deepEqual(
    [...listed].sort(),
    [...expected].sort(),
    'ファイルを足したら sw.js の ASSETS と CACHE_NAME を更新する',
  );
  assert.match(sw, /const CACHE_NAME = 'mahjong-practice-v\d+';/);
  // 更新は自動で切り替えない（更新バナーからの指示でだけ skipWaiting する）
  assert.equal(sw.match(/skipWaiting\(\)/g)?.length, 1);
  assert.ok(sw.includes("event.data?.type === 'SKIP_WAITING'"));
});

test('manifest: 相対パスで、アイコンが実在する', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  const purposes = manifest.icons.map((/** @type {{ purpose?: string }} */ i) => i.purpose ?? 'any');
  assert.ok(purposes.includes('maskable'));
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), 'GitHub Pages のサブパスで動くよう相対パスにする');
    assert.ok(existsSync(join(decodeURIComponent(root), icon.src)), icon.src);
  }
});

test('HTML: CSP を付け、外部の読み込みやインラインのスクリプト・スタイルがない', () => {
  for (const file of ['index.html', 'tiles.html']) {
    const html = read(file);
    assert.ok(html.includes(`content="default-src 'self'"`), file);
    assert.ok(!/https?:\/\//.test(html), `${file}: 外部URLを読み込まない`);
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), `${file}: インラインスクリプトなし`);
    assert.ok(!/<style|\sstyle=/.test(html), `${file}: インラインスタイルなし`);
    assert.ok(html.includes('viewport-fit=cover'), file);
  }
  const index = read('index.html');
  assert.ok(index.includes('rel="manifest"') && index.includes('apple-touch-icon'));
});

test('JS: style 属性を文字列で組み立てていない（CSPで無効になるため）', () => {
  for (const file of walk('src')) {
    assert.ok(!/style="/.test(read(file)), file);
  }
});
