// Service Worker: cache-first。配信するファイルをすべて先読みして、オフラインでも対局できるようにする。
// ファイルを追加・変更して公開するときは CACHE_NAME の版数を上げる（test/pwa.test.js が一覧の漏れを検査する）。

const CACHE_NAME = 'mahjong-practice-v2';

const ASSETS = [
  './',
  'index.html',
  'tiles.html',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'src/core/agari.js',
  'src/core/efficiency.js',
  'src/core/rules.js',
  'src/core/score.js',
  'src/core/shanten.js',
  'src/core/tiles.js',
  'src/core/wall.js',
  'src/core/yaku.js',
  'src/cpu/base.js',
  'src/cpu/personalities/index.js',
  'src/game/events.js',
  'src/game/log.js',
  'src/game/round.js',
  'src/game/runner.js',
  'src/game/state.js',
  'src/main.js',
  'src/storage/store.js',
  'src/ui/hint-panel.js',
  'src/ui/home.js',
  'src/ui/lessons.js',
  'src/ui/onboarding.js',
  'src/ui/result.js',
  'src/ui/session.js',
  'src/ui/sound.js',
  'src/ui/table.js',
  'src/ui/tile-svg.js',
  'src/ui/tile-text.js',
  'src/ui/tiles-preview.js',
  'src/ui/yaku-explainer.js',
  'src/ui/yaku-list.js',
  'styles/app.css',
  'styles/preview.css',
  'styles/tiles.css',
  'styles/tokens.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  // 古い版のキャッシュを消す
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached ?? fetch(event.request)),
  );
});

// 更新は自動では切り替えない。ホームの更新バナーから指示が来たときだけ切り替える
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
