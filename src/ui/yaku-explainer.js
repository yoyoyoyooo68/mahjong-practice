// 用語のミニ解説と、役の説明の表示。文字列を返すだけで DOM には触らない。

import { YAKU } from '../core/yaku.js';

/** @typedef {{ term: string, yomi: string, desc: string, plain: string }} GlossaryEntry */

/** @type {Readonly<Record<string, GlossaryEntry>>} */
export const GLOSSARY = Object.freeze({
  riichi: {
    term: 'リーチ',
    yomi: '立直',
    desc: '鳴かずにテンパイしたときに宣言できます。1000点を場に出し、以後はツモった牌をそのまま切るだけになります。和了すると1翻付き、裏ドラもめくれます。',

    plain:
      'テンパイ（あと1枚で上がり）のときに「リーチ」を押して宣言します。1000点を場に出すかわりに、上がったときの役（上がりに必要な条件）が1つ付きます。宣言したあとは、引いた牌をそのまま捨てていきます。',
  },
  dora: {
    term: 'ドラ',
    yomi: 'どら',
    desc: '持っているだけで1枚につき1翻増える牌です。ドラ表示牌の「次の牌」がドラになります（例: 表示牌が3萬ならドラは4萬）。ドラだけでは和了できず、役が1つ必要です。',

    plain:
      '持っていると、上がったときの点数が増える牌です。画面の「ドラ」の横の牌の、次の数字の牌がドラです（3マンが出ていたら4マン）。赤い5もドラです。役ではないので、ドラだけでは上がれません。',
  },
  tenpai: {
    term: 'テンパイ',
    yomi: '聴牌',
    desc: 'あと1枚で和了できる状態です。流局したときテンパイしていると、していない人から点数をもらえます。',

    plain:
      'あと1枚で上がりの状態です。だれも上がらずに終わったとき、テンパイしていると、していない人から点数をもらえます。',
  },
  shanten: {
    term: 'シャンテン',
    yomi: '向聴',
    desc: 'テンパイまであと何枚必要かを表す数です。1シャンテンは「あと1枚でテンパイ」。',

    plain: 'テンパイ（あと1枚で上がり）まで、あと何歩かを表す数です。',
  },
  furiten: {
    term: 'フリテン',
    yomi: '振聴',
    desc: '待ち牌を自分で捨てている、または見逃した直後の状態です。この間はロンできません（ツモ和了はできます）。',

    plain:
      '自分が前に捨てた牌が上がれる牌に入っていると、ほかの人の捨て牌では上がれません（ロンできない）。自分で引けば上がれます。画面が教えてくれるので、今は気にしなくて大丈夫です。',
  },
  honba: {
    term: '本場',
    yomi: 'ほんば',
    desc: '親の連荘や流局で増える数です。1本場につき、和了したときの点数が300点増えます。',

    plain:
      '今は気にしなくて大丈夫です。同じ局がくり返されると1つ増える数で、上がったときの点数が少し増えます。',
  },
  kyotaku: {
    term: '供託',
    yomi: 'きょうたく',
    desc: 'リーチ宣言で場に出された1000点棒です。次に和了した人がまとめて受け取ります。',

    plain: 'リーチした人が出した1000点がたまっている数です。次に上がった人がまとめてもらえます。',
  },
  ukeire: {
    term: '受け入れ',
    yomi: 'うけいれ',
    desc: '引くと手が1歩進む牌のことです。受け入れ枚数が多いほど、手が進みやすくなります。',

    plain: '引くと、上がりに1歩近づく牌のことです。多いほど手が進みやすくなります。',
  },
  fu: {
    term: '符',
    yomi: 'ふ',
    desc: '手牌の形や和了の仕方で決まる点数の単位です。刻子・槓子、雀頭が役牌、待ちの形、ツモなどで増え、10符単位に切り上げます。',

    plain: '点数を決める細かい数字です。今は気にしなくて大丈夫です。',
  },
  han: {
    term: '翻',
    yomi: 'ハン',
    desc: '役とドラの数です。1翻増えるごとに点数がおよそ2倍になります。5翻以上は満貫・跳満などの決まった点数になります。',

    plain: '役とドラの数です。多いほど点数が高くなります。',
  },
  oya: {
    term: '親',
    yomi: 'おや',
    desc: '東家のことです。和了したときの点数が1.5倍になり、和了するかテンパイで流局すると親を続けられます（連荘）。',

    plain:
      'その局のリーダーの席です（画面に「親」と出ます）。上がると点数が1.5倍。上がるか、テンパイで終わると、もう一度同じ人が親になります。',
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
 * @param {boolean} [plain] 初心者モード（専門用語を使わない説明にする）
 * @returns {string}
 */
export function termSheetHtml(id, plain = false) {
  const entry = GLOSSARY[id];
  if (!entry) return '';
  return `<h2><ruby>${entry.term}<rt>${entry.yomi}</rt></ruby></h2><p>${plain ? entry.plain : entry.desc}</p>`;
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
