// 牌の確認ページ（tiles.html）。牌の絵柄と、牌山・シャンテン・牌効率が動くことを目で確かめる。

import { adviseDiscard, shantenLabel } from '../core/efficiency.js';
import { doraKindOf, kindName, kindOf, sortTiles, tileName, toCounts } from '../core/tiles.js';
import { createWall, deal } from '../core/wall.js';
import { kindSvg, tileBackSvg, tileSvg } from './tile-svg.js';

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素が見つかりません: #${id}`);
  return el;
}

/**
 * @param {string} label
 * @param {string} tilesHtml
 */
function row(label, tilesHtml) {
  return `<p class="row-label">${label}</p><div class="tile-row">${tilesHtml}</div>`;
}

function renderAllTiles() {
  const suits = [
    ['萬子', 0],
    ['筒子', 9],
    ['索子', 18],
  ];
  let html = '';
  for (const [label, base] of suits) {
    let tiles = '';
    for (let n = 0; n < 9; n++) tiles += kindSvg(Number(base) + n, false);
    tiles += kindSvg(Number(base) + 4, true);
    html += row(`${label}（右端は赤ドラ）`, tiles);
  }
  let honors = '';
  for (let kind = 27; kind < 34; kind++) honors += kindSvg(kind, false);
  html += row('字牌と裏向き', honors + tileBackSvg());
  byId('all-tiles').innerHTML = html;
}

function renderSizes() {
  const sample = [0, 16, 36, 52, 68, 88, 104, 108, 124, 128, 132];
  const sizes = [
    ['手牌 40×56', 40],
    ['手牌の最小 36×50', 36],
    ['自家の捨て牌 18×25', 18],
    ['他家の捨て牌 14×20（下限）', 14],
  ];
  let html = '';
  for (const [label, width] of sizes) {
    html += row(String(label), sample.map((id) => tileSvg(id, { width: Number(width) })).join(''));
  }
  byId('sizes').innerHTML = html;
}

/** @param {number} seed */
function renderDeal(seed) {
  const d = deal(createWall(seed), 0);
  const drawn = d.live[0];
  const hand = sortTiles(d.hands[0]);
  const indicator = d.doraIndicators[0];
  const doraKind = doraKindOf(kindOf(indicator));

  // 自分の手牌以外で見えているのはドラ表示牌だけ
  const visible = toCounts([indicator]);
  const advice = adviseDiscard([...hand, drawn], { visible, doraKinds: [doraKind] });

  byId('deal-meta').innerHTML =
    `<span>シード ${seed}・東家の配牌</span><span>ドラ表示牌</span>${tileSvg(indicator, { width: 18 })}` +
    `<span>（ドラは${kindName(doraKind)}）</span><span>現在: ${shantenLabel(advice.currentShanten)}</span>`;

  const bestTotal = advice.best ? advice.best.ukeire.total : 0;
  /** @param {number} id @param {boolean} isDrawn */
  const tileHtml = (id, isDrawn) => {
    const option = advice.options.find((o) => o.kind === kindOf(id));
    const isBest = advice.best?.tile === id;
    const keeps = option !== undefined && option.shanten === advice.currentShanten;
    const badge = keeps ? String(option.ukeire.total) : '−';
    const title = option
      ? `${tileName(id)}を切ると${shantenLabel(option.shanten)}、受け入れ${option.ukeire.total}枚`
      : tileName(id);
    const classes = ['hand-tile', isDrawn ? 'is-drawn' : '', isBest ? 'is-best' : '']
      .filter(Boolean)
      .join(' ');
    const badgeClass = keeps && option.ukeire.total === bestTotal ? 'badge' : 'badge is-worse';
    return `<div class="${classes}" title="${title}">${tileSvg(id)}<span class="${badgeClass}">${badge}</span></div>`;
  };
  byId('hand').innerHTML = hand.map((id) => tileHtml(id, false)).join('') + tileHtml(drawn, true);

  byId('advice').textContent = advice.best ? `おすすめ: ${advice.reason}` : advice.reason;
  byId('ukeire').innerHTML = advice.best
    ? advice.best.ukeire.tiles
        .map(
          (t) => `<span class="ukeire-item">${kindSvg(t.kind, false, { width: 18 })}残り${t.count}枚</span>`,
        )
        .join('')
    : '';
}

function main() {
  renderAllTiles();
  renderSizes();

  const seedInput = /** @type {HTMLInputElement} */ (byId('seed'));
  const readSeed = () => {
    const value = Math.floor(Number(seedInput.value));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  byId('deal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    renderDeal(readSeed());
  });
  byId('next-seed').addEventListener('click', () => {
    seedInput.value = String(readSeed() + 1);
    renderDeal(readSeed());
  });
  renderDeal(readSeed());
}

main();
