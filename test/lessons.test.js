import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAgari } from '../src/core/agari.js';
import { shanten } from '../src/core/shanten.js';
import { doraKindOf, NUM_KINDS } from '../src/core/tiles.js';
import { migrate } from '../src/storage/store.js';
import {
  canAdvance,
  isFinished,
  LESSONS,
  lessonHtml,
  lessonListHtml,
  nextStep,
  openLesson,
  pickChoice,
  prevStep,
} from '../src/ui/lessons.js';
import { kindToken, parseKinds, richText } from '../src/ui/tile-text.js';

/** @param {string} text 牌の表記（{} なし） @returns {number[]} 牌種ごとの枚数 */
function counts(text) {
  const c = new Array(NUM_KINDS).fill(0);
  for (const t of parseKinds(text)) c[t.kind]++;
  return c;
}

/** "{123m}" → "123m" @param {string} choice */
const inner = (choice) => choice.replace(/[{}\s]/g, '');

/** @param {string} id */
function lessonById(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  assert.ok(lesson, id);
  return lesson;
}

/** @param {string} id */
function quizzes(id) {
  return lessonById(id).steps.filter((s) => s.type === 'quiz');
}

test('richText: {…} を牌の絵に置き換え、ほかの文字は残す', () => {
  const html = richText('切るなら{1z}です');
  assert.ok(html.startsWith('切るなら<span class="inline-tiles" role="img" aria-label="東">'));
  assert.ok(html.endsWith('</span>です'));
  assert.equal((richText('{123m}').match(/<svg/g) ?? []).length, 3);
  assert.match(richText('{0p}'), /aria-label="赤五筒"/);
  assert.equal(richText('牌なし'), '牌なし');
});

test('parseKinds: 同じ牌が5枚以上でも読める（説明用）、不正な表記は例外', () => {
  assert.equal(parseKinds('11111m').length, 5);
  assert.throws(() => parseKinds('8z'));
  assert.throws(() => parseKinds('12'));
});

test('kindToken: 牌種を {…} 表記に戻せる', () => {
  for (let kind = 0; kind < NUM_KINDS; kind++) {
    assert.equal(parseKinds(inner(kindToken(kind)))[0].kind, kind);
  }
});

test('レッスンは5回で、すべての文と選択肢の牌の表記が読める', () => {
  assert.equal(LESSONS.length, 5);
  for (const lesson of LESSONS) {
    for (const step of lesson.steps) {
      assert.doesNotThrow(() => richText(step.body), `${lesson.id}: ${step.body}`);
      if (step.type !== 'quiz') continue;
      const n = step.hand ? parseKinds(step.hand).length : (step.choices ?? []).length;
      assert.ok(n >= 2, `${lesson.id}: 選択肢が2つ以上`);
      assert.ok(step.answers.length > 0);
      for (const a of step.answers) assert.ok(a >= 0 && a < n, `${lesson.id}: 正解の番号が範囲内`);
      for (const c of step.choices ?? []) assert.doesNotThrow(() => richText(c));
      assert.doesNotThrow(() => richText(step.explain));
    }
  }
});

test('捨て方の問題: 正解の牌を切ると、いちばんテンパイに近くなる（ほかの牌では同じにならない）', () => {
  for (const step of quizzes('discard')) {
    assert.ok(step.hand);
    const tiles = parseKinds(step.hand);
    assert.equal(tiles.length, 14, step.hand);
    const after = tiles.map((_, i) => {
      const c = counts(step.hand ?? '');
      c[tiles[i].kind]--;
      return shanten(c);
    });
    const best = Math.min(...after);
    const answerKinds = new Set(step.answers.map((i) => tiles[i].kind));
    for (const i of step.answers) assert.equal(after[i], best);
    tiles.forEach((t, i) => {
      if (!answerKinds.has(t.kind)) assert.ok(after[i] > best, `${step.hand} の${i}番目は正解より悪い`);
    });
  }
});

test('上がりの形・テンパイの問題: 正解だけが条件を満たす', () => {
  const [, , , agari] = quizzes('goal');
  const forms = (agari.choices ?? []).map((c) => isAgari(counts(inner(c))));
  assert.deepEqual(forms, [true, false]);

  const [waits, , tenpai] = quizzes('tenpai');
  const hand = '23445m456p22678s';
  (waits.choices ?? []).forEach((c, i) => {
    const counts14 = counts(hand + inner(c));
    assert.equal(isAgari(counts14), waits.answers.includes(i), c);
  });
  const sh = (tenpai.choices ?? []).map((c) => shanten(counts(inner(c))));
  assert.equal(sh[0], 0);
  assert.ok(sh[1] > 0);
});

test('メンツの問題: 正解は3枚の組になる', () => {
  const [meld, add] = quizzes('goal');
  (meld.choices ?? []).forEach((c, i) => {
    // 3枚＋アタマ1組で上がりの形になるか（残りのメンツ3つは鳴いた扱い）
    assert.equal(isAgari(counts(`${inner(c)}55z`), 3), meld.answers.includes(i), c);
  });
  (add.choices ?? []).forEach((c, i) => {
    assert.equal(isAgari(counts(`23m${inner(c)}55z`), 3), add.answers.includes(i), c);
  });
});

test('進み方: 小問題は正解するまで次へ進めない', () => {
  const lesson = LESSONS.findIndex((l) => l.id === 'tiles');
  let s = openLesson(lesson);
  assert.ok(canAdvance(s), '説明の画面はすぐ進める');
  const quizAt = LESSONS[lesson].steps.findIndex((st) => st.type === 'quiz');
  while (s.step < quizAt) s = nextStep(s);
  assert.equal(canAdvance(s), false);
  assert.equal(nextStep(s), s, '進めない');

  s = pickChoice(s, 0);
  assert.equal(canAdvance(s), false);
  assert.match(lessonHtml(s), /× ちがいます/);
  assert.match(lessonHtml(s), /disabled>次へ/);

  s = pickChoice(s, 2);
  assert.ok(canAdvance(s));
  assert.match(lessonHtml(s), /○ 正解！/);
  assert.equal(pickChoice(s, 0), s, '正解したあとは選び直さない');

  assert.equal(prevStep(s).step, quizAt - 1);
  while (!isFinished(s)) {
    const step = LESSONS[lesson].steps[s.step];
    if (step.type === 'quiz') s = pickChoice(s, step.answers[0]);
    s = nextStep(s);
  }
  assert.match(lessonHtml(s), /完了/);
  assert.match(lessonHtml(s), /次のレッスンへ/);
});

test('最後のレッスンを終えると「対局してみる」が出る', () => {
  const last = LESSONS.length - 1;
  const s = { ...openLesson(last), step: LESSONS[last].steps.length };
  assert.match(lessonHtml(s), /data-cmd="new-game-beginner"/);
});

test('一覧: 終えたレッスンに「済み」が付く', () => {
  const html = lessonListHtml(['tiles']);
  assert.equal((html.match(/✓ 済み/g) ?? []).length, 1);
  assert.match(html, /1 \/ 5 済み/);
});

test('保存データ: 終えたレッスンを読み込み、古いデータでは空にする', () => {
  const old = migrate({ version: 1, settings: {}, stats: {} });
  assert.deepEqual(old?.lessonsDone, []);
  const saved = migrate({ version: 1, lessonsDone: ['tiles', 'tiles', 3, 'goal'] });
  assert.deepEqual(saved?.lessonsDone, ['tiles', 'goal']);
});

test('ドラの問題: 正解は表示牌の次の牌', () => {
  const step = quizzes('yaku').find((q) => q.body.includes('ドラ表示'));
  assert.ok(step);
  const shown = parseKinds('3m')[0].kind;
  const answer = parseKinds(inner((step.choices ?? [])[step.answers[0]]))[0].kind;
  assert.equal(answer, doraKindOf(shown));
});

test('レッスンの例の手は、タンヤオが付く形（役なしで「上がり」と教えない）', () => {
  for (const text of ['234m456p555678s22p', '23445m456p22678s3m', '23445m456p22678s6m']) {
    const c = counts(text);
    assert.ok(isAgari(c), text);
    assert.ok(
      c.every((n, k) => n === 0 || (k < 27 && k % 9 !== 0 && k % 9 !== 8)),
      `${text} は2〜8だけ`,
    );
  }
});
