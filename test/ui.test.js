import assert from 'node:assert/strict';
import { test } from 'node:test';
import { YAKU } from '../src/core/yaku.js';
import { next } from '../src/game/round.js';
import { nextActor } from '../src/game/runner.js';
import { defaultStore } from '../src/storage/store.js';
import { callWarning, hintModel, tenpaiInfo } from '../src/ui/hint-panel.js';
import { homeHtml, settingsHtml } from '../src/ui/home.js';
import { ONBOARDING_STEPS, onboardingHtml } from '../src/ui/onboarding.js';
import { gameResultHtml, roundResultHtml } from '../src/ui/result.js';
import { cpusFor, createSession, ME } from '../src/ui/session.js';
import { soundFor } from '../src/ui/sound.js';
import { tableHtml } from '../src/ui/table.js';
import { GLOSSARY, termHtml, termSheetHtml, yakuItemHtml } from '../src/ui/yaku-explainer.js';
import { yakuListHtml } from '../src/ui/yaku-list.js';
import { buildWall, JUNK, kind } from './game-helpers.js';

/** @typedef {import('../src/storage/store.js').Suspended} Suspended */

const NOTEN = `${JUNK}3456z`;
const FAST = { cpuTurn: 0, cpuResponse: 0, auto: 0 };

/**
 * テスト用のセッション。待ち時間なしで、フックの呼び出しを記録する。
 * @param {Parameters<typeof buildWall>[0]} [spec]
 */
function open(spec) {
  const log = {
    changes: 0,
    /** @type {(Suspended | null)[]} */ saved: [],
    rounds: 0,
    /** @type {number[]} */ ranks: [],
  };
  const session = createSession({
    onChange: () => {
      log.changes++;
    },
    onSave: (data) => log.saved.push(data),
    onRoundEnd: () => {
      log.rounds++;
    },
    onGameEnd: (rank) => log.ranks.push(rank),
    delays: FAST,
  });
  session.start(spec ? { wall: buildWall(spec) } : { seed: 3 });
  return { session, log };
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- ヒント ---

test('ヒント: 推奨の打牌・理由・牌ごとの受け入れ枚数', () => {
  const { session } = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  const state = /** @type {NonNullable<typeof session.state>} */ (session.state);
  const hint = hintModel(state, ME);
  assert.ok(hint);
  assert.equal(hint.best, state.players[ME].drawn, 'ツモった中を切るのが最善');
  assert.equal(hint.shanten, 0);
  assert.match(hint.reason, /中を切るとテンパイ/);
  assert.match(hint.reason, /二索（残り4枚）/);
  assert.equal(
    hint.badges[/** @type {number} */ (hint.best)],
    11,
    '2・5・8索の11枚（自分で5索を1枚使っている）',
  );
  // テンパイを崩す牌にはバッジを付けない
  const other = state.players[ME].hand.find((t) => t >> 2 === kind('2m'));
  assert.equal(hint.badges[/** @type {number} */ (other)], undefined);
  assert.equal(hintModel(state, 1), null, '手番でなければヒントなし');
  session.stop();
});

test('ヒント: 和了形ならツモを案内する', () => {
  const { session } = open({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  const hint = hintModel(/** @type {NonNullable<typeof session.state>} */ (session.state), ME);
  assert.equal(hint?.best, null);
  assert.match(hint?.reason ?? '', /和了形/);
  session.stop();
});

test('テンパイ表示: 待ち牌・残り枚数・想定点・フリテン', async () => {
  // 自分（席0）がテンパイのままツモ切りし、他家の番で待ちを確認する
  const { session } = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z', dora: '1z' });
  let state = /** @type {NonNullable<typeof session.state>} */ (session.state);
  assert.equal(tenpaiInfo(state, ME), null, '自分の手番中は出さない');
  session.setPaused(true);
  state = next(state, { type: 'discard', seat: ME, tile: /** @type {number} */ (state.players[ME].drawn) });
  const info = tenpaiInfo(state, ME);
  assert.ok(info);
  assert.deepEqual(
    info.waits.map((w) => [w.kind, w.left]),
    [
      [kind('2s'), 4],
      [kind('5s'), 3],
      [kind('8s'), 4],
    ],
  );
  // 親の平和のみ 30符1翻 = 1500点
  assert.ok(info.waits.every((w) => w.points === 'ロン1500点'));
  assert.equal(info.furiten, false);
  session.stop();
  await sleep(1);
});

test('鳴きの警告: 役が見えない鳴きにだけ出す', () => {
  // 席3が4萬を切る → 自分（席0）は23萬でチーできるが、手に一九牌が多く役牌もない
  const { session } = open({ hands: ['239m1589p1369s12z', NOTEN, NOTEN, NOTEN] });
  session.setPaused(true);
  let state = /** @type {NonNullable<typeof session.state>} */ (session.state);
  assert.equal(callWarning(state, ME), null, '応答の場面でなければ出さない');
  // 席0 → 1 → 2 とツモ切りし、席3が4萬を切る
  for (let i = 0; i < 3; i++) {
    state = next(state, {
      type: 'discard',
      seat: state.turn,
      tile: /** @type {number} */ (state.players[state.turn].drawn),
    });
    while (state.phase === 'response') state = next(state, { type: 'pass', seat: nextActor(state) });
  }
  const four = state.players[3].hand.find((t) => t >> 2 === kind('4m'));
  state = next(state, { type: 'discard', seat: 3, tile: /** @type {number} */ (four) });
  assert.ok(state.options[ME].some((o) => o.type === 'chi'));
  assert.match(callWarning(state, ME) ?? '', /役がなくなるかもしれません/);
  session.stop();
});

// --- セッション ---

test('セッション: CPUが自動で進み、自分の番で止まる。対局終了まで進めると成績と保存が更新される', async () => {
  const { session, log } = open();
  assert.deepEqual(
    cpusFor({ seed: 3 }).map((c) => c?.id ?? null),
    [null, 'balance', 'attack', 'defense'],
  );
  assert.equal(new Set(session.names).size, 4);
  for (let guard = 0; guard < 5000 && session.state?.phase !== 'gameEnd'; guard++) {
    const state = /** @type {NonNullable<typeof session.state>} */ (session.state);
    if (state.phase === 'roundEnd') session.act({ type: 'nextRound', seat: ME });
    else if (nextActor(state) === ME) {
      // 自分はツモ切りとパスだけ
      const options = state.options[ME];
      const drawn = state.players[ME].drawn;
      const pick =
        options.find((o) => o.type === 'pass') ??
        options.find((o) => o.type === 'discard' && !o.riichi && o.tile === drawn) ??
        options.find((o) => o.type === 'discard' && !o.riichi);
      session.act(/** @type {import('../src/game/state.js').Action} */ (pick));
    } else await sleep(1);
  }
  assert.equal(session.state?.phase, 'gameEnd');
  assert.ok(log.rounds >= 4, '東1〜東4局ぶんの結果が記録される');
  assert.equal(log.ranks.length, 1);
  assert.equal(log.saved.at(-1), null, '終了したら中断データを消す');
  assert.ok(
    log.saved.some((d) => d !== null && d.record.actions.length > 0),
    '対局中は牌譜を保存する',
  );
  assert.ok(gameResultHtml(session).includes(`あなたは${log.ranks[0] + 1}位`));
  session.stop();
});

test('セッション: リーチは3秒間取り消せる。取り消すと局面も牌譜も元に戻る', async () => {
  const { session, log } = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z' });
  const before = session.state;
  const riichi = before?.options[ME].find((o) => o.type === 'discard' && o.riichi);
  assert.ok(riichi);
  session.ui.hintOn = true;
  session.act(riichi);
  assert.equal(session.ui.canUndo, true);
  assert.equal(session.ui.hintUses, 1, 'ヒントを見ながらの判断を数える');
  assert.equal(session.record.actions.length, 1);
  await sleep(20);
  assert.equal(session.state?.players[1].discards.length, 0, '取り消せる間はCPUを進めない');
  assert.ok(tableHtml(session).html.includes('data-cmd="undo"'));

  session.undo();
  assert.equal(session.state, before);
  assert.equal(session.record.actions.length, 0);
  assert.equal(session.ui.canUndo, false);
  assert.equal(session.ui.hintUses, 0);
  assert.equal(log.saved.at(-1)?.record.actions.length, 0, '保存も取り消し後の内容になる');
  session.stop();
});

test('セッション: 中断データから再開できる。壊れていれば false', () => {
  const { session, log } = open({ hands: ['234m567p34567s99p', NOTEN, NOTEN, NOTEN], live: '7z' });
  session.setPaused(true);
  const state = /** @type {NonNullable<typeof session.state>} */ (session.state);
  session.ui.paused = false;
  session.act({ type: 'discard', seat: ME, tile: /** @type {number} */ (state.players[ME].drawn) });
  session.setPaused(true);
  const saved = /** @type {Suspended} */ (log.saved.at(-1));
  const expected = session.state;
  session.stop();

  const again = createSession({ onChange: () => {}, delays: FAST });
  assert.equal(again.resume(JSON.parse(JSON.stringify(saved))), true);
  assert.deepEqual(again.state, expected);
  again.stop();

  const broken = { ...saved, record: { ...saved.record, actions: [{ type: 'tsumo', seat: 3 }] } };
  assert.equal(again.resume(/** @type {Suspended} */ (broken)), false);
  assert.equal(again.state, null);
});

// --- 画面の HTML ---

test('卓面: 手牌・捨て牌の読み上げラベル、手番、行動ボタン', () => {
  const { session } = open({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  const { html, buttons } = tableHtml(session);
  assert.ok(html.includes('aria-label="あなたの手牌"'));
  assert.ok(html.includes('aria-label="東家の捨て牌: なし"'));
  assert.ok(html.includes('aria-label="赤五萬"') || html.includes('aria-label="一萬"'));
  assert.ok(html.includes('あなたの番'));
  assert.deepEqual(
    buttons.map((b) => b.type),
    ['tsumo', 'discard'],
    'ツモと、ツモ切り',
  );
  assert.ok(!html.includes('hint-mark'), 'ヒントは初期オフ');
  session.ui.hintOn = true;
  assert.ok(tableHtml(session).html.includes('和了形です'));
  // リーチ選択中はキャンセルだけを出す
  session.ui.riichiMode = true;
  assert.ok(tableHtml(session).html.includes('data-cmd="riichi-cancel"'));
  session.stop();
});

test('結果画面: 役 → 符・翻 → 点数 → 点数移動 の順に開示する', async () => {
  // 1巡目は中をツモ切り（天和を避ける）。2巡目に1索を引いてツモ和了する
  const { session } = open({
    hands: ['123m456p789s23s11z', NOTEN, NOTEN, NOTEN],
    liveAt: { 0: '7z', 4: '1s' },
    dora: '4z',
  });
  session.ui.hintOn = true;
  for (let guard = 0; guard < 500 && session.state?.phase !== 'roundEnd'; guard++) {
    const state = /** @type {NonNullable<typeof session.state>} */ (session.state);
    if (nextActor(state) !== ME) {
      await sleep(1);
      continue;
    }
    const options = state.options[ME];
    const pick =
      options.find((o) => o.type === 'tsumo') ??
      options.find((o) => o.type === 'pass') ??
      options.find((o) => o.type === 'discard' && o.tile === state.players[ME].drawn);
    session.act(/** @type {import('../src/game/state.js').Action} */ (pick));
  }
  assert.equal(session.state?.phase, 'roundEnd');
  let html = roundResultHtml(session);
  assert.ok(html.includes('あなたのツモ'));
  assert.ok(html.includes('門前清自摸和') && html.includes('メンゼンツモ'), '役名と、タップで開く説明');
  assert.ok(!html.includes('符の内訳') && !html.includes('is-big') && !html.includes('点数の移動'));
  session.revealResult();
  html = roundResultHtml(session);
  assert.ok(html.includes('符の内訳') && !html.includes('is-big'));
  session.revealResult();
  assert.ok(roundResultHtml(session).includes('is-big'));
  session.revealResult();
  html = roundResultHtml(session);
  assert.ok(html.includes('点数の移動') && html.includes('次の局へ'));
  assert.match(html, /ヒント使用 \d+回/);
  assert.ok(html.includes('次回の課題'));
  session.stop();
});

test('結果画面: 流局は最初から全部見せる', () => {
  const { session } = open({ hands: ['19m19p19s123z2468m', NOTEN, NOTEN, NOTEN] });
  session.act({ type: 'kyuushu', seat: ME });
  const html = roundResultHtml(session);
  assert.ok(html.includes('九種九牌で流局') && html.includes('次の局へ'));
  session.stop();
});

test('役一覧・用語解説・使い方', () => {
  const list = yakuListHtml();
  for (const y of YAKU) assert.ok(list.includes(y.name) && list.includes(y.desc), y.id);
  assert.ok(list.includes('流し満貫'));
  assert.ok(list.includes('2翻（鳴くと1翻）') && list.includes('1翻（門前のみ）'));

  for (const [id, entry] of Object.entries(GLOSSARY)) {
    assert.ok(entry.term && entry.yomi && entry.desc, id);
    assert.ok(termHtml(id).includes(`data-id="${id}"`));
    assert.ok(termSheetHtml(id).includes(entry.desc));
  }
  assert.equal(termSheetHtml('unknown'), '');
  assert.ok(yakuItemHtml({ id: 'riichi', name: '立直', han: 1, yakuman: 0 }).includes('1翻'));
  assert.ok(yakuItemHtml({ id: 'kokushi', name: '国士無双', han: 0, yakuman: 2 }).includes('ダブル役満'));

  assert.equal(ONBOARDING_STEPS.length, 3);
  assert.ok(onboardingHtml(0).includes('スキップ') && onboardingHtml(0).includes('onboarding-next'));
  assert.ok(onboardingHtml(2).includes('はじめる') && !onboardingHtml(2).includes('スキップ'));
});

test('ホーム・設定', () => {
  const store = defaultStore();
  let html = homeHtml(store, { corrupted: false, updateReady: false });
  assert.ok(html.includes('対局開始') && !html.includes('続きから'));
  store.suspended = { record: { version: 1, config: {}, actions: [] }, hintUses: 0, hintTotal: 0 };
  html = homeHtml(store, { corrupted: true, updateReady: true });
  assert.ok(html.includes('続きから') && html.includes('新しく始める'));
  assert.ok(html.includes('保存データを読み込めなかった') && html.includes('更新する'));
  const settings = settingsHtml(store, true);
  assert.ok(settings.includes('aria-checked="true"') && settings.includes('次の対局から反映'));
});

test('効果音: イベントから音の種類を選ぶ', () => {
  const { session } = open({ hands: ['123m456p789s1122z', NOTEN, NOTEN, NOTEN], live: '2z' });
  const state = /** @type {NonNullable<typeof session.state>} */ (session.state);
  assert.equal(soundFor(state), null);
  assert.equal(soundFor(next(state, { type: 'tsumo', seat: ME })), 'win');
  session.stop();
});
