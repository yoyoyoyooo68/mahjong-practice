// 効果音（初期はオフ）。音声ファイルを持たず、Web Audio で短い音を作る。

/** @type {AudioContext | null} */
let context = null;

/** @type {Record<string, [number, number][]>} 音の種類 → [周波数(Hz), 長さ(秒)] の並び */
const TONES = {
  discard: [[520, 0.05]],
  call: [
    [660, 0.07],
    [880, 0.09],
  ],
  riichi: [
    [440, 0.08],
    [660, 0.12],
  ],
  win: [
    [523, 0.1],
    [659, 0.1],
    [784, 0.2],
  ],
  draw: [[330, 0.2]],
};

/**
 * @param {keyof typeof TONES} name
 */
export function playSound(name) {
  try {
    context ??= new AudioContext();
    const ctx = context;
    let at = ctx.currentTime;
    for (const [frequency, duration] of TONES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration);
      at += duration;
    }
  } catch {
    // 音が出せない環境では何もしない
  }
}

/**
 * 状態機械のイベントから鳴らす音を選ぶ。
 * @param {import('../game/state.js').GameState} state
 * @returns {keyof typeof TONES | null}
 */
export function soundFor(state) {
  for (const e of state.events) {
    if (e.type === 'roundEnd') return e.detail === 'win' ? 'win' : 'draw';
    if (e.type === 'riichi') return 'riichi';
    if (e.type === 'call' || e.type === 'kan') return 'call';
  }
  return state.events.some((e) => e.type === 'discard') ? 'discard' : null;
}
