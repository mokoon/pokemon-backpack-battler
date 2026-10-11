// 효과음: Web Audio로 합성 (원작 소리 파일 없음, DESIGN §1). 브라우저 정책상 첫 사용자 조작 뒤에 소리가 난다.
let ctx = null;
let master = null;
let volume = 0.5;
const lastPlayed = {};

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

// 음 하나: 주파수가 from → to로 미끄러지는 짧은 소리
function tone(at, { type = 'square', from, to = from, dur = 0.1, gain = 0.3 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// 잡음 (타격음)
function noise(at, { dur = 0.08, gain = 0.3, freq = 1200 }) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(at);
}

const SOUNDS = {
  use: (t) => tone(t, { type: 'square', from: 660, to: 880, dur: 0.06, gain: 0.12 }),
  hit: (t) => { noise(t, { dur: 0.09, gain: 0.35, freq: 1500 }); tone(t, { type: 'triangle', from: 180, to: 80, dur: 0.1, gain: 0.3 }); },
  super: (t) => { noise(t, { dur: 0.14, gain: 0.45, freq: 2500 }); tone(t, { type: 'sawtooth', from: 300, to: 90, dur: 0.16, gain: 0.25 }); },
  weak: (t) => { noise(t, { dur: 0.06, gain: 0.2, freq: 700 }); },
  crit: (t) => { tone(t, { type: 'square', from: 1400, to: 1800, dur: 0.05, gain: 0.15 }); SOUNDS.super(t + 0.04); },
  miss: (t) => tone(t, { type: 'sine', from: 500, to: 250, dur: 0.12, gain: 0.15 }),
  status: (t) => { for (let i = 0; i < 3; i++) tone(t + i * 0.05, { type: 'sine', from: 520 + i * 60, to: 400, dur: 0.05, gain: 0.12 }); },
  stage: (t) => tone(t, { type: 'triangle', from: 400, to: 800, dur: 0.12, gain: 0.15 }),
  heal: (t) => { tone(t, { type: 'sine', from: 660, dur: 0.08, gain: 0.15 }); tone(t + 0.07, { type: 'sine', from: 990, dur: 0.1, gain: 0.15 }); },
  item: (t) => tone(t, { type: 'triangle', from: 1200, to: 1500, dur: 0.08, gain: 0.15 }),
  faint: (t) => tone(t, { type: 'square', from: 400, to: 60, dur: 0.5, gain: 0.2 }),
  win: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, { type: 'square', from: f, dur: i === 3 ? 0.35 : 0.1, gain: 0.15 })),
  lose: (t) => [392, 330, 262].forEach((f, i) => tone(t + i * 0.16, { type: 'triangle', from: f, dur: 0.2, gain: 0.2 })),
};

// 소리 이름으로 재생. 같은 소리가 아주 짧은 간격으로 겹치면 건너뛴다 (배속 재생 대비)
export function sfx(name) {
  if (volume <= 0 || !SOUNDS[name]) return;
  const c = audio();
  if (!c) return;
  const now = c.currentTime;
  if (now - (lastPlayed[name] ?? -1) < 0.04) return;
  lastPlayed[name] = now;
  SOUNDS[name](now);
}
