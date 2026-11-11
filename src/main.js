// 配線だけを行う: 保存データ・対局セッション・各画面の HTML を、クリックと描画でつなぐ。

import { loadStore, recordGame, recordRound, resetStore, saveStore } from './storage/store.js';
import { exportHtml, homeHtml, pausedHtml, quitHtml, resetHtml, settingsHtml } from './ui/home.js';
import { ONBOARDING_STEPS, onboardingHtml } from './ui/onboarding.js';
import { gameResultHtml, roundResultHtml } from './ui/result.js';
import { createSession, ME } from './ui/session.js';
import { playSound, soundFor } from './ui/sound.js';
import { tableHtml } from './ui/table.js';
import { termSheetHtml } from './ui/yaku-explainer.js';
import { yakuListHtml } from './ui/yaku-list.js';

/** @typedef {import('./game/state.js').Action} Action */

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const offlineBand = /** @type {HTMLElement} */ (document.getElementById('offline'));

/** localStorage が使えない環境（プライベートモードなど）では、保存せずに動かす */
/** @type {import('./storage/store.js').StorageLike} */
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const loaded = loadStore(storage);
let store = loaded.store;
let corrupted = loaded.corrupted;

/** @type {'home' | 'table'} */
let screen = 'home';
/** @type {string | null} 開いているシート（'yaku' / 'settings' / 'quit' / 'term:riichi' など） */
let sheet = null;
let onboardingStep = 0;
let updateReady = false;
/** @type {ServiceWorker | null} */
let waitingWorker = null;
/** @type {Action[]} 卓面に出しているボタンに対応する行動 */
let buttons = [];

function persist() {
  saveStore(storage, store);
}

const session = createSession({
  onChange: render,
  onEvents(state) {
    if (!store.settings.sound) return;
    const name = soundFor(state);
    if (name) playSound(name);
  },
  onSave(data) {
    store = { ...store, suspended: data };
    persist();
  },
  onRoundEnd(round) {
    store = { ...store, stats: recordRound(store.stats, round) };
  },
  onGameEnd(rank) {
    store = { ...store, stats: recordGame(store.stats, rank) };
  },
});

/** @returns {string} */
function sheetHtml() {
  if (sheet === null) return '';
  let body = '';
  let closable = true;
  if (sheet === 'yaku') body = yakuListHtml();
  else if (sheet === 'settings') body = settingsHtml(store, screen === 'table');
  else if (sheet === 'export') body = exportHtml(store);
  else if (sheet.startsWith('term:')) body = termSheetHtml(sheet.slice(5));
  else {
    closable = false;
    if (sheet === 'quit') body = quitHtml();
    else if (sheet === 'reset') body = resetHtml();
    else if (sheet === 'paused') body = pausedHtml();
    else if (sheet === 'onboarding') body = onboardingHtml(onboardingStep);
  }
  const close = closable
    ? '<button type="button" data-cmd="close" class="chip sheet-close">閉じる</button>'
    : '';
  return `<div class="overlay is-sheet"><div class="panel sheet" role="dialog" aria-modal="true">${close}<div class="panel-body">${body}</div></div></div>`;
}

function render() {
  let html = '';
  if (screen === 'table' && session.state) {
    const table = tableHtml(session);
    buttons = table.buttons;
    html = `<div class="table">${table.html}</div>${roundResultHtml(session)}${gameResultHtml(session)}`;
  } else {
    html = homeHtml(store, { corrupted, updateReady });
  }
  root.innerHTML = html + sheetHtml();
}

/** @param {string} id */
function openSheet(id) {
  sheet = id;
  // シートを開いている間はCPUを止める（読んでいる途中で画面が動かないように）
  session.setPaused(true);
  render();
}

function closeSheet() {
  sheet = null;
  session.setPaused(false);
  render();
}

function startGame() {
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param !== null && Number.isFinite(Number(param)) ? Number(param) : Date.now() % 2147483647;
  screen = 'table';
  sheet = null;
  corrupted = false;
  session.start({ seed, startDealer: seed % 4, rules: { redDora: store.settings.redDora } });
  if (!store.settings.onboardingDone) {
    onboardingStep = 0;
    openSheet('onboarding');
  }
}

function resumeGame() {
  if (store.suspended && session.resume(store.suspended)) {
    screen = 'table';
    sheet = null;
    render();
    return;
  }
  // 中断データが壊れていたら捨てて、新規開始だけを出す
  store = { ...store, suspended: null };
  persist();
  corrupted = true;
  render();
}

function goHome() {
  session.stop();
  screen = 'home';
  sheet = null;
  persist();
  render();
}

/** @param {HTMLElement} target */
function onTile(target) {
  const state = session.state;
  if (!state || state.phase !== 'turn' || state.turn !== ME) return;
  const tile = Number(target.dataset.tile);
  const action = state.options[ME].find(
    (o) => o.type === 'discard' && o.tile === tile && Boolean(o.riichi) === session.ui.riichiMode,
  );
  if (!action) return;
  // 1回目のタップで選択、同じ牌をもう1回タップで切る
  if (session.ui.selected === tile) session.act(action);
  else session.select(tile);
}

/** @param {string} cmd @param {string | undefined} id */
function onCommand(cmd, id) {
  switch (cmd) {
    case 'new-game':
      startGame();
      break;
    case 'resume':
      resumeGame();
      break;
    case 'home':
      goHome();
      break;
    case 'hint':
      session.toggleHint();
      break;
    case 'undo':
      session.undo();
      break;
    case 'riichi':
      session.setRiichiMode(true);
      break;
    case 'riichi-cancel':
      session.setRiichiMode(false);
      break;
    case 'reveal':
      session.revealResult();
      break;
    case 'reveal-all':
      session.revealResult(true);
      break;
    case 'next-round':
      session.act({ type: 'nextRound', seat: ME });
      break;
    case 'sheet':
      if (id === 'onboarding') onboardingStep = 0;
      if (id) openSheet(id);
      break;
    case 'term':
      if (id) openSheet(`term:${id}`);
      break;
    case 'close':
      closeSheet();
      break;
    case 'toggle':
      if (id === 'redDora' || id === 'sound') {
        store = { ...store, settings: { ...store.settings, [id]: !store.settings[id] } };
        persist();
        render();
      }
      break;
    case 'reset':
      session.stop();
      store = resetStore(storage);
      corrupted = false;
      screen = 'home';
      sheet = null;
      render();
      break;
    case 'onboarding-next':
      onboardingStep = Math.min(ONBOARDING_STEPS.length - 1, onboardingStep + 1);
      render();
      break;
    case 'onboarding-done':
      store = { ...store, settings: { ...store.settings, onboardingDone: true } };
      persist();
      closeSheet();
      break;
    case 'update':
      // 新しい Service Worker に切り替えて読み込み直す（ホームでだけ出すので対局には割り込まない）
      if (waitingWorker) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      break;
  }
}

document.addEventListener('click', (event) => {
  const origin = /** @type {HTMLElement} */ (event.target);
  const target = origin.closest('[data-tile], [data-act], [data-cmd]');
  if (!(target instanceof HTMLElement)) {
    // 空白をタップしたら選択を解除する
    if (session.ui.selected !== null && !origin.closest('.overlay')) session.select(null);
    return;
  }
  if (target.dataset.tile !== undefined) onTile(target);
  else if (target.dataset.act !== undefined) {
    const action = buttons[Number(target.dataset.act)];
    if (action) session.act(action);
  } else if (target.dataset.cmd) onCommand(target.dataset.cmd, target.dataset.id);
});

// バックグラウンドに回ったら自動で一時停止する
document.addEventListener('visibilitychange', () => {
  const state = session.state;
  if (!document.hidden || screen !== 'table' || !state || sheet !== null) return;
  if (state.phase === 'turn' || state.phase === 'response') openSheet('paused');
});

function showOnline() {
  offlineBand.hidden = navigator.onLine;
}
window.addEventListener('online', showOnline);
window.addEventListener('offline', showOnline);
showOnline();

// Service Worker。開発中（localhost）は古いキャッシュで混乱しないよう、?sw=1 を付けたときだけ登録する
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!local || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      const check = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        waitingWorker = registration.waiting;
        updateReady = true;
        if (screen === 'home') render();
      };
      check();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', check);
      });
    })
    .catch(() => {
      // 登録できなくてもオンラインでは普通に動く
    });
}

render();
