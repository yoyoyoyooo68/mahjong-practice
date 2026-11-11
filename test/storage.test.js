import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCpu } from '../src/cpu/base.js';
import { PERSONALITIES } from '../src/cpu/personalities/index.js';
import { replay } from '../src/game/log.js';
import { createGame } from '../src/game/round.js';
import { playGame, step } from '../src/game/runner.js';
import {
  defaultStore,
  exportStore,
  loadStore,
  migrate,
  recordGame,
  recordRound,
  resetStore,
  STORE_KEY,
  STORE_VERSION,
  saveStore,
  statsSummary,
} from '../src/storage/store.js';

/** メモリ上の localStorage の代わり */
function fakeStorage() {
  /** @type {Map<string, string>} */
  const data = new Map();
  return {
    data,
    /** @param {string} key */
    getItem: (key) => data.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => {
      data.set(key, value);
    },
    /** @param {string} key */
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

test('保存データがなければ初期状態（壊れている扱いにはしない）', () => {
  const { store, corrupted } = loadStore(fakeStorage());
  assert.deepEqual(store, defaultStore());
  assert.equal(corrupted, false);
  assert.equal(store.version, STORE_VERSION);
  assert.equal(store.settings.sound, false, '効果音は初期オフ');
});

test('保存して読み直すと同じ内容になる', () => {
  const storage = fakeStorage();
  const store = defaultStore();
  store.settings.redDora = false;
  store.stats = recordGame(recordRound(store.stats, { won: true, dealtIn: false }), 1);
  assert.equal(saveStore(storage, store), true);
  assert.deepEqual(loadStore(storage), { store, corrupted: false });
});

test('壊れたデータは初期状態に戻し、corrupted を立てる', () => {
  for (const text of ['{broken', 'null', '[]', '{"version":"1"}', '{"version":999}', '{"version":0}']) {
    const storage = fakeStorage();
    storage.setItem(STORE_KEY, text);
    const { store, corrupted } = loadStore(storage);
    assert.deepEqual(store, defaultStore(), text);
    assert.equal(corrupted, true, text);
  }
});

test('一部が欠けたり型が違っていても、読める部分は残して既定値で補う', () => {
  const store = migrate({
    version: 1,
    settings: { redDora: false, sound: 'yes' },
    stats: { games: 3, ranks: [1, 1, 1], rounds: -5, wins: 2.5 },
    suspended: { record: { version: 1, config: {}, actions: 'x' } },
  });
  assert.ok(store);
  assert.deepEqual(store.settings, { redDora: false, sound: false, onboardingDone: false });
  assert.deepEqual(store.stats, { games: 3, ranks: [0, 0, 0, 0], rounds: 0, wins: 0, dealIns: 0 });
  assert.equal(store.suspended, null, '形のおかしい中断データは捨てる');
});

test('読み書きで例外が出ても落ちない（プライベートモードや容量超過）', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  assert.deepEqual(loadStore(broken), { store: defaultStore(), corrupted: true });
  assert.equal(saveStore(broken, defaultStore()), false);
  assert.deepEqual(resetStore(broken), defaultStore());
});

test('中断中の対局: 牌譜を保存して読み直し、再生すると同じ局面に戻る', () => {
  const cpus = PERSONALITIES.map(createCpu);
  const config = { seed: 21, startDealer: 1, rules: { redDora: false } };
  let state = createGame(config);
  /** @type {import('../src/game/state.js').Action[]} */
  const actions = [];
  for (let i = 0; i < 80; i++) {
    const result = step(state, cpus);
    state = result.state;
    actions.push(result.action);
  }
  const storage = fakeStorage();
  const store = {
    ...defaultStore(),
    suspended: { record: { version: 1, config, actions }, hintUses: 2, hintTotal: 5 },
  };
  saveStore(storage, store);
  const loaded = loadStore(storage).store;
  assert.ok(loaded.suspended);
  assert.equal(loaded.suspended.hintUses, 2);
  assert.equal(loaded.suspended.hintTotal, 5);
  const restored = replay(loaded.suspended.record);
  assert.deepEqual(restored, state);
  assert.equal(restored.rules.redDora, false);
  assert.equal(restored.startDealer, 1);
});

test('中断データの牌譜が途中で壊れていたら、再生は例外になる（呼び出し側で新規開始に切り替える）', () => {
  const { record } = playGame({ seed: 4 }, PERSONALITIES.map(createCpu));
  const broken = { ...record, actions: [...record.actions.slice(0, 30), { type: 'tsumo', seat: 2 }] };
  assert.throws(() => replay(/** @type {typeof record} */ (broken)));
});

test('書き出しは中断中の対局を含まない。リセットで消える', () => {
  const storage = fakeStorage();
  const store = {
    ...defaultStore(),
    suspended: { record: { version: 1, config: {}, actions: [] }, hintUses: 0, hintTotal: 0 },
  };
  saveStore(storage, store);
  const exported = JSON.parse(exportStore(store));
  assert.equal(exported.suspended, null);
  assert.equal(exported.version, STORE_VERSION);
  assert.deepEqual(resetStore(storage), defaultStore());
  assert.equal(storage.data.size, 0);
});

test('成績: 着順分布・和了率・放銃率', () => {
  let stats = defaultStore().stats;
  assert.deepEqual(statsSummary(stats), { averageRank: '—', winRate: '—', dealInRate: '—' });
  stats = recordRound(stats, { won: true, dealtIn: false });
  stats = recordRound(stats, { won: false, dealtIn: true });
  stats = recordRound(stats, { won: false, dealtIn: false });
  stats = recordRound(stats, { won: false, dealtIn: false });
  stats = recordGame(stats, 0);
  stats = recordGame(stats, 3);
  assert.deepEqual(stats, { games: 2, ranks: [1, 0, 0, 1], rounds: 4, wins: 1, dealIns: 1 });
  assert.deepEqual(statsSummary(stats), { averageRank: '2.50', winRate: '25.0%', dealInRate: '25.0%' });
});
