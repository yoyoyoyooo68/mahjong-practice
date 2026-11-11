// 役一覧（ホームからも対局中のボトムシートからも開く）。元データは core/yaku.js。

import { SPECIAL_YAKU, YAKU } from '../core/yaku.js';

/** @param {import('../core/yaku.js').YakuDef} y */
function valueLabel(y) {
  if (y.yakuman) return y.openHan === 0 ? '役満（門前のみ）' : '役満';
  if (y.openHan === 0) return `${y.han}翻（門前のみ）`;
  if (y.openHan < y.han) return `${y.han}翻（鳴くと${y.openHan}翻）`;
  return `${y.han}翻`;
}

/**
 * @param {string} name
 * @param {string} yomi
 * @param {string} value
 * @param {string} desc
 */
function item(name, yomi, value, desc) {
  return (
    `<li><details><summary><span><ruby>${name}<rt>${yomi}</rt></ruby></span><span>${value}</span></summary>` +
    `<p>${desc}</p></details></li>`
  );
}

/**
 * @returns {string} 役一覧の中身
 */
export function yakuListHtml() {
  const groups = [
    { title: '1翻', list: YAKU.filter((y) => !y.yakuman && y.han === 1) },
    { title: '2翻', list: YAKU.filter((y) => !y.yakuman && y.han === 2) },
    { title: '3翻', list: YAKU.filter((y) => !y.yakuman && y.han === 3) },
    { title: '6翻', list: YAKU.filter((y) => !y.yakuman && y.han === 6) },
    { title: '役満', list: YAKU.filter((y) => y.yakuman) },
  ];
  const sections = groups
    .map(
      (g) =>
        `<section><h3>${g.title}</h3><ul class="yaku-list">${g.list.map((y) => item(y.name, y.yomi, valueLabel(y), y.desc)).join('')}</ul></section>`,
    )
    .join('');
  const special = SPECIAL_YAKU.map((y) => item(y.name, y.yomi, y.value, y.desc)).join('');
  return (
    '<h2>役一覧</h2><p class="small">役名をタップすると説明が開きます。和了には役が1つ以上必要です（ドラは役に数えません）。</p>' +
    `${sections}<section><h3>特殊</h3><ul class="yaku-list">${special}</ul></section>`
  );
}
