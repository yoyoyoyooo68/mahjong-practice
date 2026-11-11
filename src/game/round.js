// 対局進行の状態機械。next(state, action) → state の純粋関数で、元の状態は書き換えない。
//
// フェーズ:
//   turn      手番の人がツモ和了／暗槓／加槓／九種九牌／リーチ／打牌を選ぶ（鳴いた直後は打牌のみ）
//   response  打牌・加槓・暗槓に対して、他家がロン／ポン／カン／チー／パスを出す。全員そろったら解決
//   roundEnd  局の結果を表示中。nextRound で次の局へ
//   gameEnd   対局終了

import { calcPayments, evaluateHand } from '../core/score.js';
import { shanten } from '../core/shanten.js';
import { isRed, isYaochu, kindOf, toCounts } from '../core/tiles.js';
import { createBase, dealRound } from './state.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').GameConfig} GameConfig */
/** @typedef {import('./state.js').PlayerState} PlayerState */
/** @typedef {import('./state.js').Action} Action */
/** @typedef {import('./state.js').Pending} Pending */
/** @typedef {import('./state.js').DrawReason} DrawReason */
/** @typedef {import('./state.js').WinInfo} WinInfo */
/** @typedef {import('../core/score.js').HandResult} HandResult */

/**
 * ツモ山の残り枚数（カンのたびに1枚ずつ王牌に回る）。
 * @param {GameState} s
 */
export function remainingTiles(s) {
  return s.live.length - s.livePos - s.kanCount;
}

/**
 * @param {GameState} s
 * @param {number} seat
 * @returns {number} 自風 (0=東 … 3=北)
 */
export function seatWindOf(s, seat) {
  return (seat - s.dealer + 4) % 4;
}

/**
 * 合法手を比較するためのキー。
 * @param {Action} a
 */
export function actionKey(a) {
  return [
    a.type,
    a.seat,
    a.tile ?? '',
    a.kind ?? '',
    a.riichi ? 1 : 0,
    a.tiles ? a.tiles.join('.') : '',
  ].join('|');
}

/**
 * 待ち牌の牌種（役の有無は問わない。自分で4枚使っている牌は待ちに数えない）。
 * @param {readonly number[]} hand 手の内の牌ID（13-3×副露 枚）
 * @param {number} meldCount
 * @returns {number[]}
 */
export function waitKinds(hand, meldCount) {
  const counts = toCounts(hand);
  const out = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (shanten(counts, meldCount) === -1) out.push(k);
    counts[k]--;
  }
  return out;
}

/**
 * 状態を浅くコピーする（配列は共有し、変更するときに新しい配列へ差し替える）。
 * @param {GameState} s
 * @returns {GameState}
 */
function fork(s) {
  return { ...s, players: s.players.map((p) => ({ ...p })), events: [] };
}

/** @returns {Action[][]} */
const noOptions = () => [[], [], [], []];

/**
 * @param {GameState} s
 * @param {number} seat
 * @param {boolean} tsumo
 * @param {boolean} chankan
 * @returns {import('../core/score.js').WinContext}
 */
function winContext(s, seat, tsumo, chankan) {
  const p = s.players[seat];
  const firstTurn = s.uninterrupted && p.discards.length === 0;
  const last = remainingTiles(s) === 0;
  return {
    tsumo,
    seatWind: seatWindOf(s, seat),
    roundWind: 0,
    riichi: p.riichi > 0,
    doubleRiichi: p.riichi === 2,
    ippatsu: p.ippatsu,
    rinshan: tsumo && s.rinshanDraw,
    chankan,
    haitei: tsumo && !s.rinshanDraw && last,
    houtei: !tsumo && !chankan && last,
    tenhou: tsumo && firstTurn && seat === s.dealer,
    chiihou: tsumo && firstTurn && seat !== s.dealer,
    doraIndicators: s.doraIndicators.slice(0, s.doraRevealed),
    uraIndicators: s.uraIndicators.slice(0, s.doraRevealed),
    rules: s.rules,
  };
}

/**
 * @param {GameState} s
 * @param {number} seat
 * @returns {HandResult | null}
 */
function evalTsumo(s, seat) {
  const p = s.players[seat];
  if (p.drawn === null) return null;
  const drawn = p.drawn;
  return evaluateHand(
    p.hand.filter((t) => t !== drawn),
    p.melds,
    drawn,
    winContext(s, seat, true, false),
  );
}

/**
 * @param {GameState} s
 * @param {number} seat
 * @param {number} tile
 * @param {boolean} chankan
 * @returns {HandResult | null}
 */
function evalRon(s, seat, tile, chankan) {
  const p = s.players[seat];
  return evaluateHand(p.hand, p.melds, tile, winContext(s, seat, false, chankan));
}

/**
 * その牌種でロンしたときの手役・点数の見込み（テンパイ時の想定点の表示用）。
 * @param {GameState} s
 * @param {number} seat
 * @param {number} kind 和了牌の牌種
 * @returns {HandResult | null}
 */
export function estimateRon(s, seat, kind) {
  return evalRon(s, seat, kind * 4 + 1, false);
}

/**
 * @param {GameState} s
 * @param {number} seat
 * @returns {boolean} フリテンか（捨て牌・同巡内・リーチ後のいずれか）
 */
export function isFuriten(s, seat) {
  const p = s.players[seat];
  if (p.furitenTemp || p.furitenPerm) return true;
  const waits = waitKinds(p.hand, p.melds.length);
  return p.discards.some((d) => waits.includes(kindOf(d.tile)));
}

/**
 * 食い替えで切れなくなる牌種。
 * @param {number} called 鳴いた牌の牌種
 * @param {number[]} own 手から出した2枚の牌種
 */
function kuikaeKinds(called, own) {
  const [a, b] = [...own].sort((x, y) => x - y);
  const out = [called];
  if (a !== b && b === a + 1) {
    // 両面・ペンチャンの形で鳴いたときは、反対側のスジも切れない
    if (called === a - 1 && b % 9 < 8) out.push(b + 1);
    if (called === b + 1 && a % 9 > 0) out.push(a - 1);
  }
  return out;
}

/** @param {PlayerState} p 門前か（暗槓だけなら門前） */
const isMenzen = (p) => p.melds.every((m) => m.type === 'ankan');

/**
 * 手番の人の合法手を計算して s.options に入れる。
 * @param {GameState} s 作業用（fork 済み）
 */
function computeTurnOptions(s) {
  const seat = s.turn;
  const p = s.players[seat];
  /** @type {Action[]} */
  const opts = [];
  const counts = toCounts(p.hand);
  const meldCount = p.melds.length;
  const drawn = p.drawn;

  if (drawn !== null) {
    if (evalTsumo(s, seat)?.valid) opts.push({ type: 'tsumo', seat });

    if (s.uninterrupted && p.discards.length === 0) {
      const yaochu = counts.filter((n, k) => n > 0 && isYaochu(k)).length;
      if (yaochu >= 9) opts.push({ type: 'kyuushu', seat });
    }

    if (remainingTiles(s) > 0 && s.kanCount < 4) {
      for (let k = 0; k < 34; k++) {
        if (counts[k] !== 4) continue;
        if (p.riichi > 0) {
          // リーチ後の暗槓は、ツモった牌で、待ちが変わらないときだけ
          if (kindOf(drawn) !== k) continue;
          const before = waitKinds(
            p.hand.filter((t) => t !== drawn),
            meldCount,
          );
          const after = waitKinds(
            p.hand.filter((t) => kindOf(t) !== k),
            meldCount + 1,
          );
          if (before.join() !== after.join()) continue;
        }
        opts.push({ type: 'ankan', seat, kind: k });
      }
      for (const m of p.melds) {
        if (m.type !== 'pon') continue;
        const tile = p.hand.find((t) => kindOf(t) === kindOf(m.tiles[0]));
        if (tile !== undefined) opts.push({ type: 'kakan', seat, tile });
      }
    }
  }

  if (p.riichi > 0) {
    if (drawn !== null) opts.push({ type: 'discard', seat, tile: drawn });
  } else {
    for (const tile of p.hand) {
      if (!s.forbidden.includes(kindOf(tile))) opts.push({ type: 'discard', seat, tile });
    }
    if (drawn !== null && isMenzen(p) && s.scores[seat] >= 1000 && remainingTiles(s) >= 4) {
      /** @type {Map<number, boolean>} */
      const tenpai = new Map();
      for (const tile of p.hand) {
        const k = kindOf(tile);
        let ok = tenpai.get(k);
        if (ok === undefined) {
          counts[k]--;
          ok = shanten(counts, meldCount) === 0;
          counts[k]++;
          tenpai.set(k, ok);
        }
        if (ok) opts.push({ type: 'discard', seat, tile, riichi: true });
      }
    }
  }

  s.phase = 'turn';
  s.options = noOptions();
  s.options[seat] = opts;
}

/**
 * ポン・チーで手から出す2枚の組み合わせを、赤の有無で区別して列挙する。
 * @param {readonly number[]} hand
 * @param {number} kindA
 * @param {number} kindB
 * @returns {number[][]}
 */
function pairVariants(hand, kindA, kindB) {
  /** @param {number} kind @param {number} skip */
  const picks = (kind, skip) => {
    const tiles = hand.filter((t) => kindOf(t) === kind && t !== skip);
    const normal = tiles.find((t) => !isRed(t));
    const red = tiles.find((t) => isRed(t));
    return [normal, red].filter((t) => t !== undefined);
  };
  /** @type {number[][]} */
  const out = [];
  const seen = new Set();
  for (const a of picks(kindA, -1)) {
    for (const b of picks(kindB, a)) {
      const pair = [a, b].sort((x, y) => x - y);
      const key = pair.map((t) => (isRed(t) ? 'r' : kindOf(t))).join();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}

/**
 * 打牌・カンに対する他家の応答を受け付ける。誰も何もできなければそのまま解決する。
 * @param {GameState} s 作業用
 * @param {Omit<Pending, 'responses'>} info
 */
function openResponse(s, info) {
  const { kind: pendingKind, tile, from } = info;
  const k = kindOf(tile);
  const options = noOptions();
  let any = false;
  for (let i = 1; i <= 3; i++) {
    const seat = (from + i) % 4;
    const p = s.players[seat];
    /** @type {Action[]} */
    const opts = [];
    const win = evalRon(s, seat, tile, pendingKind !== 'discard');
    const kokushiOnly = pendingKind === 'ankan';
    if (win?.valid && (!kokushiOnly || win.shape.form === 'kokushi') && !isFuriten(s, seat)) {
      opts.push({ type: 'ron', seat });
    }
    if (pendingKind === 'discard' && remainingTiles(s) > 0 && p.riichi === 0) {
      const same = p.hand.filter((t) => kindOf(t) === k);
      if (same.length >= 2) {
        for (const tiles of pairVariants(p.hand, k, k)) opts.push({ type: 'pon', seat, tiles });
      }
      if (same.length >= 3 && s.kanCount < 4) opts.push({ type: 'minkan', seat });
      if (i === 1 && k < 27) {
        const n = k % 9;
        /** @type {[number, number][]} */
        const shapes = [];
        if (n >= 2) shapes.push([k - 2, k - 1]);
        if (n >= 1 && n <= 7) shapes.push([k - 1, k + 1]);
        if (n <= 6) shapes.push([k + 1, k + 2]);
        for (const [a, b] of shapes) {
          const forbidden = kuikaeKinds(k, [a, b]);
          for (const tiles of pairVariants(p.hand, a, b)) {
            // 鳴いたあとに切れる牌が残らない形は鳴けない
            const rest = p.hand.filter((t) => !tiles.includes(t));
            if (rest.some((t) => !forbidden.includes(kindOf(t)))) opts.push({ type: 'chi', seat, tiles });
          }
        }
      }
    }
    if (opts.length > 0) {
      opts.push({ type: 'pass', seat });
      any = true;
    }
    options[seat] = opts;
  }
  s.pending = { ...info, responses: {} };
  s.phase = 'response';
  s.options = options;
  if (!any) resolveResponse(s);
}

/** @param {GameState} s 作業用。保留中のカンドラをめくる */
function flipPendingDora(s) {
  if (s.pendingKanDora === 0) return;
  s.doraRevealed += s.pendingKanDora;
  s.pendingKanDora = 0;
  s.events.push({ type: 'dora' });
}

/** @param {GameState} s 作業用。全員の一発を消す */
function clearIppatsu(s) {
  for (const p of s.players) p.ippatsu = false;
}

/**
 * 手番の人が山から1枚引く。山がなければ荒牌平局。
 * @param {GameState} s 作業用
 */
function draw(s) {
  if (remainingTiles(s) === 0) {
    exhaustiveDraw(s);
    return;
  }
  const p = s.players[s.turn];
  const tile = s.live[s.livePos];
  s.livePos++;
  p.hand = [...p.hand, tile];
  p.drawn = tile;
  p.furitenTemp = false;
  s.rinshanDraw = false;
  s.events.push({ type: 'draw', seat: s.turn });
  computeTurnOptions(s);
}

/**
 * カンが成立したあとの嶺上ツモ。
 * @param {GameState} s 作業用
 * @param {number} seat
 */
function rinshanDraw(s, seat) {
  clearIppatsu(s);
  s.uninterrupted = false;
  s.kanCount++;
  const p = s.players[seat];
  const tile = s.rinshan[s.rinshanPos];
  s.rinshanPos++;
  p.hand = [...p.hand, tile];
  p.drawn = tile;
  p.furitenTemp = false;
  s.rinshanDraw = true;
  s.turn = seat;
  if (s.kanCount === 4) {
    const owners = s.players.filter((x) => x.melds.some((m) => m.type !== 'chi' && m.type !== 'pon'));
    // 4つのカンが2人以上に分かれていたら、次の打牌が通った時点で四開槓
    if (owners.length >= 2) s.suukanPending = true;
  }
  s.events.push({ type: 'draw', seat, detail: 'rinshan' });
  computeTurnOptions(s);
}

/**
 * @param {GameState} s 作業用
 * @param {Action} a
 */
function doDiscard(s, a) {
  const p = s.players[a.seat];
  const tile = /** @type {number} */ (a.tile);
  const doubleRiichi = Boolean(a.riichi) && s.uninterrupted && p.discards.length === 0;
  p.discards = [
    ...p.discards,
    { tile, riichi: Boolean(a.riichi), called: false, tsumogiri: p.drawn === tile },
  ];
  p.hand = p.hand.filter((t) => t !== tile);
  p.drawn = null;
  p.ippatsu = false;
  s.forbidden = [];
  s.rinshanDraw = false;
  flipPendingDora(s);
  s.events.push({ type: 'discard', seat: a.seat, tile, detail: a.riichi ? 'riichi' : undefined });
  openResponse(s, { kind: 'discard', tile, from: a.seat, riichi: Boolean(a.riichi), doubleRiichi });
}

/**
 * @param {GameState} s 作業用
 * @param {Action} a
 */
function doAnkan(s, a) {
  const p = s.players[a.seat];
  const tiles = p.hand.filter((t) => kindOf(t) === a.kind);
  p.hand = p.hand.filter((t) => kindOf(t) !== a.kind);
  p.melds = [...p.melds, { type: 'ankan', tiles, from: -1 }];
  p.drawn = null;
  // 暗槓のカンドラは即めくる
  flipPendingDora(s);
  s.doraRevealed++;
  s.events.push({ type: 'kan', seat: a.seat, tile: tiles[0], detail: 'ankan' }, { type: 'dora' });
  openResponse(s, { kind: 'ankan', tile: tiles[0], from: a.seat, riichi: false, doubleRiichi: false });
}

/**
 * @param {GameState} s 作業用
 * @param {Action} a
 */
function doKakan(s, a) {
  const p = s.players[a.seat];
  const tile = /** @type {number} */ (a.tile);
  p.hand = p.hand.filter((t) => t !== tile);
  p.melds = p.melds.map((m) =>
    m.type === 'pon' && kindOf(m.tiles[0]) === kindOf(tile)
      ? { ...m, type: 'kakan', tiles: [...m.tiles, tile] }
      : m,
  );
  p.drawn = null;
  flipPendingDora(s);
  s.pendingKanDora++;
  s.events.push({ type: 'kan', seat: a.seat, tile, detail: 'kakan' });
  openResponse(s, { kind: 'kakan', tile, from: a.seat, riichi: false, doubleRiichi: false });
}

/**
 * ポン・チー・大明槓を成立させる。
 * @param {GameState} s 作業用
 * @param {Action} a
 * @param {number} tile 鳴いた牌
 * @param {number} from 鳴かせた席
 */
function applyCall(s, a, tile, from) {
  const discarder = s.players[from];
  discarder.discards = discarder.discards.map((d, i) =>
    i === discarder.discards.length - 1 ? { ...d, called: true } : d,
  );
  const p = s.players[a.seat];
  s.uninterrupted = false;
  clearIppatsu(s);
  p.furitenTemp = false;
  p.drawn = null;
  s.turn = a.seat;
  s.events.push({ type: 'call', seat: a.seat, tile, detail: a.type });
  if (a.type === 'minkan') {
    const own = p.hand.filter((t) => kindOf(t) === kindOf(tile));
    p.hand = p.hand.filter((t) => kindOf(t) !== kindOf(tile));
    p.melds = [...p.melds, { type: 'minkan', tiles: [tile, ...own], from }];
    s.pendingKanDora++;
    rinshanDraw(s, a.seat);
    return;
  }
  const own = /** @type {number[]} */ (a.tiles);
  p.hand = p.hand.filter((t) => !own.includes(t));
  p.melds = [...p.melds, { type: a.type === 'pon' ? 'pon' : 'chi', tiles: [tile, ...own], from }];
  s.forbidden = a.type === 'pon' ? [kindOf(tile)] : kuikaeKinds(kindOf(tile), own.map(kindOf));
  computeTurnOptions(s);
}

/**
 * 全員の応答がそろったあとの解決。優先度は ロン > ポン・カン > チー。
 * @param {GameState} s 作業用
 */
function resolveResponse(s) {
  const pending = /** @type {Pending} */ (s.pending);
  const { kind: pendingKind, tile, from } = pending;
  const responses = pending.responses;
  const order = [1, 2, 3].map((i) => (from + i) % 4);

  const rons = order.filter((seat) => responses[seat]?.type === 'ron');
  if (rons.length > 0) {
    if (rons.length === 3 && s.rules.tripleRonDraw) {
      abortiveDraw(s, 'sanchahou');
      return;
    }
    finishWin(s, s.rules.doubleRon ? rons : [rons[0]], from, tile, pendingKind !== 'discard');
    return;
  }

  // 見逃し（ロンできない形も含む）は同巡内フリテン。リーチ後なら局の終わりまで
  if (pendingKind !== 'ankan') {
    for (const seat of order) {
      const p = s.players[seat];
      if (!waitKinds(p.hand, p.melds.length).includes(kindOf(tile))) continue;
      p.furitenTemp = true;
      if (p.riichi > 0) p.furitenPerm = true;
    }
  }
  s.pending = null;

  if (pendingKind !== 'discard') {
    rinshanDraw(s, from);
    return;
  }

  if (pending.riichi) {
    const p = s.players[from];
    p.riichi = pending.doubleRiichi ? 2 : 1;
    p.ippatsu = true;
    s.scores = s.scores.map((v, i) => (i === from ? v - 1000 : v));
    s.kyotaku++;
    s.events.push({ type: 'riichi', seat: from });
    if (s.players.every((x) => x.riichi > 0)) {
      abortiveDraw(s, 'suucha');
      return;
    }
  }
  if (s.uninterrupted && s.players.every((x) => x.discards.length === 1)) {
    const first = s.players.map((x) => kindOf(x.discards[0].tile));
    if (first[0] >= 27 && first[0] <= 30 && first.every((k) => k === first[0])) {
      abortiveDraw(s, 'suufon');
      return;
    }
  }
  if (s.suukanPending) {
    abortiveDraw(s, 'suukan');
    return;
  }

  const call =
    order.map((seat) => responses[seat]).find((r) => r?.type === 'pon' || r?.type === 'minkan') ??
    order.map((seat) => responses[seat]).find((r) => r?.type === 'chi');
  if (call) {
    applyCall(s, call, tile, from);
    return;
  }
  s.turn = (from + 1) % 4;
  draw(s);
}

/**
 * @param {GameState} s 作業用
 * @param {number[]} winners 和了者（放銃者に近い順）
 * @param {number | null} loser 放銃者（ツモなら null）
 * @param {number} tile 和了牌
 * @param {boolean} chankan
 */
function finishWin(s, winners, loser, tile, chankan) {
  const deltas = [0, 0, 0, 0];
  /** @type {WinInfo[]} */
  const wins = [];
  winners.forEach((seat, index) => {
    const hand = loser === null ? evalTsumo(s, seat) : evalRon(s, seat, tile, chankan);
    if (!hand?.valid) throw new Error('和了できない手で和了しようとしました');
    // 本場と供託は、放銃者にいちばん近い和了者が受け取る
    const d = calcPayments({
      base: hand.base,
      winner: seat,
      dealer: s.dealer,
      tsumo: loser === null,
      loser: loser ?? undefined,
      honba: index === 0 ? s.honba : 0,
      kyotaku: index === 0 ? s.kyotaku : 0,
      rules: s.rules,
    });
    d.forEach((v, i) => {
      deltas[i] += v;
    });
    wins.push({ seat, from: loser, tile, hand, deltas: d });
  });
  s.kyotaku = 0;
  const dealerWon = winners.includes(s.dealer);
  endRound(
    s,
    { type: 'win', wins, reason: null, tenpai: [], nagashi: [], deltas },
    dealerWon,
    dealerWon,
    dealerWon ? s.honba + 1 : 0,
  );
}

/** @param {GameState} s 作業用。荒牌平局 */
function exhaustiveDraw(s) {
  const tenpai = s.players.map((p) => waitKinds(p.hand, p.melds.length).length > 0);
  const nagashi = s.rules.nagashiMangan
    ? [0, 1, 2, 3].filter((seat) => {
        const d = s.players[seat].discards;
        return d.length > 0 && d.every((x) => isYaochu(kindOf(x.tile)) && !x.called);
      })
    : [];
  const deltas = [0, 0, 0, 0];
  if (nagashi.length > 0) {
    // 流し満貫は満貫のツモ和了と同じ支払い（本場・供託は動かない）
    for (const seat of nagashi) {
      const d = calcPayments({ base: 2000, winner: seat, dealer: s.dealer, tsumo: true, rules: s.rules });
      d.forEach((v, i) => {
        deltas[i] += v;
      });
    }
  } else {
    const n = tenpai.filter(Boolean).length;
    if (n > 0 && n < 4) {
      tenpai.forEach((t, i) => {
        deltas[i] = t ? s.rules.notenPenalty / n : -s.rules.notenPenalty / (4 - n);
      });
    }
  }
  const renchan = tenpai[s.dealer];
  endRound(
    s,
    { type: 'draw', wins: [], reason: 'exhaustive', tenpai, nagashi, deltas },
    renchan,
    renchan,
    s.honba + 1,
  );
}

/**
 * 途中流局。親は流れず、本場が1つ増える。
 * @param {GameState} s 作業用
 * @param {DrawReason} reason
 */
function abortiveDraw(s, reason) {
  endRound(
    s,
    { type: 'draw', wins: [], reason, tenpai: [], nagashi: [], deltas: [0, 0, 0, 0] },
    true,
    false,
    s.honba + 1,
  );
}

/**
 * 順位（席の並び）。同点は起家に近い方が上。
 * @param {GameState} s
 * @returns {number[]}
 */
export function rankingOf(s) {
  return [0, 1, 2, 3].sort(
    (a, b) => s.scores[b] - s.scores[a] || ((a - s.startDealer + 4) % 4) - ((b - s.startDealer + 4) % 4),
  );
}

/**
 * 局を精算して roundEnd にする。
 * @param {GameState} s 作業用
 * @param {Omit<import('./state.js').RoundResult, 'scores' | 'renchan' | 'end' | 'kyotakuTo'>} result
 * @param {boolean} renchan 連荘か
 * @param {boolean} yame オーラスでアガリ止め（テンパイ止め）の対象になるか
 * @param {number} nextHonba
 */
function endRound(s, result, renchan, yame, nextHonba) {
  s.scores = s.scores.map((v, i) => v + result.deltas[i]);
  const bust = s.rules.bustEnds && s.scores.some((v) => v < 0);
  const lastRound = s.kyoku === s.rules.rounds - 1;
  let end = bust;
  if (!end && lastRound) {
    if (!renchan) end = true;
    else if (yame && s.rules.agariYame && rankingOf(s)[0] === s.dealer) end = true;
  }
  let kyotakuTo = -1;
  if (end && s.kyotaku > 0) {
    // 残った供託はトップが受け取る
    kyotakuTo = rankingOf(s)[0];
    const bonus = s.kyotaku * 1000;
    s.scores = s.scores.map((v, i) => (i === kyotakuTo ? v + bonus : v));
    s.kyotaku = 0;
  }
  s.result = { ...result, scores: s.scores, renchan, end, kyotakuTo };
  s.nextInfo = { kyoku: renchan ? s.kyoku : s.kyoku + 1, honba: nextHonba, end };
  s.phase = 'roundEnd';
  s.pending = null;
  s.options = noOptions();
  s.events.push({ type: 'roundEnd', detail: result.reason ?? 'win' });
}

/**
 * 対局を始める（東1局の親がツモった状態）。
 * @param {GameConfig} [config]
 * @returns {GameState}
 */
export function createGame(config = {}) {
  const s = fork(dealRound(createBase(config), 0, 0, config.wall));
  s.events = [{ type: 'deal', seat: s.dealer }];
  draw(s);
  return s;
}

/**
 * 席ごとの合法手。
 * @param {GameState} state
 * @param {number} seat
 * @returns {Action[]}
 */
export function legalActions(state, seat) {
  return state.options[seat];
}

/**
 * 応答待ちの席（まだ応答していない人）。
 * @param {GameState} state
 * @returns {number[]}
 */
export function waitingSeats(state) {
  if (state.phase !== 'response') return [];
  return [0, 1, 2, 3].filter((seat) => state.options[seat].length > 0);
}

/**
 * 状態遷移。合法手でなければ例外を投げる。
 * @param {GameState} state
 * @param {Action} action
 * @returns {GameState}
 */
export function next(state, action) {
  if (state.phase === 'gameEnd') throw new Error('対局は終了しています');
  if (state.phase === 'roundEnd') {
    if (action.type !== 'nextRound') throw new Error('局の終了後は nextRound だけ受け付けます');
    const info = state.nextInfo;
    if (!info || info.end) {
      return { ...state, phase: 'gameEnd', ranking: rankingOf(state), events: [{ type: 'gameEnd' }] };
    }
    const s = fork(dealRound(state, info.kyoku, info.honba));
    s.events = [{ type: 'deal', seat: s.dealer }];
    draw(s);
    return s;
  }

  const key = actionKey(action);
  if (!state.options[action.seat]?.some((o) => actionKey(o) === key)) {
    throw new Error(`合法手ではありません: ${key}`);
  }
  const s = fork(state);

  if (state.phase === 'response') {
    const pending = /** @type {Pending} */ (s.pending);
    s.pending = { ...pending, responses: { ...pending.responses, [action.seat]: action } };
    s.options = s.options.map((o, seat) => (seat === action.seat ? [] : o));
    if (s.options.every((o) => o.length === 0)) resolveResponse(s);
    return s;
  }

  switch (action.type) {
    case 'discard':
      doDiscard(s, action);
      break;
    case 'tsumo':
      finishWin(s, [action.seat], null, /** @type {number} */ (s.players[action.seat].drawn), false);
      break;
    case 'ankan':
      doAnkan(s, action);
      break;
    case 'kakan':
      doKakan(s, action);
      break;
    case 'kyuushu':
      abortiveDraw(s, 'kyuushu');
      break;
    default:
      throw new Error(`この場面では使えない行動です: ${action.type}`);
  }
  return s;
}

/**
 * @typedef {object} PlayerView その席から見えている情報だけを集めたもの（CPU・ヒント用）
 * @property {number} seat
 * @property {GameState['phase']} phase
 * @property {number} turn
 * @property {number} dealer
 * @property {number} kyoku
 * @property {number} honba
 * @property {number} kyotaku
 * @property {number[]} scores
 * @property {number} remaining ツモ山の残り枚数
 * @property {number} seatWind 自風 (0-3)
 * @property {number} roundWind 場風 (0-3)
 * @property {number[]} doraIndicators めくられているドラ表示牌
 * @property {number[]} hand 自分の手の内
 * @property {number | null} drawn
 * @property {{ melds: import('./state.js').GameMeld[], discards: import('./state.js').Discard[], riichi: boolean, handCount: number }[]} players
 * @property {{ kind: Pending['kind'], tile: number, from: number } | null} pending
 * @property {Action[]} options 自分の合法手
 * @property {Readonly<import('../core/rules.js').Rules>} rules
 */

/**
 * 他家の手牌や山を含まない、その席からの見え方を作る。
 * @param {GameState} s
 * @param {number} seat
 * @returns {PlayerView}
 */
export function viewFor(s, seat) {
  const me = s.players[seat];
  return {
    seat,
    phase: s.phase,
    turn: s.turn,
    dealer: s.dealer,
    kyoku: s.kyoku,
    honba: s.honba,
    kyotaku: s.kyotaku,
    scores: s.scores,
    remaining: remainingTiles(s),
    seatWind: seatWindOf(s, seat),
    roundWind: 0,
    doraIndicators: s.doraIndicators.slice(0, s.doraRevealed),
    hand: me.hand,
    drawn: me.drawn,
    players: s.players.map((p) => ({
      melds: p.melds,
      discards: p.discards,
      riichi: p.riichi > 0,
      handCount: p.hand.length,
    })),
    pending: s.pending ? { kind: s.pending.kind, tile: s.pending.tile, from: s.pending.from } : null,
    options: s.options[seat],
    rules: s.rules,
  };
}
