// CPUの個性。打ち筋の違いはすべてパラメータの差で表す（共通の判断は ../base.js）。

/**
 * @typedef {object} Personality
 * @property {string} id
 * @property {string} name 表示名
 * @property {string} style 「守備型」など
 * @property {string} desc 打ち筋の説明
 * @property {number} foldShanten リーチを受けたとき、自分がこのシャンテン数以上ならベタオリする（0 ならテンパイでも降りる）
 * @property {number} riichiMinWaits リーチをかける最低の待ち枚数
 * @property {boolean} callYakuhai 役牌をポンするか
 * @property {boolean} callTanyao 喰いタンで鳴くか
 * @property {boolean} callSpeculative 役牌の対子があるだけでも先に鳴いて進めるか
 * @property {number} callMaxShanten このシャンテン数以下になる鳴きだけする（遠い手では鳴かない）
 * @property {boolean} kan 暗槓・加槓をするか
 * @property {number} [mistakeRate] わざと少し悪い牌を切る割合（0〜100）。初心者モードの相手だけが使う
 */

/** @type {Readonly<Personality>} */
export const BALANCE = Object.freeze({
  id: 'balance',
  name: 'ミナト',
  style: 'バランス型',
  desc: '手なりで進め、リーチを受けたら遠い手は降りる。役牌とタンヤオは鳴く。',
  foldShanten: 2,
  riichiMinWaits: 1,
  callYakuhai: true,
  callTanyao: true,
  callSpeculative: false,
  callMaxShanten: 1,
  kan: true,
});

/** @type {Readonly<Personality>} */
export const ATTACK = Object.freeze({
  id: 'attack',
  name: 'ゴウ',
  style: '攻撃型',
  desc: 'リーチを受けてもほとんど降りない。よく鳴き、カンもする。',
  foldShanten: 3,
  riichiMinWaits: 1,
  callYakuhai: true,
  callTanyao: true,
  callSpeculative: true,
  callMaxShanten: 3,
  kan: true,
});

/** @type {Readonly<Personality>} */
export const DEFENSE = Object.freeze({
  id: 'defense',
  name: 'シズカ',
  style: '守備型',
  desc: 'リーチを受けたらテンパイしていない限り降りる。鳴きは役牌だけ、待ちが広いときにリーチ。',
  foldShanten: 1,
  riichiMinWaits: 4,
  callYakuhai: true,
  callTanyao: false,
  callSpeculative: false,
  callMaxShanten: 1,
  kan: false,
});

/** @type {Readonly<Personality>} */
export const MENZEN = Object.freeze({
  id: 'menzen',
  name: 'リツ',
  style: '門前型',
  desc: '鳴かずに手を育てて、テンパイしたら必ずリーチをかける。',
  foldShanten: 2,
  riichiMinWaits: 1,
  callYakuhai: false,
  callTanyao: false,
  callSpeculative: false,
  callMaxShanten: 0,
  kan: true,
});

/**
 * 初心者モードの相手。鳴かず、テンパイしたら必ずリーチする（黙ったままのテンパイがないので、危険がリーチで見える）。
 * リーチを受けたらテンパイ以外は降りる。テンパイしていないときは7割の手番で少し悪い牌を切る（ドラ・赤五は切らない）。
 * CPU同士の自動対局で、和了率は普通の相手の約20%に対して約10%。CPU同士の自動対局では、和了率が普通の相手の約20%から約8%に下がる。
 * @param {string} id
 * @param {string} name
 * @returns {Readonly<Personality>}
 */
const gentle = (id, name) =>
  Object.freeze({
    id,
    name,
    style: 'やさしい',
    desc: '鳴かず、テンパイしたら必ずリーチ。リーチを受けるとすぐ降りる。ときどき牌の選び方をまちがえる。',
    foldShanten: 1,
    riichiMinWaits: 1,
    callYakuhai: false,
    callTanyao: false,
    callSpeculative: false,
    callMaxShanten: -1,
    kan: false,
    mistakeRate: 70,
  });

/** 初心者モードの3人（席1〜3の順） @type {readonly Readonly<Personality>[]} */
export const GENTLE = Object.freeze([
  gentle('gentle-1', 'ハル'),
  gentle('gentle-2', 'ナツ'),
  gentle('gentle-3', 'アキ'),
]);

/** @type {readonly Readonly<Personality>[]} */
export const PERSONALITIES = Object.freeze([BALANCE, ATTACK, DEFENSE, MENZEN]);
