// CPU同士の自動対局をまとめて回し、落ちないことと成績の傾向を確認する。
// 使い方: node scripts/simulate.js [対局数] [開始シード]

import { createCpu } from '../src/cpu/base.js';
import { PERSONALITIES } from '../src/cpu/personalities/index.js';
import { playGame } from '../src/game/runner.js';

const games = Number(process.argv[2] ?? 1000);
const firstSeed = Number(process.argv[3] ?? 1);

const stats = PERSONALITIES.map((p) => ({
  name: `${p.name}(${p.style})`,
  rank: [0, 0, 0, 0],
  wins: 0,
  dealIns: 0,
  riichi: 0,
}));
/** @type {Record<string, number>} */
const ends = {};
/** @type {Record<string, number>} */
const yakuCount = {};
let rounds = 0;
const started = Date.now();

for (let i = 0; i < games; i++) {
  // 席順による有利不利をならすため、対局ごとに席をずらす
  const order = [0, 1, 2, 3].map((seat) => (seat + i) % 4);
  const deciders = order.map((index) => createCpu(PERSONALITIES[index]));
  const { state } = playGame({ seed: firstSeed + i }, deciders, (s) => {
    for (const e of s.events) if (e.type === 'riichi') stats[order[/** @type {number} */ (e.seat)]].riichi++;
    if (s.phase !== 'roundEnd' || !s.result) return;
    rounds++;
    const key =
      s.result.type === 'win'
        ? s.result.wins[0].from === null
          ? 'ツモ'
          : 'ロン'
        : `流局(${s.result.reason})`;
    ends[key] = (ends[key] ?? 0) + 1;
    for (const w of s.result.wins) {
      stats[order[w.seat]].wins++;
      if (w.from !== null) stats[order[w.from]].dealIns++;
      for (const y of w.hand.yaku) yakuCount[y.name] = (yakuCount[y.name] ?? 0) + 1;
    }
  });
  state.ranking.forEach((seat, rank) => {
    stats[order[seat]].rank[rank]++;
  });
}

const seconds = (Date.now() - started) / 1000;
console.log(
  `${games}対局・${rounds}局 を ${seconds.toFixed(1)}秒で完走（1対局あたり ${((seconds / games) * 1000).toFixed(1)}ms）`,
);
console.log('\n局の終わり方:');
for (const [key, n] of Object.entries(ends).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${n} (${((n / rounds) * 100).toFixed(1)}%)`);
}
console.log('\n打ち手ごとの成績:');
for (const s of stats) {
  const avg = s.rank.reduce((sum, n, i) => sum + n * (i + 1), 0) / games;
  console.log(
    `  ${s.name}: 平均順位 ${avg.toFixed(2)} / 着順 ${s.rank.join('-')} / 和了率 ${((s.wins / rounds) * 100).toFixed(1)}% / 放銃率 ${((s.dealIns / rounds) * 100).toFixed(1)}% / リーチ率 ${((s.riichi / rounds) * 100).toFixed(1)}%`,
  );
}
console.log('\n出た役:');
console.log(
  Object.entries(yakuCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ${n}`)
    .join('、'),
);
