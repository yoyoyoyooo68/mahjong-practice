// 対局の状態（不変データ）。遷移は round.js の next() が行う。
// ここには型の定義と、対局開始・配牌という「状態を作るだけ」の処理を置く。

import { DEFAULT_RULES } from '../core/rules.js';
import { createWall, deal } from '../core/wall.js';

/** @typedef {import('../core/rules.js').Rules} Rules */
/** @typedef {import('../core/score.js').HandResult} HandResult */

/**
 * @typedef {object} GameMeld 副露（暗槓含む）
 * @property {import('../core/agari.js').MeldType} type
 * @property {number[]} tiles 牌ID（鳴いた牌が先頭）
 * @property {number} from 鳴かせた席（暗槓は -1）
 */

/**
 * @typedef {object} Discard
 * @property {number} tile
 * @property {boolean} riichi リーチ宣言牌か
 * @property {boolean} called 他家に鳴かれたか
 * @property {boolean} tsumogiri ツモ切りか
 */

/**
 * @typedef {object} PlayerState
 * @property {number[]} hand 手の内の牌ID（自分の手番中はツモ牌も含む）
 * @property {number | null} drawn ツモ牌（鳴いた直後・手番外は null）
 * @property {GameMeld[]} melds
 * @property {Discard[]} discards
 * @property {number} riichi 0=なし, 1=立直, 2=ダブル立直
 * @property {boolean} ippatsu 一発の権利があるか
 * @property {boolean} furitenTemp 同巡内フリテン（次の自分のツモで解除）
 * @property {boolean} furitenPerm リーチ後の見逃しによるフリテン（局の終わりまで）
 */

/**
 * @typedef {object} Action
 * @property {'discard' | 'tsumo' | 'ankan' | 'kakan' | 'kyuushu' | 'ron' | 'pon' | 'chi' | 'minkan' | 'pass' | 'nextRound'} type
 * @property {number} seat 行動する席（nextRound では使わない）
 * @property {number} [tile] 打牌・加槓する牌ID
 * @property {number} [kind] 暗槓する牌種
 * @property {boolean} [riichi] リーチ宣言つきの打牌か
 * @property {number[]} [tiles] ポン・チーで手から出す2枚の牌ID
 */

/**
 * @typedef {object} Pending 他家の応答待ち
 * @property {'discard' | 'kakan' | 'ankan'} kind
 * @property {number} tile 対象の牌ID
 * @property {number} from 打牌・カンした席
 * @property {boolean} riichi リーチ宣言牌か
 * @property {boolean} doubleRiichi 成立すればダブル立直か
 * @property {Record<number, Action>} responses 席 → 応答
 */

/**
 * @typedef {object} WinInfo
 * @property {number} seat 和了者
 * @property {number | null} from 放銃者（ツモなら null）
 * @property {number} tile 和了牌
 * @property {HandResult} hand
 * @property {number[]} deltas この和了による点棒の移動
 */

/** @typedef {'exhaustive' | 'kyuushu' | 'suufon' | 'suucha' | 'suukan' | 'sanchahou'} DrawReason */

/**
 * @typedef {object} RoundResult
 * @property {'win' | 'draw'} type
 * @property {WinInfo[]} wins
 * @property {DrawReason | null} reason 流局の理由
 * @property {boolean[]} tenpai 荒牌平局のときの聴牌者
 * @property {number[]} nagashi 流し満貫の成立者
 * @property {number[]} deltas 席ごとの点棒の増減（リーチ棒の供出は含まない）
 * @property {number[]} scores 精算後の持ち点
 * @property {boolean} renchan 連荘か
 * @property {boolean} end この局で対局終了か
 * @property {number} kyotakuTo 終了時に残った供託を受け取る席（なければ -1）
 */

/**
 * @typedef {object} GameEvent UI・CPUが購読するできごと（直前の遷移で起きたもの）
 * @property {string} type 'deal' | 'draw' | 'discard' | 'call' | 'kan' | 'riichi' | 'dora' | 'roundEnd' | 'gameEnd'
 * @property {number} [seat]
 * @property {number} [tile]
 * @property {string} [detail]
 */

/**
 * @typedef {object} GameConfig
 * @property {number} [seed]
 * @property {Partial<Rules>} [rules]
 * @property {number} [startDealer] 起家の席
 * @property {number[]} [wall] 最初の局だけ使う牌山（テスト用）
 * @property {boolean} [beginner] 初心者モードの対局か（状態機械は見ない。画面とCPUの顔ぶれが変わる）
 */

/**
 * @typedef {object} GameState
 * @property {Readonly<Rules>} rules
 * @property {number} seed
 * @property {number} startDealer
 * @property {number} roundIndex 何局目の配牌か（連荘も数える。牌山のシードに使う）
 * @property {number} kyoku 0=東1局 … 3=東4局
 * @property {number} honba
 * @property {number} kyotaku 場に出ているリーチ棒の本数
 * @property {number} dealer 親の席
 * @property {number[]} scores
 * @property {'turn' | 'response' | 'roundEnd' | 'gameEnd'} phase
 * @property {number} turn 手番の席
 * @property {PlayerState[]} players
 * @property {number[]} live ツモ山
 * @property {number} livePos 次に引く位置
 * @property {number[]} rinshan
 * @property {number} rinshanPos
 * @property {number[]} doraIndicators
 * @property {number[]} uraIndicators
 * @property {number} doraRevealed めくられているドラ表示牌の枚数
 * @property {number} pendingKanDora 打牌後にめくるカンドラの枚数（明槓・加槓）
 * @property {number} kanCount 成立したカンの数
 * @property {boolean} uninterrupted 誰も鳴き・カンをしていないか
 * @property {boolean} rinshanDraw 今のツモ牌が嶺上牌か
 * @property {boolean} suukanPending 四開槓が成立し、次の打牌で流局するか
 * @property {number[]} forbidden 食い替えで切れない牌種
 * @property {Pending | null} pending
 * @property {Action[][]} options 席ごとの合法手
 * @property {RoundResult | null} result
 * @property {{ kyoku: number, honba: number, end: boolean } | null} nextInfo
 * @property {number[]} ranking 対局終了時の順位（席の並び）
 * @property {GameEvent[]} events
 */

/**
 * 局ごとの牌山のシードを作る。
 * @param {number} seed
 * @param {number} roundIndex
 */
function roundSeed(seed, roundIndex) {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(roundIndex + 1, 0xc2b2ae35)) >>> 0;
}

/** @returns {PlayerState} */
function emptyPlayer() {
  return {
    hand: [],
    drawn: null,
    melds: [],
    discards: [],
    riichi: 0,
    ippatsu: false,
    furitenTemp: false,
    furitenPerm: false,
  };
}

/**
 * 対局の土台を作る（まだ配牌していない）。
 * @param {GameConfig} [config]
 * @returns {GameState}
 */
export function createBase(config = {}) {
  const rules = Object.freeze({ ...DEFAULT_RULES, ...config.rules });
  const startDealer = config.startDealer ?? 0;
  return {
    rules,
    seed: config.seed ?? 1,
    startDealer,
    roundIndex: -1,
    kyoku: 0,
    honba: 0,
    kyotaku: 0,
    dealer: startDealer,
    scores: [rules.startPoints, rules.startPoints, rules.startPoints, rules.startPoints],
    phase: 'roundEnd',
    turn: startDealer,
    players: [emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()],
    live: [],
    livePos: 0,
    rinshan: [],
    rinshanPos: 0,
    doraIndicators: [],
    uraIndicators: [],
    doraRevealed: 1,
    pendingKanDora: 0,
    kanCount: 0,
    uninterrupted: true,
    rinshanDraw: false,
    suukanPending: false,
    forbidden: [],
    pending: null,
    options: [[], [], [], []],
    result: null,
    nextInfo: null,
    ranking: [],
    events: [],
  };
}

/**
 * 新しい局の配牌をする（親の第1ツモはまだ引かない）。
 * @param {GameState} state
 * @param {number} kyoku
 * @param {number} honba
 * @param {number[]} [wall] 指定があればこの牌山を使う
 * @returns {GameState}
 */
export function dealRound(state, kyoku, honba, wall) {
  const roundIndex = state.roundIndex + 1;
  const dealer = (state.startDealer + kyoku) % 4;
  const d = deal(wall ?? createWall(roundSeed(state.seed, roundIndex)), dealer);
  return {
    ...state,
    roundIndex,
    kyoku,
    honba,
    dealer,
    phase: 'turn',
    turn: dealer,
    players: d.hands.map((hand) => ({ ...emptyPlayer(), hand })),
    live: d.live,
    livePos: 0,
    rinshan: d.rinshan,
    rinshanPos: 0,
    doraIndicators: d.doraIndicators,
    uraIndicators: d.uraIndicators,
    doraRevealed: 1,
    pendingKanDora: 0,
    kanCount: 0,
    uninterrupted: true,
    rinshanDraw: false,
    suukanPending: false,
    forbidden: [],
    pending: null,
    options: [[], [], [], []],
    result: null,
    nextInfo: null,
    events: [{ type: 'deal', seat: dealer }],
  };
}
