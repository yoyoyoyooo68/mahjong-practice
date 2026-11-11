// はじめてレッスン: 麻雀を知らない人向けの5回の説明と、タップで答える小問題。
// 文中の {123m} は牌の絵になる（tile-text.js の richText）。DOM には触らず、HTML 文字列を返すだけ。

import { parseKinds, richText } from './tile-text.js';

/** レッスンの文中の牌の幅(px)。見分け方を覚える画面なので、ヒントより大きくする */
const TEXT_TILE = 28;

/**
 * @typedef {object} TextStep 説明だけの1画面
 * @property {'text'} type
 * @property {string} body
 */

/**
 * @typedef {object} QuizStep タップで答える小問題
 * @property {'quiz'} type
 * @property {string} body 問題文
 * @property {string[]} [choices] 選択肢（文字列。{…} で牌の絵を入れられる）
 * @property {string} [hand] 手牌の形で出す問題（"12334m…"）。この場合は牌1枚ずつが選択肢になる
 * @property {number[]} answers 正解の選択肢の番号（複数可）
 * @property {string} explain 正解したときの説明
 * @property {string} [retry] まちがえたときの手がかり
 */

/** @typedef {TextStep | QuizStep} LessonStep */

/**
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} summary 一覧に出す一言
 * @property {LessonStep[]} steps
 */

/** @param {string} body @returns {TextStep} */
const text = (body) => ({ type: 'text', body });

/** @type {readonly Lesson[]} */
export const LESSONS = Object.freeze([
  {
    id: 'tiles',
    title: '牌（パイ）の読み方',
    summary: '4つのグループと赤い5',
    steps: [
      text(
        '麻雀で使う札を<strong>牌（パイ）</strong>と呼びます。牌は34種類あり、同じ牌が4枚ずつあります。<br>大きく分けて<strong>4つのグループ</strong>です。まずは見分け方を覚えましょう。',
      ),
      text(
        '<strong>マンズ（萬子）</strong><br>漢数字の下に「萬」と書いてある牌です。1〜9まであります。<br>{123456789m}<br>たとえば {3m} は「3マン」と読みます。',
      ),
      text(
        '<strong>ピンズ（筒子）</strong><br>丸の数がそのまま数字です。<br>{123456789p}<br>たとえば {5p} は「5ピン」です。',
      ),
      text(
        '<strong>ソーズ（索子）</strong><br>竹の本数が数字です。1だけは太い竹1本の絵です。<br>{123456789s}<br>たとえば {7s} は「7ソー」です。',
      ),
      text(
        '<strong>字牌（じはい）</strong><br>数字のない牌です。風を表す東・南・西・北と、白・發・中の7種類。<br>{1234567z}<br>白（ハク）は文字のない牌です。',
      ),
      text(
        '<strong>赤い5</strong><br>マンズ・ピンズ・ソーズの5には、赤い牌が1枚ずつあります。<br>{0m} {0p} {0s}<br>数字はふつうの5と同じですが、持っていると上がったときの点数が増えます（<strong>ドラ</strong>。レッスン5でくわしく）。',
      ),
      {
        type: 'quiz',
        body: '「3ピン」はどれ？',
        choices: ['{3m}', '{3s}', '{3p}', '{8p}'],
        answers: [2],
        explain: '丸が3つあるのが3ピン {3p} です。',
        retry: 'ピンズは丸の数を数えます。',
      },
      {
        type: 'quiz',
        body: '「7ソー」はどれ？',
        choices: ['{7m}', '{7p}', '{1s}', '{7s}'],
        answers: [3],
        explain: '竹が7本あるのが7ソー {7s} です。',
        retry: 'ソーズは竹の本数を数えます。',
      },
      {
        type: 'quiz',
        body: '字牌（数字のない牌）はどれ？',
        choices: ['{9m}', '{1p}', '{7z}', '{1s}'],
        answers: [2],
        explain: '中（チュン） {7z} は字牌です。1や9は数字の牌です。',
        retry: '数字（丸・竹・漢数字）のない牌を探しましょう。',
      },
    ],
  },
  {
    id: 'goal',
    title: '対局の流れと上がりの形',
    summary: '4人で順番に。3枚の組×4つ＋同じ牌2枚',
    steps: [
      text(
        '<strong>対局の流れ</strong><br>あなたとCPU3人の、4人で遊びます。全員<strong>25000点</strong>から始め、4回の勝負（東1局〜東4局）が終わったとき、点数がいちばん多い人が1位です。<br>画面の下があなたの手牌、真ん中に4人が捨てた牌が並びます。「残り」は、まだ引ける牌（<strong>山</strong>）の枚数です。',
      ),
      text(
        '自分の手もとの牌（<strong>手牌</strong>）は13枚です。<br>4人が順番に、山から1枚引いて（<strong>ツモ</strong>）、いらない牌を1枚捨てます。<br>これをくり返して、14枚で決まった形をそろえたら<strong>上がり</strong>（和了・ホーラ）です。上がると、ほかの人から点数をもらえます。',
      ),
      text(
        '決まった形は<strong>「3枚の組」×4つ ＋「同じ牌2枚」×1つ</strong>です。<br>3枚の組を<strong>メンツ</strong>、同じ牌2枚を<strong>アタマ</strong>（雀頭）と呼びます。<br>{234m} {456p} {678s} {555s} {22p}<br>メンツ4つと、アタマ（2ピン2枚）で上がりの形です。',
      ),
      text(
        'メンツは2種類あります。<br><strong>続き番号</strong>（シュンツ）: 同じグループで数字が3つ続く。{123m} {678p}<br><strong>同じ牌3枚</strong>（コーツ）: {999s} {777z}',
      ),
      text(
        'メンツにならない例:<br>グループがちがう {1m2p3s}<br>数字がとんでいる {135m}<br>9から1へはつながらない {891m}<br>字牌は続き番号にならない {123z}（字牌は同じ牌3枚だけ）',
      ),
      text(
        '<strong>注意が2つ</strong><br>・実際に上がるには、形のほかに<strong>役</strong>（上がりの条件）も必要です。レッスン5で習います。<br>・例外として、<strong>同じ牌2枚×7組</strong>（七対子・チートイツ）でも上がれます。{11m}{55m}{22p}{66p}{33s}{99s}{77z}<br>ヒントがこの形を目指すこともあります。',
      ),
      {
        type: 'quiz',
        body: 'メンツ（3枚の組）になっているのはどれ？',
        choices: ['{345s}', '{1m2p3s}', '{246p}', '{123z}'],
        answers: [0],
        explain: '同じソーズで3・4・5と続いています。',
        retry: '同じグループで、数字が3つ続いているものを探しましょう。',
      },
      {
        type: 'quiz',
        body: '{23m} に1枚足してメンツにするなら、どれ？',
        choices: ['{5m}', '{4m}', '{3p}', '{9m}'],
        answers: [1],
        explain: '{234m} と続きます（ここにはありませんが {1m} でも {123m} になります）。',
        retry: '2・3に続く数字は？ グループ（マンズ）も同じにします。',
      },
      {
        type: 'quiz',
        body: 'アタマ（同じ牌2枚）になっているのはどれ？',
        choices: ['{12p}', '{55z}', '{19m}', '{34s}'],
        answers: [1],
        explain: '白 {5z} が2枚で、アタマになります。',
        retry: 'まったく同じ牌が2枚のものです。',
      },
      {
        type: 'quiz',
        body: '上がりの形になっているのはどっち？',
        choices: ['{234m456p555678s22p}', '{234m456p555678s23p}'],
        answers: [0],
        explain:
          '上はメンツ4つと、2ピン2枚のアタマ。下は最後が {2p} と {3p} でアタマがないので、まだ上がりではありません。',
        retry: '最後の2枚に注目しましょう。',
      },
    ],
  },
  {
    id: 'discard',
    title: 'いらない牌の捨て方',
    summary: '仲間のいない牌から捨てる',
    steps: [
      text(
        '自分の番では、14枚から1枚を捨てて13枚に戻します。<br>迷ったら<strong>仲間がいない牌</strong>を捨てましょう。',
      ),
      text(
        '<strong>仲間</strong>とは、メンツやアタマになりそうな牌どうしのことです。<br>{45p} は {3p} か {6p} が来ればメンツ。<br>{46p} のように<strong>1つとび</strong>でも、間の {5p} が来ればメンツになります。<br>{33s} はもう1枚でメンツ、このままでもアタマになります。<br>ぽつんと1枚だけの牌は使いにくい牌です。',
      ),
      text(
        '特に、1枚だけの字牌 {1z} や、端の数字（1と9）{9m} はつながりにくいので、先に捨てる候補です。<br>字牌どうしの順番は、ヒントにまかせて大丈夫です。',
      ),
      text(
        'このアプリでの捨て方: 牌を1回タップすると持ち上がり、<strong>同じ牌をもう1回タップ</strong>すると捨てます。<br>「ヒント」をオンにすると、おすすめの牌に ▲ が付きます。牌の上の数字は、その牌を捨てたあと「引くと手が進む牌」が山に何枚あるかです。大きいほど手が進みやすくなります。',
      ),
      {
        type: 'quiz',
        body: '捨てるならどれ？ 手牌の牌をタップしてください。',
        hand: '23445m456p22678s1z',
        answers: [13],
        explain:
          '東 {1z} は1枚だけで仲間がいません。残りは {234m} {456p} {678s} と、アタマ {22s}、それに {45m}。{3m} か {6m} が来れば上がりの形です。',
        retry: '1枚だけで、まわりに仲間がいない牌はどれでしょう。',
      },
      {
        type: 'quiz',
        body: '捨てるならどれ？',
        hand: '23446m5679p22678s',
        answers: [8],
        explain:
          '9ピン {9p} は {8p} が来れば {789p} になりますが、{7p} はもう {567p} に使っているので使い道がありません。捨てると {234m} {46m} {567p} {22s} {678s} で、{5m} が来れば上がりの形です（{46m} は1つとびの仲間）。',
        retry: '{567p} はメンツです。その横にある牌を見てみましょう。',
      },
    ],
  },
  {
    id: 'tenpai',
    title: 'テンパイと上がり方',
    summary: 'リーチ、ツモ・ロン、安全な牌',
    steps: [
      text(
        'あと1枚で上がりの状態を<strong>テンパイ</strong>と言います。<br>{23445m456p22678s}<br>この13枚は、{3m} か {6m} が来れば上がりです。上がれる牌を<strong>待ち</strong>と言います。',
      ),
      text(
        '上がり方は2つあります。<br><strong>ツモ</strong>: 自分で引いた牌で上がる。ほかの3人全員が少しずつ点数を払います。<br><strong>ロン</strong>: ほかの人が捨てた牌で上がる。その牌を捨てた人が1人で全部払います。<br>上がれるときは「ツモ」「ロン」のボタンが出るので、押しましょう。',
      ),
      text(
        '<strong>リーチ</strong>: テンパイしたら「リーチ」と宣言できます（ほかの人の牌をもらって＝鳴いていない、持ち点が1000点以上、山が4枚以上残っているとき）。<br>1000点を場に出すかわりに、上がったときに<strong>役</strong>（レッスン5）が1つ付きます。出した1000点は、次に上がった人がもらいます。<br>リーチのあとは手を変えられず、引いた牌をそのまま捨てていきます。',
      ),
      text(
        'このアプリでは、「リーチ」ボタン → 捨てる牌をタップ、の順で宣言します。<br><strong>フリテン</strong>: 待ちの牌のうち<strong>どれか1つでも</strong>自分が前に捨てていると、どの待ちでもロンできません。ツモなら上がれます。ロンできる牌を見逃したときも、しばらくロンできなくなります。画面が教えてくれるので、今は名前だけ覚えておけば大丈夫です。',
      ),
      text(
        '<strong>守り方（安全な牌）</strong><br>ほかの人がリーチしたら、その人はテンパイしています。<br>リーチした人が捨てた牌と<strong>同じ牌</strong>は、その人にはロンされません（安全な牌）。<br>自分の手がまだ遠いときは、安全な牌を捨てるのもよい作戦です。初心者モードでは、だれかがリーチすると画面が教えてくれます。',
      ),
      {
        type: 'quiz',
        body: '{23445m456p22678s} で上がれる牌はどれ？',
        choices: ['{1m}', '{6m}', '{6p}', '{9s}'],
        answers: [1],
        explain: '{6m} が来ると {456m} ができて上がりです（{3m} でも上がれます）。',
        retry: '{45m} のとなりの数字を探しましょう。',
      },
      {
        type: 'quiz',
        body: 'ほかの人が捨てた牌で上がるのは？',
        choices: ['ツモ', 'ロン', 'リーチ'],
        answers: [1],
        explain:
          'ほかの人の捨てた牌で上がるのが<strong>ロン</strong>、自分で引いて上がるのが<strong>ツモ</strong>です。',
      },
      {
        type: 'quiz',
        body: 'テンパイ（あと1枚で上がり）しているのはどっち？',
        choices: ['{23445m456p22678s}', '{23449m456p22678s}'],
        answers: [0],
        explain: '上は {3m} か {6m} で上がり。下は {4m} と {9m} がバラバラで、あと2枚必要です。',
        retry: 'マンズの部分をくらべてみましょう。',
      },
      {
        type: 'quiz',
        body: 'ハルがリーチしました。ハルの捨て牌には {7s} があります。ハルにロンされない牌はどれ？',
        choices: ['{7s}', '{7p}', '{6s}'],
        answers: [0],
        explain: 'ハルが捨てた牌と同じ {7s} は、ハルにはロンされません。',
        retry: 'リーチした人が捨てた牌と「同じ牌」を探しましょう。',
      },
    ],
  },
  {
    id: 'yaku',
    title: '役（やく）とドラ',
    summary: 'リーチ・ツモ・タンヤオ・役牌',
    steps: [
      text(
        '上がるには、形がそろっているだけでなく<strong>役（やく）が1つ以上</strong>必要です。<br>役は「上がりに付く条件」のこと。役がないと、形がそろってもロンのボタンが出ません。<br>役はたくさんありますが、まずは4つだけ覚えましょう。',
      ),
      text('<strong>① リーチ</strong><br>テンパイでリーチを宣言して上がる。いちばんかんたんな役です。'),
      text(
        '<strong>② ツモ</strong>（門前清自摸和・メンゼンツモ）<br>ほかの人の牌をもらって（鳴いて）いなければ、<strong>自分で引いて上がるだけ</strong>で役になります。<br>役がない手でも、ツモなら上がれます。ロンで上がるには、リーチなどほかの役が必要です。',
      ),
      text(
        '<strong>③ タンヤオ</strong><br>2〜8の数字の牌だけで上がる。1・9と字牌を1枚も使いません。<br>{234m} {345p} {567p} {678s} {22p}<br>ほかの人の牌をもらって（鳴いて）いても付きます。',
      ),
      text(
        '<strong>④ 役牌（ヤクハイ）</strong><br>白 {5z}・發 {6z}・中 {7z} のどれかを3枚そろえる。{777z}<br>東 {1z} も3枚で役になります（このアプリの4局は、どれも「東」の勝負なので）。<br>さらに、<strong>あなたの席の風</strong>の牌も3枚で役。自分の風は、画面の自分の名前の左に出ている字（東・南・西・北）です。<br>役牌は、ポンしても（鳴いても）役になります。',
      ),
      text(
        '<strong>ドラ</strong><br>持っていると、上がったときの点数が増える牌です。<br>画面の「ドラ表示」に出ている牌の<strong>次の数字</strong>の牌がドラです。表示が {3m} ならドラは {4m}。{9m} なら {1m} に戻ります。字牌は 東→南→西→北→東、白→發→中→白 の順。<br>赤い5 {0p} もドラです。<br>ドラは役ではないので、<strong>ドラだけでは上がれません</strong>。',
      ),
      {
        type: 'quiz',
        body: 'タンヤオに使えない牌はどれ？',
        choices: ['{2m}', '{8p}', '{9s}', '{5s}'],
        answers: [2],
        explain: '9は端の数字なので、タンヤオには入りません。',
        retry: 'タンヤオは2〜8だけです。',
      },
      {
        type: 'quiz',
        body: '役牌（ヤクハイ）になる3枚はどれ？',
        choices: ['{333p}', '{555z}', '{999m}'],
        answers: [1],
        explain: '白 {5z} を3枚そろえると役牌です。',
        retry: '白・發・中のどれかを探しましょう。',
      },
      {
        type: 'quiz',
        body: '「ドラ表示」に {3m} が出ています。ドラはどれ？',
        choices: ['{3m}', '{4m}', '{2m}', '{3p}'],
        answers: [1],
        explain: '表示の次の数字 {4m} がドラです。表示されている {3m} そのものはドラではありません。',
        retry: '表示されている牌の「次の数字」です。',
      },
      {
        type: 'quiz',
        body: '鳴いていない、役のない手がテンパイしました。上がれるのはどっち？',
        choices: ['ツモ（自分で引く）', 'ロン（ほかの人の捨て牌）'],
        answers: [0],
        explain:
          '鳴いていなければ、ツモで上がるだけで役が付きます。ロンで上がりたいときは、リーチをかけておきましょう。',
        retry: 'ツモそのものが役になる、と習いましたね。',
      },
      text(
        'これで対局を始められます。<br>「初心者モードで対局してみる」を押すと、やさしい言葉の案内とヒントが出て、相手も弱めになります（ホームの「初心者モード」でいつでも切り替えられます）。<br>迷ったら対局中の「<strong>ヒント</strong>」を押しましょう。役の一覧は、いつでも「役一覧」から見られます。',
      ),
    ],
  },
]);

/**
 * @typedef {object} LessonState
 * @property {number} lesson LESSONS の番号
 * @property {number} step 何画面目か。steps.length のときは「完了」画面
 * @property {number | null} picked 小問題で最後に選んだ選択肢
 */

/**
 * @param {number} lesson
 * @returns {LessonState}
 */
export function openLesson(lesson) {
  return { lesson, step: 0, picked: null };
}

/**
 * @param {LessonState} s
 * @returns {LessonStep | undefined}
 */
function stepOf(s) {
  return LESSONS[s.lesson].steps[s.step];
}

/**
 * いまの画面で「次へ」を押せるか（小問題は正解するまで進めない）。
 * @param {LessonState} s
 * @returns {boolean}
 */
export function canAdvance(s) {
  const step = stepOf(s);
  if (!step) return false;
  return step.type === 'text' || (s.picked !== null && step.answers.includes(s.picked));
}

/**
 * 小問題の選択肢を選ぶ。正解したあとは選び直せない。
 * @param {LessonState} s
 * @param {number} index
 * @returns {LessonState}
 */
export function pickChoice(s, index) {
  const step = stepOf(s);
  if (step?.type !== 'quiz' || canAdvance(s)) return s;
  return { ...s, picked: index };
}

/**
 * @param {LessonState} s
 * @returns {LessonState}
 */
export function nextStep(s) {
  if (!canAdvance(s)) return s;
  return { ...s, step: s.step + 1, picked: null };
}

/**
 * @param {LessonState} s
 * @returns {LessonState}
 */
export function prevStep(s) {
  return { ...s, step: Math.max(0, s.step - 1), picked: null };
}

/**
 * @param {LessonState} s
 * @returns {boolean} 最後まで進んだか
 */
export function isFinished(s) {
  return s.step >= LESSONS[s.lesson].steps.length;
}

/**
 * レッスン一覧（ホームから開く画面）。
 * @param {readonly string[]} done 終えたレッスンの id
 * @returns {string}
 */
export function lessonListHtml(done) {
  const items = LESSONS.map((l, i) => {
    const mark = done.includes(l.id) ? '<span class="lesson-done">✓ 済み</span>' : '';
    return (
      `<li><button type="button" class="lesson-item" data-cmd="lesson-open" data-id="${i}">` +
      `<span class="lesson-no">${i + 1}</span><span class="lesson-name"><strong>${l.title}</strong>` +
      `<span class="small">${l.summary}</span></span>${mark}</button></li>`
    );
  }).join('');
  return (
    '<main class="lesson"><header class="lesson-bar"><button type="button" data-cmd="home" class="chip">ホーム</button>' +
    `<strong>はじめてレッスン</strong><span class="small">${done.length} / ${LESSONS.length} 済み</span></header>` +
    '<div class="lesson-body"><p>麻雀をまったく知らなくても大丈夫。1回3分ほどで、上から順に進めると対局できるようになります。</p>' +
    `<ol class="lesson-list">${items}</ol></div></main>`
  );
}

/**
 * @param {QuizStep} step
 * @param {LessonState} s
 * @returns {string}
 */
function quizHtml(step, s) {
  const solved = canAdvance(s);
  /** @param {number} i */
  const state = (i) => (s.picked !== i ? '' : step.answers.includes(i) ? ' is-correct' : ' is-wrong');
  let choices = '';
  if (step.hand) {
    choices = `<div class="lesson-hand">${parseKinds(step.hand)
      .map(
        (t, i) =>
          `<button type="button" class="lesson-tile${state(i)}" data-cmd="lesson-pick" data-id="${i}"${solved ? ' disabled' : ''}>${richText(`{${t.red ? 0 : (t.kind % 9) + 1}${'mpsz'[Math.floor(t.kind / 9)]}}`, 40)}</button>`,
      )
      .join('')}</div>`;
  } else {
    const wide = step.choices?.some((c) => c.length > 12);
    choices = `<div class="lesson-choices${wide ? ' is-wide' : ''}">${(step.choices ?? [])
      .map(
        (c, i) =>
          `<button type="button" class="lesson-choice${state(i)}" data-cmd="lesson-pick" data-id="${i}"${solved ? ' disabled' : ''}>${richText(c, wide ? 22 : 32)}</button>`,
      )
      .join('')}</div>`;
  }
  let feedback = '';
  if (s.picked !== null) {
    feedback = solved
      ? `<p class="lesson-feedback is-ok"><strong>○ 正解！</strong> ${richText(step.explain, 24)}</p>`
      : `<p class="lesson-feedback is-ng"><strong>× ちがいます。</strong>もう一度選んでください。${step.retry ? richText(step.retry, 24) : ''}</p>`;
  }
  return `<p class="lesson-q">${richText(step.body, TEXT_TILE)}</p>${choices}<div aria-live="polite">${feedback}</div>`;
}

/**
 * レッスン1回分の画面。
 * @param {LessonState} s
 * @returns {string}
 */
export function lessonHtml(s) {
  const lesson = LESSONS[s.lesson];
  const total = lesson.steps.length;
  const bar =
    '<header class="lesson-bar"><button type="button" data-cmd="lesson-list" class="chip">一覧</button>' +
    `<strong>${s.lesson + 1}. ${lesson.title}</strong>` +
    `<span class="small">${Math.min(s.step + 1, total)} / ${total}</span></header>`;

  if (isFinished(s)) {
    const next = LESSONS[s.lesson + 1];
    const buttons = next
      ? `<button type="button" data-cmd="lesson-list" class="act is-quiet">一覧へ</button><button type="button" data-cmd="lesson-open" data-id="${s.lesson + 1}" class="act is-primary">次のレッスンへ</button>`
      : '<button type="button" data-cmd="lesson-list" class="act is-quiet">一覧へ</button><button type="button" data-cmd="new-game-beginner" class="act is-primary">初心者モードで対局してみる</button>';
    const body = next
      ? `<p>次は「${next.title}」です。</p>`
      : '<p>全部のレッスンが終わりました。CPUと対局してみましょう。</p>';
    return `<main class="lesson">${bar}<div class="lesson-body is-center"><h2>レッスン${s.lesson + 1} 完了！</h2>${body}</div><footer class="lesson-foot">${buttons}</footer></main>`;
  }

  const step = /** @type {LessonStep} */ (stepOf(s));
  const body =
    step.type === 'text' ? `<p class="lesson-text">${richText(step.body, TEXT_TILE)}</p>` : quizHtml(step, s);
  const prev =
    s.step > 0
      ? '<button type="button" data-cmd="lesson-prev" class="act is-quiet">戻る</button>'
      : '<span></span>';
  const last = s.step === total - 1;
  const next = `<button type="button" data-cmd="lesson-next" class="act is-primary"${canAdvance(s) ? '' : ' disabled'}>${last ? 'おわり' : '次へ'}</button>`;
  return `<main class="lesson">${bar}<div class="lesson-body">${body}</div><footer class="lesson-foot">${prev}${next}</footer></main>`;
}
