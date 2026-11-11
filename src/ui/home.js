// ホーム画面と、設定・中断確認などのシートの中身。

import { PERSONALITIES } from '../cpu/personalities/index.js';
import { exportStore, statsSummary } from '../storage/store.js';

/** @typedef {import('../storage/store.js').Store} Store */

/**
 * @param {Store} store
 * @param {{ corrupted: boolean, updateReady: boolean }} flags
 * @returns {string}
 */
export function homeHtml(store, flags) {
  const s = statsSummary(store.stats);
  const resume = store.suspended
    ? '<button type="button" data-cmd="resume" class="act is-primary">続きから</button>'
    : '';
  const notice = flags.corrupted
    ? '<p class="notice">保存データを読み込めなかったため、初期状態で始めます。</p>'
    : '';
  const update = flags.updateReady
    ? '<p class="notice">新しい版があります。<button type="button" data-cmd="update" class="chip is-on">更新する</button></p>'
    : '';
  const cpus = PERSONALITIES.map((p) => `<li><strong>${p.name}</strong>（${p.style}）${p.desc}</li>`).join(
    '',
  );
  return (
    `<main class="home"><h1>麻雀練習</h1><p class="lead">CPUと東風戦を打って、牌効率と役を練習します。</p>${notice}${update}` +
    `<div class="home-buttons">${resume}` +
    `<button type="button" data-cmd="new-game" class="act${store.suspended ? '' : ' is-primary'}">${store.suspended ? '新しく始める' : '対局開始'}</button>` +
    `<button type="button" data-cmd="sheet" data-id="yaku" class="act is-quiet">役一覧</button>` +
    `<button type="button" data-cmd="sheet" data-id="settings" class="act is-quiet">設定</button></div>` +
    `<section class="home-card"><h2>成績</h2><dl class="stats">` +
    `<div><dt>対局数</dt><dd>${store.stats.games}</dd></div><div><dt>平均順位</dt><dd>${s.averageRank}</dd></div>` +
    `<div><dt>着順</dt><dd>${store.stats.ranks.join('-')}</dd></div><div><dt>和了率</dt><dd>${s.winRate}</dd></div>` +
    `<div><dt>放銃率</dt><dd>${s.dealInRate}</dd></div></dl></section>` +
    `<section class="home-card"><h2>対戦相手</h2><ul class="cpu-list">${cpus}</ul>` +
    `<p class="small">4人のうち3人が、対局ごとに入れ替わって相手になります。</p></section></main>`
  );
}

/**
 * @param {Store} store
 * @param {boolean} inGame 対局中か（赤ドラは次の対局から反映）
 * @returns {string}
 */
export function settingsHtml(store, inGame) {
  /** @param {string} id @param {string} label @param {boolean} on @param {string} note */
  const toggle = (id, label, on, note) =>
    `<div class="setting"><div><strong>${label}</strong><p class="small">${note}</p></div>` +
    `<button type="button" data-cmd="toggle" data-id="${id}" class="chip${on ? ' is-on' : ''}" role="switch" aria-checked="${on}">${on ? 'オン' : 'オフ'}</button></div>`;
  return (
    '<h2>設定</h2>' +
    toggle(
      'redDora',
      '赤ドラ',
      store.settings.redDora,
      `5萬・5筒・5索に1枚ずつ。${inGame ? '次の対局から反映されます。' : ''}`,
    ) +
    toggle('sound', '効果音', store.settings.sound, '打牌や和了のときに短い音を鳴らします。') +
    '<div class="setting"><div><strong>使い方</strong><p class="small">最初に出る3枚の説明をもう一度見ます。</p></div>' +
    '<button type="button" data-cmd="sheet" data-id="onboarding" class="chip">表示する</button></div>' +
    '<div class="setting"><div><strong>データ</strong><p class="small">成績と設定はこの端末のブラウザにだけ保存されます。</p></div>' +
    '<span class="setting-buttons"><button type="button" data-cmd="sheet" data-id="export" class="chip">書き出し</button>' +
    '<button type="button" data-cmd="sheet" data-id="reset" class="chip">リセット</button></span></div>'
  );
}

/** @param {Store} store */
export function exportHtml(store) {
  return (
    '<h2>データの書き出し</h2><p class="small">下の文字列をコピーして保管してください（中断中の対局は含みません）。</p>' +
    `<textarea class="export" readonly rows="8" aria-label="保存データ">${exportStore(store).replace(/</g, '&lt;')}</textarea>`
  );
}

export function resetHtml() {
  return (
    '<h2>データをリセットしますか？</h2><p>成績・設定・中断中の対局がすべて消えます。元に戻せません。</p>' +
    '<div class="panel-buttons"><button type="button" data-cmd="close" class="act is-quiet">やめる</button>' +
    '<button type="button" data-cmd="reset" class="act is-danger">リセットする</button></div>'
  );
}

export function quitHtml() {
  return (
    '<h2>対局を中断しますか？</h2><p>ここまでの対局は保存され、ホームの「続きから」で再開できます。</p>' +
    '<div class="panel-buttons"><button type="button" data-cmd="close" class="act is-quiet">対局に戻る</button>' +
    '<button type="button" data-cmd="home" class="act">中断して保存</button></div>'
  );
}

export function pausedHtml() {
  return (
    '<h2>一時停止中</h2><p>画面から離れていたので、対局を止めています。</p>' +
    '<div class="panel-buttons"><button type="button" data-cmd="close" class="act">再開する</button></div>'
  );
}
