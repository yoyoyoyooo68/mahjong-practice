// 状態機械のテスト用の小道具。配牌やツモ順を指定した牌山を組み立てる。

import assert from 'node:assert/strict';
import { isRed, kindOf, parseTiles } from '../src/core/tiles.js';
import { next, waitingSeats } from '../src/game/round.js';

/** @typedef {import('../src/game/state.js').GameState} GameState */
/** @typedef {import('../src/game/state.js').Action} Action */

/** 一九字牌を多く含まない、どうやっても和了に遠い9枚（4人ぶん使える） */
export const JUNK = '147m258p369s';

/**
 * 親が席0の局の牌山（136枚）を組み立てる。指定しなかった場所は、残りの牌を牌IDの小さい順に詰める。
 * @param {object} spec
 * @param {string[]} spec.hands 席0〜3の配牌（各13枚）
 * @param {string} [spec.live] ツモ山の先頭から順に引かれる牌（親の第1ツモが先頭）
 * @param {Record<number, string>} [spec.liveAt] ツモ山の位置(0-69)を指定して置く牌
 * @param {string} [spec.liveEnd] ツモ山の最後に置く牌（最後の1枚が海底牌）
 * @param {string} [spec.rinshan] 嶺上牌（先頭から引く）
 * @param {string} [spec.dora] ドラ表示牌（先頭から順にめくる）
 * @param {string} [spec.ura] 裏ドラ表示牌
 * @returns {number[]}
 */
export function buildWall(spec) {
  /** @type {Set<number>} */
  const used = new Set();
  const hands = spec.hands.map((h) => parseTiles(h, used));
  for (const [seat, h] of hands.entries()) assert.equal(h.length, 13, `席${seat}の配牌は13枚`);
  const head = parseTiles(spec.live ?? '', used);
  const tail = parseTiles(spec.liveEnd ?? '', used);
  const at = Object.entries(spec.liveAt ?? {}).map(
    ([index, text]) => /** @type {[number, number]} */ ([Number(index), parseTiles(text, used)[0]]),
  );
  const rinshan = parseTiles(spec.rinshan ?? '', used);
  const dora = parseTiles(spec.dora ?? '', used);
  const ura = parseTiles(spec.ura ?? '', used);

  const rest = Array.from({ length: 136 }, (_, id) => id).filter((id) => !used.has(id));
  const take = () => /** @type {number} */ (rest.shift());

  /** @type {number[]} */
  const live = new Array(70).fill(-1);
  head.forEach((t, i) => {
    live[i] = t;
  });
  tail.forEach((t, i) => {
    live[70 - tail.length + i] = t;
  });
  for (const [index, tile] of at) live[index] = tile;
  for (let i = 0; i < 70; i++) if (live[i] === -1) live[i] = take();
  while (rinshan.length < 4) rinshan.push(take());
  while (dora.length < 5) dora.push(take());
  while (ura.length < 5) ura.push(take());

  /** @type {number[]} */
  const wall = [];
  for (let round = 0; round < 3; round++) {
    for (let seat = 0; seat < 4; seat++) wall.push(...hands[seat].slice(round * 4, round * 4 + 4));
  }
  for (let seat = 0; seat < 4; seat++) wall.push(hands[seat][12]);
  wall.push(...live, ...rinshan);
  for (let i = 0; i < 5; i++) wall.push(dora[i], ura[i]);
  assert.equal(new Set(wall).size, 136, '牌山は136枚で重複なし');
  return wall;
}

/**
 * @param {string} text 1枚の表記（"5p"、赤は "0p"）
 * @returns {number} 牌種
 */
export function kind(text) {
  return kindOf(parseTiles(text)[0]);
}

/**
 * @param {GameState} s
 * @param {number} seat
 * @param {Action['type']} type
 * @returns {Action[]} その種類の合法手
 */
export function optionsOf(s, seat, type) {
  return s.options[seat].filter((o) => o.type === type);
}

/**
 * 応答待ちの全員がパスする。
 * @param {GameState} s
 * @returns {GameState}
 */
export function passAll(s) {
  let state = s;
  while (state.phase === 'response') {
    state = next(state, { type: 'pass', seat: waitingSeats(state)[0] });
  }
  return state;
}

/**
 * 手番の人が、指定した牌（省略時はツモ牌）を切る。他家の応答は処理しない。
 * @param {GameState} s
 * @param {string} [text] 切る牌。省略するとツモ切り
 * @param {boolean} [riichi]
 * @returns {GameState}
 */
export function discard(s, text, riichi = false) {
  const p = s.players[s.turn];
  let tile = p.drawn;
  if (text !== undefined) {
    const wantRed = text.startsWith('0');
    tile = p.hand.find((t) => kindOf(t) === kind(text) && isRed(t) === wantRed) ?? null;
  }
  assert.notEqual(tile, null, `切る牌が手にありません: ${text ?? 'ツモ牌'}`);
  return next(s, {
    type: 'discard',
    seat: s.turn,
    tile: /** @type {number} */ (tile),
    riichi: riichi || undefined,
  });
}

/**
 * ツモ切りして、他家は全員パスする。
 * @param {GameState} s
 * @returns {GameState}
 */
export function tsumogiri(s) {
  return passAll(discard(s));
}

/**
 * 条件を満たすか局が終わるまで、全員がツモ切り・パスを続ける。
 * @param {GameState} s
 * @param {(state: GameState) => boolean} [until]
 * @returns {GameState}
 */
export function playPassive(s, until = () => false) {
  let state = s;
  while (state.phase === 'turn' && !until(state)) state = tsumogiri(state);
  return state;
}

/**
 * 牌の枚数・点数・手牌の枚数が壊れていないか検査する。
 * @param {GameState} s
 */
export function assertInvariants(s) {
  const total = s.scores.reduce((a, b) => a + b, 0) + s.kyotaku * 1000;
  assert.equal(total, s.rules.startPoints * 4, '点数の合計（供託込み）が保存される');
  if (s.phase === 'gameEnd') return;

  const tiles = [
    ...s.live.slice(s.livePos),
    ...s.rinshan.slice(s.rinshanPos),
    ...s.doraIndicators,
    ...s.uraIndicators,
  ];
  s.players.forEach((p, seat) => {
    tiles.push(...p.hand, ...p.melds.flatMap((m) => m.tiles));
    for (const d of p.discards) if (!d.called) tiles.push(d.tile);
    const size = p.hand.length + p.melds.length * 3;
    const holding = s.phase === 'turn' && s.turn === seat;
    if (s.phase === 'roundEnd') assert.ok(size === 13 || size === 14, `席${seat}の手牌の枚数`);
    else if (s.phase === 'turn') assert.equal(size, holding ? 14 : 13, `席${seat}の手牌の枚数`);
    if (s.phase === 'turn' && !holding) assert.equal(s.options[seat].length, 0, '手番以外は行動できない');
  });
  assert.equal(tiles.length, 136, '牌は136枚');
  assert.equal(new Set(tiles).size, 136, '牌に重複がない');
  if (s.phase === 'turn') assert.ok(s.options[s.turn].length > 0, '手番の人には合法手がある');
  assert.ok(s.doraRevealed >= 1 && s.doraRevealed <= 5);
}
