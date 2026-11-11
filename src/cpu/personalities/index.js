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

/** @type {readonly Readonly<Personality>[]} */
export const PERSONALITIES = Object.freeze([BALANCE, ATTACK, DEFENSE, MENZEN]);
