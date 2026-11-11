// 対局セッション: 状態機械・CPU・牌譜をまとめて進行させる。画面の描画はしない（onChange で知らせる）。
// 自分は席0。CPUは少し間をおいて打つ。鳴き・リーチの直後3秒は取り消せる。

import { decide } from '../cpu/base.js';
import { PERSONALITIES } from '../cpu/personalities/index.js';
import { appendAction, createRecord, replay } from '../game/log.js';
import { createGame, next, viewFor } from '../game/round.js';
import { nextActor } from '../game/runner.js';

/** @typedef {import('../game/state.js').GameState} GameState */
/** @typedef {import('../game/state.js').GameConfig} GameConfig */
/** @typedef {import('../game/state.js').Action} Action */
/** @typedef {import('../game/log.js').GameRecord} GameRecord */
/** @typedef {import('../storage/store.js').Suspended} Suspended */

export const ME = 0;
export const UNDO_MS = 3000;

/**
 * 対局の設定から、席ごとのCPU（席0は null）を決める。同じシードなら同じ顔ぶれになる。
 * @param {GameConfig} config
 */
export function cpusFor(config) {
  const seed = config.seed ?? 1;
  return [null, 1, 2, 3].map((seat) =>
    seat === null ? null : PERSONALITIES[(seed + seat) % PERSONALITIES.length],
  );
}

/**
 * @typedef {object} SessionHooks
 * @property {() => void} onChange 状態が変わった（描画し直す）
 * @property {(state: GameState) => void} [onEvents] 遷移で起きたイベントを受け取る（効果音など）
 * @property {(data: Suspended | null) => void} [onSave] 中断データの保存（null は破棄）
 * @property {(round: { won: boolean, dealtIn: boolean }) => void} [onRoundEnd]
 * @property {(rank: number) => void} [onGameEnd] 自分の順位 (0=1位)
 * @property {{ cpuTurn: number, cpuResponse: number, auto: number }} [delays] 待ち時間(ms)
 */

/**
 * @param {SessionHooks} hooks
 */
export function createSession(hooks) {
  const delays = hooks.delays ?? { cpuTurn: 450, cpuResponse: 150, auto: 600 };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let undoTimer;
  /** @type {{ state: GameState, record: GameRecord, hintUses: number, hintTotal: number } | null} */
  let undoPoint = null;

  const session = {
    /** @type {GameState | null} */
    state: null,
    /** @type {GameRecord} */
    record: createRecord(),
    /** @type {(import('../cpu/personalities/index.js').Personality | null)[]} */
    cpus: [null, null, null, null],
    names: ['あなた', '', '', ''],
    /** 画面側の一時的な状態 */
    ui: {
      /** @type {number | null} 選択中（持ち上げている）牌 */
      selected: null,
      riichiMode: false,
      hintOn: false,
      /** この局のヒント使用回数 */
      hintUses: 0,
      /** 対局全体のヒント使用回数 */
      hintTotal: 0,
      /** 結果画面の段階開示（0=役, 1=符・翻, 2=点数, 3=点数移動） */
      resultStep: 0,
      canUndo: false,
      paused: false,
    },

    /** @param {GameConfig} config */
    start(config) {
      stopTimers();
      session.record = createRecord(config);
      session.state = createGame(config);
      setup(config);
      resetUi(0, 0);
      persist();
      hooks.onEvents?.(session.state);
      hooks.onChange();
      schedule();
    },

    /**
     * 中断データから再開する。壊れていて再生できなければ false。
     * @param {Suspended} data
     */
    resume(data) {
      stopTimers();
      try {
        session.state = replay(data.record);
      } catch {
        session.state = null;
        return false;
      }
      session.record = data.record;
      setup(data.record.config);
      resetUi(data.hintUses, data.hintTotal);
      hooks.onChange();
      schedule();
      return true;
    },

    /** 自分が選んだ行動を適用する。 @param {Action} action */
    act(action) {
      const before = session.state;
      if (!before || session.ui.paused) return;
      const snapshot = {
        state: before,
        record: session.record,
        hintUses: session.ui.hintUses,
        hintTotal: session.ui.hintTotal,
      };
      const decision = action.type !== 'nextRound';
      if (decision && session.ui.hintOn) {
        session.ui.hintUses++;
        session.ui.hintTotal++;
      }
      apply(action);
      // 鳴き・リーチは3秒間取り消せる（カンは新しい牌が見えるので対象外）
      const undoable = action.type === 'pon' || action.type === 'chi' || Boolean(action.riichi);
      if (undoable && session.state?.phase !== 'roundEnd') {
        undoPoint = snapshot;
        session.ui.canUndo = true;
        undoTimer = setTimeout(() => {
          clearUndo();
          hooks.onChange();
          schedule();
        }, UNDO_MS);
      }
      hooks.onChange();
      schedule();
    },

    /** 直前の鳴き・リーチを取り消す。 */
    undo() {
      if (!undoPoint) return;
      const point = undoPoint;
      clearUndo();
      clearTimeout(timer);
      session.state = point.state;
      session.record = point.record;
      session.ui.hintUses = point.hintUses;
      session.ui.hintTotal = point.hintTotal;
      session.ui.selected = null;
      session.ui.riichiMode = false;
      persist();
      hooks.onChange();
      schedule();
    },

    /** @param {number | null} tile */
    select(tile) {
      session.ui.selected = tile;
      hooks.onChange();
    },

    /** @param {boolean} on */
    setRiichiMode(on) {
      session.ui.riichiMode = on;
      session.ui.selected = null;
      hooks.onChange();
    },

    toggleHint() {
      session.ui.hintOn = !session.ui.hintOn;
      hooks.onChange();
    },

    /** 結果画面を1段階進める。 @param {boolean} [all] */
    revealResult(all = false) {
      session.ui.resultStep = all ? 3 : Math.min(3, session.ui.resultStep + 1);
      hooks.onChange();
    },

    /** 一時停止（バックグラウンド復帰時や、シートを開いている間）。 @param {boolean} paused */
    setPaused(paused) {
      if (session.ui.paused === paused) return;
      session.ui.paused = paused;
      if (paused) clearTimeout(timer);
      else schedule();
    },

    /** 対局画面を離れる（中断データは残す）。 */
    stop() {
      stopTimers();
      session.state = null;
    },
  };

  /** @param {GameConfig} config */
  function setup(config) {
    session.cpus = cpusFor(config);
    session.names = session.cpus.map((cpu) => (cpu ? cpu.name : 'あなた'));
  }

  /** @param {number} hintUses @param {number} hintTotal */
  function resetUi(hintUses, hintTotal) {
    Object.assign(session.ui, {
      selected: null,
      riichiMode: false,
      hintUses,
      hintTotal,
      resultStep: 0,
      canUndo: false,
      paused: false,
    });
  }

  function clearUndo() {
    clearTimeout(undoTimer);
    undoPoint = null;
    session.ui.canUndo = false;
  }

  function stopTimers() {
    clearTimeout(timer);
    clearUndo();
  }

  function persist() {
    const s = session.state;
    if (!s || s.phase === 'gameEnd') hooks.onSave?.(null);
    else
      hooks.onSave?.({
        record: session.record,
        hintUses: session.ui.hintUses,
        hintTotal: session.ui.hintTotal,
      });
  }

  /** @param {Action} action */
  function apply(action) {
    const before = /** @type {GameState} */ (session.state);
    clearUndo();
    const state = next(before, action);
    session.state = state;
    session.record = appendAction(session.record, action);
    session.ui.selected = null;
    session.ui.riichiMode = false;
    if (action.type === 'nextRound') {
      session.ui.hintUses = 0;
      session.ui.resultStep = 0;
    }
    if (state.phase === 'roundEnd' && before.phase !== 'roundEnd' && state.result) {
      // 流局は段階開示するものがないので最初から全部見せる
      session.ui.resultStep = state.result.type === 'win' ? 0 : 3;
      hooks.onRoundEnd?.({
        won: state.result.wins.some((w) => w.seat === ME),
        dealtIn: state.result.wins.some((w) => w.from === ME),
      });
    }
    if (state.phase === 'gameEnd') hooks.onGameEnd?.(state.ranking.indexOf(ME));
    persist();
    hooks.onEvents?.(state);
  }

  /** 次に動くのがCPUなら、少し間をおいて打たせる。 */
  function schedule() {
    clearTimeout(timer);
    const state = session.state;
    if (!state || session.ui.paused || undoPoint) return;
    const seat = nextActor(state);
    if (seat === -1) return;
    if (seat === ME) {
      // リーチ後など、ツモ切りしか選べないときは自動で切る
      const options = state.options[ME];
      if (options.length === 1 && options[0].type === 'discard') {
        timer = setTimeout(() => {
          apply(options[0]);
          hooks.onChange();
          schedule();
        }, delays.auto);
      }
      return;
    }
    const who = session.cpus[seat] ?? PERSONALITIES[0];
    timer = setTimeout(
      () => {
        apply(decide(viewFor(state, seat), who));
        hooks.onChange();
        schedule();
      },
      state.phase === 'turn' ? delays.cpuTurn : delays.cpuResponse,
    );
  }

  return session;
}

/** @typedef {ReturnType<typeof createSession>} Session */
