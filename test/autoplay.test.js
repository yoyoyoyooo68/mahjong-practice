import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mulberry32 } from '../src/core/wall.js';
import { createCpu, dangerOf, decide, visibleCounts } from '../src/cpu/base.js';
import { ATTACK, DEFENSE, PERSONALITIES } from '../src/cpu/personalities/index.js';
import { createEmitter } from '../src/game/events.js';
import { RECORD_VERSION, replay } from '../src/game/log.js';
import { createGame, next, viewFor } from '../src/game/round.js';
import { playGame, step } from '../src/game/runner.js';
import { assertInvariants, buildWall, discard, JUNK, kind, passAll, tsumogiri } from './game-helpers.js';

/** @typedef {import('../src/game/round.js').PlayerView} PlayerView */
/** @typedef {import('../src/game/state.js').Action} Action */

/**
 * 合法手からランダムに選ぶ打ち手。和了できるときは高い確率で和了する。
 * 鳴き・カン・リーチ・九種九牌を無差別に選ぶので、珍しい遷移までよく通る。
 * @param {() => number} random
 * @returns {(view: PlayerView) => Action}
 */
function randomPlayer(random) {
  return (view) => {
    const win = view.options.find((o) => o.type === 'ron' || o.type === 'tsumo');
    if (win && random() < 0.7) return win;
    return view.options[Math.floor(random() * view.options.length)];
  };
}

test('CPU同士の自動対局: 最後まで進み、牌と点数が保存される', () => {
  const cpus = PERSONALITIES.map(createCpu);
  /** @type {Record<string, number>} */
  const seen = {};
  for (let seed = 1; seed <= 40; seed++) {
    const { state } = playGame({ seed }, cpus, (s) => {
      assertInvariants(s);
      if (s.phase === 'roundEnd' && s.result) {
        const key = s.result.type === 'win' ? 'win' : String(s.result.reason);
        seen[key] = (seen[key] ?? 0) + 1;
      }
    });
    assert.equal(state.phase, 'gameEnd');
    assert.deepEqual([...state.ranking].sort(), [0, 1, 2, 3]);
    assert.ok(state.scores[state.ranking[0]] >= state.scores[state.ranking[3]]);
  }
  assert.ok(seen.win > 100, '和了が十分に出ている');
  assert.ok(seen.exhaustive > 0, '荒牌平局も出ている');
});

test('ランダムな打ち手の自動対局: どんな合法手の列でも壊れない', () => {
  /** @type {Record<string, number>} */
  const seen = {};
  for (let seed = 1; seed <= 150; seed++) {
    const random = mulberry32(seed * 7919);
    const players = [0, 1, 2, 3].map(() => randomPlayer(random));
    const { state } = playGame({ seed, startDealer: seed % 4 }, players, (s) => {
      assertInvariants(s);
      for (const e of s.events) {
        const key = e.detail ? `${e.type}:${e.detail}` : e.type;
        seen[key] = (seen[key] ?? 0) + 1;
      }
    });
    assert.equal(state.phase, 'gameEnd');
  }
  // 鳴き・カン・リーチ・各種の終わり方がひととおり通っていること
  for (const key of ['call:pon', 'call:chi', 'call:minkan', 'kan:ankan', 'kan:kakan', 'riichi', 'dora']) {
    assert.ok(seen[key] > 0, key);
  }
  for (const key of ['roundEnd:win', 'roundEnd:exhaustive', 'roundEnd:kyuushu'])
    assert.ok(seen[key] > 0, key);
});

test('牌譜: 記録を再生すると同じ対局になる', () => {
  const cpus = PERSONALITIES.map(createCpu);
  const { state, record } = playGame({ seed: 12 }, cpus);
  assert.equal(record.version, RECORD_VERSION);
  const again = replay(record);
  assert.equal(again.phase, 'gameEnd');
  assert.deepEqual(again.scores, state.scores);
  assert.deepEqual(again.ranking, state.ranking);

  // 途中までの再生は、1手ずつ進めた状態と一致する
  let s = createGame({ seed: 12 });
  for (let i = 0; i < 100; i++) s = step(s, cpus).state;
  assert.deepEqual(replay(record, 100), s);
  // JSON にして戻しても再生できる（保存・復元用）
  assert.deepEqual(replay(JSON.parse(JSON.stringify(record)), 100), s);
});

test('同じシードなら同じ対局、違うシードなら違う対局', () => {
  const cpus = PERSONALITIES.map(createCpu);
  const a = playGame({ seed: 5 }, cpus);
  const b = playGame({ seed: 5 }, cpus);
  const c = playGame({ seed: 6 }, cpus);
  assert.deepEqual(a.record.actions, b.record.actions);
  assert.notDeepEqual(a.record.actions, c.record.actions);
});

test('イベント: 購読者に順番どおり届き、解除できる', () => {
  const emitter = createEmitter();
  /** @type {string[]} */
  const got = [];
  const off = emitter.on((e) => got.push(e.type));
  let s = createGame({ seed: 1 });
  emitter.publish(s);
  assert.deepEqual(got, ['deal', 'draw']);
  s = next(s, { type: 'discard', seat: s.turn, tile: /** @type {number} */ (s.players[s.turn].drawn) });
  emitter.publish(s);
  assert.equal(got[2], 'discard');
  off();
  emitter.publish(s);
  assert.equal(got.filter((t) => t === 'discard').length, 1);
});

// --- CPUの判断 ---

const NOTEN = `${JUNK}3456z`;

test('CPU: 和了できるときは和了する', () => {
  let s = createGame({ wall: buildWall({ hands: [`${JUNK}8s345z`, '234m567p34567s99p', NOTEN, NOTEN] }) });
  s = discard(s, '8s');
  for (const who of PERSONALITIES) assert.equal(decide(viewFor(s, 1), who).type, 'ron', who.id);

  const tenhou = createGame({
    wall: buildWall({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' }),
  });
  assert.equal(decide(viewFor(tenhou, 0)).type, 'tsumo');
});

test('CPU: テンパイしたらリーチ。守備型は待ちが狭いとリーチしない', () => {
  // 両面待ち（8枚）ならどの個性もリーチ
  const wide = createGame({
    wall: buildWall({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z' }),
  });
  for (const who of PERSONALITIES) {
    const action = decide(viewFor(wide, 0), who);
    assert.equal(action.riichi, true, who.id);
    assert.equal(action.tile, wide.players[0].drawn, who.id);
  }
  // 3索のペンチャン待ち。ドラ表示牌に1枚見えていて残り3枚: 守備型はダマ、攻撃型はリーチ
  const narrow = createGame({
    wall: buildWall({ hands: ['123p456p789p12s99m', NOTEN, NOTEN, NOTEN], live: '7z', dora: '3s' }),
  });
  assert.equal(decide(viewFor(narrow, 0), ATTACK).riichi, true);
  assert.equal(decide(viewFor(narrow, 0), DEFENSE).riichi, undefined);
});

test('CPU: リーチを受けたら、遠い手は現物を切って降りる', () => {
  // 席0がリーチ（1巡目に7索を切っている）。席1は遠い手で、7索を持っている
  let s = createGame({
    wall: buildWall({
      hands: ['234m567p345s67s99p', '147m258p369s7s46z5m', NOTEN, NOTEN],
      live: '7s2z',
      dora: '1z',
    }),
  });
  s = passAll(discard(s, undefined, true));
  assert.equal(s.players[0].riichi, 2);
  assert.equal(s.turn, 1);
  const view = viewFor(s, 1);
  const visible = visibleCounts(view);
  assert.equal(dangerOf(kind('7s'), view, [0], visible), 0, '現物は危険度0');
  assert.ok(dangerOf(kind('5m'), view, [0], visible) > dangerOf(kind('4z'), view, [0], visible));
  const action = decide(view, DEFENSE);
  assert.equal(action.type, 'discard');
  assert.equal(action.tile !== undefined && action.tile >> 2, kind('7s'), '現物の7索を切る');
});

test('CPU: 役牌はポンする。門前型は鳴かない', () => {
  // 席0が白を切る。席1は白の対子を持ち、鳴けばテンパイに近づく
  let s = createGame({
    wall: buildWall({
      hands: [`${JUNK}5z346z`, '234m567p34s55z99m1m', `${JUNK}3467z`, `${JUNK}3467z`],
      dora: '1z',
    }),
  });
  s = discard(s, '5z');
  const view = viewFor(s, 1);
  for (const who of PERSONALITIES) {
    assert.equal(decide(view, who).type, who.id === 'menzen' ? 'pass' : 'pon', who.id);
  }
});

test('CPU: 行動できない場面で呼ぶと例外', () => {
  const s = tsumogiri(createGame({ seed: 3 }));
  const idle = [0, 1, 2, 3].find((seat) => s.options[seat].length === 0);
  assert.throws(() => decide(viewFor(s, /** @type {number} */ (idle))));
});
