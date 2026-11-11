// 初回だけ出す3枚の使い方（牌の選び方・ヒント・役一覧）。スキップでき、設定から再表示できる。

export const ONBOARDING_STEPS = Object.freeze([
  {
    title: '牌の捨て方',
    body: '手牌を1回タップすると牌が持ち上がります。同じ牌をもう1回タップすると捨てます。別の牌をタップすれば選び直せます。',
  },
  {
    title: 'ヒント',
    body: '右上の「ヒント」を押すと、おすすめの牌に▲と枠が付き、理由が表示されます。牌の上の数字は、その牌を捨てたあとに「引くと手が進む牌」が山に何枚あるかです。',
  },
  {
    title: '役一覧',
    body: '上がり（和了）には役が1つ必要です。「役一覧」はいつでも開けます。対局中に出てくる「リーチ」「ドラ」などの用語も、タップすると説明が出ます。',
  },
]);

/**
 * @param {number} step 0〜2
 * @returns {string}
 */
export function onboardingHtml(step) {
  const s = ONBOARDING_STEPS[step];
  const last = step === ONBOARDING_STEPS.length - 1;
  return (
    `<p class="small">使い方 ${step + 1} / ${ONBOARDING_STEPS.length}</p><h2>${s.title}</h2><p>${s.body}</p>` +
    '<div class="panel-buttons">' +
    `${last ? '' : '<button type="button" data-cmd="onboarding-done" class="act is-quiet">スキップ</button>'}` +
    `<button type="button" data-cmd="${last ? 'onboarding-done' : 'onboarding-next'}" class="act">${last ? 'はじめる' : '次へ'}</button></div>`
  );
}
