// 保存データ（設定・成績・中断中の対局）。localStorage に version 付きで保存する。
// 読み書きは必ず try/catch で囲み、壊れていたら初期状態に戻す（中断中の対局は捨てる）。

import { RECORD_VERSION } from '../game/log.js';

/** @typedef {import('../game/log.js').GameRecord} GameRecord */

export const STORE_KEY = 'mahjong-practice';
export const STORE_VERSION = 1;

/**
 * @typedef {object} Settings
 * @property {boolean} redDora 赤ドラあり
 * @property {boolean} sound 効果音
 * @property {boolean} onboardingDone 初回の使い方表示を見終えたか
 * @property {boolean} beginner 初心者モード（次の対局から）
 * @property {boolean} tileNames 初心者モードで手牌の下に牌の名前を出す
 */

/**
 * @typedef {object} Stats
 * @property {number} games 対局数
 * @property {number[]} ranks 着順の回数（1位〜4位）
 * @property {number} rounds 局数
 * @property {number} wins 和了した局数
 * @property {number} dealIns 放銃した局数
 */

/**
 * @typedef {object} Suspended 中断中の対局
 * @property {GameRecord} record 牌譜（これを再生して復元する）
 * @property {number} hintUses この局のヒント使用回数
 * @property {number} hintTotal 対局全体のヒント使用回数
 */

/**
 * @typedef {object} Store
 * @property {number} version
 * @property {Settings} settings
 * @property {Stats} stats
 * @property {Suspended | null} suspended
 * @property {string[]} lessonsDone 終えたはじめてレッスンの id
 */

/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} StorageLike */

/** @returns {Store} */
export function defaultStore() {
  return {
    version: STORE_VERSION,
    settings: { redDora: true, sound: false, onboardingDone: false, beginner: false, tileNames: true },
    stats: { games: 0, ranks: [0, 0, 0, 0], rounds: 0, wins: 0, dealIns: 0 },
    suspended: null,
    lessonsDone: [],
  };
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {unknown} v @param {number} fallback */
const count = (v, fallback) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback);

/** @param {unknown} v @param {boolean} fallback */
const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

/**
 * 読み込んだデータを現在の形式に直す。直せなければ null（＝壊れている）。
 * 古い版からの移行はここに足していく。
 * @param {unknown} raw
 * @returns {Store | null}
 */
export function migrate(raw) {
  if (!isObject(raw) || typeof raw.version !== 'number') return null;
  // 新しすぎる版のデータは読めない（古いアプリで上書きしないよう、壊れている扱いにする）
  if (raw.version < 1 || raw.version > STORE_VERSION) return null;
  const base = defaultStore();
  const settings = isObject(raw.settings) ? raw.settings : {};
  const stats = isObject(raw.stats) ? raw.stats : {};
  const ranks = Array.isArray(stats.ranks) && stats.ranks.length === 4 ? stats.ranks : base.stats.ranks;

  /** @type {Suspended | null} */
  let suspended = null;
  const s = raw.suspended;
  if (
    isObject(s) &&
    isObject(s.record) &&
    s.record.version === RECORD_VERSION &&
    isObject(s.record.config) &&
    Array.isArray(s.record.actions)
  ) {
    suspended = {
      record: /** @type {GameRecord} */ (/** @type {unknown} */ (s.record)),
      hintUses: count(s.hintUses, 0),
      hintTotal: count(s.hintTotal, 0),
    };
  }
  return {
    version: STORE_VERSION,
    settings: {
      redDora: flag(settings.redDora, base.settings.redDora),
      sound: flag(settings.sound, base.settings.sound),
      onboardingDone: flag(settings.onboardingDone, base.settings.onboardingDone),
      beginner: flag(settings.beginner, base.settings.beginner),
      tileNames: flag(settings.tileNames, base.settings.tileNames),
    },
    stats: {
      games: count(stats.games, 0),
      ranks: ranks.map((n) => count(n, 0)),
      rounds: count(stats.rounds, 0),
      wins: count(stats.wins, 0),
      dealIns: count(stats.dealIns, 0),
    },
    suspended,
    // 版1の途中で足した項目。古いデータにはないので空にする
    lessonsDone: Array.isArray(raw.lessonsDone)
      ? [...new Set(raw.lessonsDone.filter((id) => typeof id === 'string'))]
      : [],
  };
}

/**
 * @param {StorageLike} storage
 * @returns {{ store: Store, corrupted: boolean }} corrupted は「保存データがあったが読めなかった」
 */
export function loadStore(storage) {
  try {
    const text = storage.getItem(STORE_KEY);
    if (text === null) return { store: defaultStore(), corrupted: false };
    const store = migrate(JSON.parse(text));
    if (store) return { store, corrupted: false };
  } catch {
    // 読めない・JSONでない場合は下で初期状態を返す
  }
  return { store: defaultStore(), corrupted: true };
}

/**
 * @param {StorageLike} storage
 * @param {Store} store
 * @returns {boolean} 保存できたか（容量超過やプライベートモードでは false）
 */
export function saveStore(storage, store) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {StorageLike} storage
 * @returns {Store}
 */
export function resetStore(storage) {
  try {
    storage.removeItem(STORE_KEY);
  } catch {
    // 消せなくても初期状態で続ける
  }
  return defaultStore();
}

/**
 * 書き出し用の文字列（中断中の対局は含めない）。
 * @param {Store} store
 * @returns {string}
 */
export function exportStore(store) {
  return JSON.stringify({ ...store, suspended: null }, null, 2);
}

/**
 * @param {Stats} stats
 * @param {{ won: boolean, dealtIn: boolean }} round
 * @returns {Stats}
 */
export function recordRound(stats, round) {
  return {
    ...stats,
    rounds: stats.rounds + 1,
    wins: stats.wins + (round.won ? 1 : 0),
    dealIns: stats.dealIns + (round.dealtIn ? 1 : 0),
  };
}

/**
 * @param {Stats} stats
 * @param {number} rank 0=1位 … 3=4位
 * @returns {Stats}
 */
export function recordGame(stats, rank) {
  return { ...stats, games: stats.games + 1, ranks: stats.ranks.map((n, i) => (i === rank ? n + 1 : n)) };
}

/**
 * @param {Stats} stats
 * @returns {{ averageRank: string, winRate: string, dealInRate: string }} 表示用（データがなければ「—」）
 */
export function statsSummary(stats) {
  /** @param {number} a @param {number} b */
  const rate = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
  const total = stats.ranks.reduce((sum, n, i) => sum + n * (i + 1), 0);
  return {
    averageRank: stats.games > 0 ? (total / stats.games).toFixed(2) : '—',
    winRate: rate(stats.wins, stats.rounds),
    dealInRate: rate(stats.dealIns, stats.rounds),
  };
}
