// 用語のミニ解説と、役の説明の表示。文字列を返すだけで DOM には触らない。

import { YAKU } from '../core/yaku.js';

/** @typedef {{ term: string, yomi: string, desc: string }} GlossaryEntry */

/** @type {Readonly<Record<string, GlossaryEntry>>} */
export const GLOSSARY = Object.freeze({
  riichi: {
    term: 'リーチ',
    yomi: '立直',
    desc: '鳴かずにテンパイしたときに宣言できます。1000点を場に出し、以後はツモった牌をそのまま切るだけになります。和了すると1翻付き、裏ドラもめくれます。',
  },
  dora: {
    term: 'ドラ',
    yomi: 'どら',
    desc: '持っているだけで1枚につき1翻増える牌です。ドラ表示牌の「次の牌」がドラになります（例: 表示牌が3萬ならドラは4萬）。ドラだけでは和了できず、役が1つ必要です。',
  },
  tenpai: {
    term: 'テンパイ',
    yomi: '聴牌',
    desc: 'あと1枚で和了できる状態です。流局したときテンパイしていると、していない人から点数をもらえます。',
  },
  shanten: {
    term: 'シャンテン',
    yomi: '向聴',
    desc: 'テンパイまであと何枚必要かを表す数です。1シャンテンは「あと1枚でテンパイ」。',
  },
  furiten: {
    term: 'フリテン',
    yomi: '振聴',
    desc: '待ち牌を自分で捨てている、または見逃した直後の状態です。この間はロンできません（ツモ和了はできます）。',
  },
  honba: {
    term: '本場',
    yomi: 'ほんば',
    desc: '親の連荘や流局で増える数です。1本場につき、和了したときの点数が300点増えます。',
  },
  kyotaku: {
    term: '供託',
    yomi: 'きょうたく',
    desc: 'リーチ宣言で場に出された1000点棒です。次に和了した人がまとめて受け取ります。',
  },
  ukeire: {
    term: '受け入れ',
    yomi: 'うけいれ',
    desc: '引くと手が1歩進む牌のことです。受け入れ枚数が多いほど、手が進みやすくなります。',
  },
  fu: {
    term: '符',
    yomi: 'ふ',
    desc: '手牌の形や和了の仕方で決まる点数の単位です。刻子・槓子、雀頭が役牌、待ちの形、ツモなどで増え、10符単位に切り上げます。',
  },
  han: {
    term: '翻',
    yomi: 'ハン',
    desc: '役とドラの数です。1翻増えるごとに点数がおよそ2倍になります。5翻以上は満貫・跳満などの決まった点数になります。',
  },
  oya: {
    term: '親',
    yomi: 'おや',
    desc: '東家のことです。和了したときの点数が1.5倍になり、和了するかテンパイで流局すると親を続けられます（連荘）。',
  },
});

/**
 * タップで解説が開く用語ボタン。
 * @param {string} id GLOSSARY のキー
 * @param {string} [label] 表示する文字（省略時は用語そのもの）
 * @returns {string}
 */
export function termHtml(id, label) {
  const entry = GLOSSARY[id];
  return `<button type="button" class="term" data-cmd="term" data-id="${id}">${label ?? entry.term}</button>`;
}

/**
 * 用語解説の中身。
 * @param {string} id
 * @returns {string}
 */
export function termSheetHtml(id) {
  const entry = GLOSSARY[id];
  if (!entry) return '';
  return `<h2><ruby>${entry.term}<rt>${entry.yomi}</rt></ruby></h2><p>${entry.desc}</p>`;
}

/**
 * 結果画面の役1つ。タップすると説明が開く。
 * @param {import('../core/yaku.js').YakuResult} yaku
 * @returns {string}
 */
export function yakuItemHtml(yaku) {
  const def = YAKU.find((y) => y.id === yaku.id);
  const value = yaku.yakuman > 0 ? (yaku.yakuman > 1 ? 'ダブル役満' : '役満') : `${yaku.han}翻`;
  return (
    `<li><details><summary><span>${yaku.name}</span><span>${value}</span></summary>` +
    `<p>${def ? `${def.yomi}。${def.desc}` : ''}</p></details></li>`
  );
}
