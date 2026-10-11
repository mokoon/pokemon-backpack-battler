// 밸런스 보고서 (DESIGN §15): node tools/balance.mjs [--runs 1000] [--strategy-runs 200] [--pool 30] [--seed 1]
// 플레이어 역할 봇이 1라운드부터 실제로 싸우며 런을 진행한다. 상대는 라운드별로 미리 만든 일반 봇 풀.
// 전략 봇(§15.2)은 같은 방식으로 런을 돌리고, 전략끼리 맞대결 표도 만든다.
import { simulate, typeFactor } from '../js/sim/battle.js';
import { createRng, hashSeed } from '../js/sim/rng.js';
import { startBot, botShop, generateBot, STRATEGIES } from '../js/game/bot.js';
import { recordBattle, battleSeed, toSnapshot, abilityChoices } from '../js/game/run.js';
import { STARTER_POOL } from '../js/config.js';
import { MOVES } from '../js/data/moves.js';
import { POKEMON } from '../js/data/pokemon.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const RUNS = arg('runs', 1000);
const STRATEGY_RUNS = arg('strategy-runs', 200);
const POOL = arg('pool', 30);
const SEED = arg('seed', 1);
const MAX_ROUND = 14;

const t0 = Date.now();
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const stdev = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const mark = (pass) => (pass ? '✔' : '✖');
const name = (s) => POKEMON[s].name;

// ---------- 상대 풀 ----------

function makePool(strategy, size, salt) {
  const pool = [];
  for (let r = 1; r <= MAX_ROUND; r++) {
    // 계통마다 같은 수만큼 (무작위로 뽑으면 풀 구성에 따라 상성 결과가 크게 흔들림)
    pool[r] = Array.from({ length: size }, (_, i) =>
      generateBot(hashSeed(SEED, salt, r, i), r, { strategy, species: STARTER_POOL[i % STARTER_POOL.length] }).snapshot);
  }
  return pool;
}
const normalPool = makePool('normal', POOL, 1);
console.error(`상대 풀 준비 ${((Date.now() - t0) / 1000).toFixed(1)}초`);

// ---------- 전투 분석 ----------

const moveIds = (snap) => snap.items.filter((i) => i.id.startsWith('move:')).map((i) => MOVES[i.id.slice(5)]);
const statusMoveCount = (snap) => moveIds(snap).filter((m) =>
  ['ailment', 'sleep', 'confuse'].includes(m.family) || (m.class !== 'status' && m.meta?.ailmentChance > 0 && m.meta.ailment !== 'none')).length;
// 상대 공격기 중 내게 4배인 것이 있는가
const hasQuadThreat = (me, opp) => moveIds(opp).some((m) => m.class !== 'status' && typeFactor(m.type, POKEMON[me.species].types) >= 4);
const composition = (snap) => {
  const ms = moveIds(snap);
  const atk = ms.filter((m) => m.class !== 'status').length;
  return ms.length === 4 && atk === 4 ? 'atk4' : ms.length === 4 && atk === 3 ? 'atk3+1' : 'other';
};

function analyze(result, snapA) {
  const stop = { A: 0, B: 0 };
  const heal = { A: 0, B: 0 };
  const taken = { A: 0, B: 0 };
  for (const e of result.events) {
    if (e.type === 'sleep' || e.type === 'freeze') stop[e.side] += Math.min(e.until, result.durationMs) - e.t;
    if (e.type === 'heal') heal[e.side] += e.amount;
    if (e.type === 'hit') taken[e.side === 'A' ? 'B' : 'A'] += e.damage;
  }
  return {
    duration: result.durationMs,
    fatigue: result.durationMs > 30000,
    stopRatio: (stop.A + stop.B) / (2 * result.durationMs),
    bigHeal: ['A', 'B'].filter((s) => taken[s] > 0 && heal[s] > 0.4 * taken[s]).length,
    statusBuild: statusMoveCount(snapA) >= 2,
    comp: composition(snapA),
  };
}

// ---------- 런 ----------

// 플레이어 봇이 상대 풀과 싸우며 런 진행. 전투마다 onBattle(정보) 호출
function playRun(seed, { species, ability, strategy = 'normal', pool = normalPool, onBattle }) {
  let run = startBot(seed, species, ability);
  const rng = createRng(hashSeed(seed, 9));
  while (run.phase === 'shop' && run.round <= 30) {
    run = botShop(run, { strategy });
    if (run.phase !== 'shop') break;
    const me = toSnapshot(run);
    const opp = pool[Math.min(run.round, MAX_ROUND)][rng.int(POOL)];
    const result = simulate(me, opp, battleSeed(run));
    const outcome = result.winner === 'A' ? 'win' : result.winner === 'B' ? 'loss' : 'draw';
    onBattle?.({ round: run.round, outcome, me, opp, ...analyze(result, me) });
    run = recordBattle(run, outcome).run;
  }
  return run;
}

// ---------- 1. 일반 봇 런 (§15.1) ----------

const battles = [];
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const species = STARTER_POOL[i % STARTER_POOL.length];
  const choices = abilityChoices(species);
  const ability = choices.length ? choices[Math.floor(i / STARTER_POOL.length) % choices.length].id : null;
  const run = playRun(hashSeed(SEED, 100, i), { species, ability, onBattle: (b) => battles.push(b) });
  runs.push({ species, ability, wins: run.wins });
}
console.error(`일반 런 ${RUNS}개 ${((Date.now() - t0) / 1000).toFixed(1)}초`);

const out = [];
const log = (s = '') => out.push(s);
const winRate = (list) => mean(list.map((b) => (b.outcome === 'win' ? 1 : b.outcome === 'draw' ? 0.5 : 0)));
const allWins = mean(runs.map((r) => r.wins));

log(`# 밸런스 보고서 (시드 ${SEED}, 일반 런 ${RUNS}, 전략 런 ${STRATEGY_RUNS}, 상대 풀 라운드당 ${POOL})`);
log(`전체 평균 승수 ${allWins.toFixed(2)}, 전투 ${battles.length}회`);

log('\n## 전투 시간 (목표: 라운드별 중앙값 12~25초, 피로 단계 15% 이하)');
for (let r = 1; r <= MAX_ROUND; r++) {
  const bs = battles.filter((b) => b.round === r);
  if (!bs.length) continue;
  const med = median(bs.map((b) => b.duration)) / 1000;
  const fat = mean(bs.map((b) => (b.fatigue ? 1 : 0)));
  log(`  ${mark(med >= 12 && med <= 25 && fat <= 0.15)} 라운드 ${String(r).padStart(2)}: 중앙값 ${med.toFixed(1)}초, 피로 ${pct(fat)} (${bs.length}회)`);
}

log('\n## 칸당 효율 (목표: 공격기 칸당 초당 위력 표준편차/평균 ≤ 15%)');
const eff = Object.values(MOVES).filter((m) => !m.excluded && m.class !== 'status').map((m) => m.perSec / m.tiles);
const cv = stdev(eff) / mean(eff);
log(`  ${mark(cv <= 0.15)} 평균 ${mean(eff).toFixed(2)}, 표준편차 ${stdev(eff).toFixed(2)} → ${pct(cv)} (공격기 ${eff.length}개)`);

log('\n## 계통별 평균 승수 (목표: 전체 평균의 ±25% 안)');
for (const s of STARTER_POOL) {
  const w = mean(runs.filter((r) => r.species === s).map((r) => r.wins));
  log(`  ${mark(Math.abs(w / allWins - 1) <= 0.25)} ${name(s).padEnd(4)} ${w.toFixed(2)} (${((w / allWins - 1) * 100).toFixed(0)}%)`);
}

log('\n## 특성 (목표: 같은 포켓몬에서 특성별 평균 승수 차이 ±20% 안)');
for (const s of STARTER_POOL) {
  const choices = abilityChoices(s);
  if (choices.length < 2) continue;
  const ws = choices.map((a) => ({ a: a.id, w: mean(runs.filter((r) => r.species === s && r.ability === a.id).map((r) => r.wins)) }));
  const lo = Math.min(...ws.map((x) => x.w)), hi = Math.max(...ws.map((x) => x.w));
  log(`  ${mark(hi / lo - 1 <= 0.2)} ${name(s).padEnd(4)} ${ws.map((x) => `${x.a} ${x.w.toFixed(2)}`).join(', ')}`);
}

log('\n## 상성 운 (감시용)');
const quad = battles.filter((b) => hasQuadThreat(b.me, b.opp));
log(`  4배 약점 공격을 가진 상대와의 전투 ${quad.length}회, 패배 ${pct(mean(quad.map((b) => (b.outcome === 'loss' ? 1 : 0))))} (전체 패배 ${pct(mean(battles.map((b) => (b.outcome === 'loss' ? 1 : 0))))})`);

log('\n## 상태이상 (목표: 상태이상 기술 2개 이상 빌드 승률이 전체의 ±20% 안, 잠듦/동결 시간 15% 이하)');
const sb = battles.filter((b) => b.statusBuild);
const all = winRate(battles);
log(`  ${mark(sb.length && Math.abs(winRate(sb) / all - 1) <= 0.2)} 상태이상 빌드 승률 ${pct(winRate(sb))} (${sb.length}회) / 전체 ${pct(all)}`);
const stop = mean(battles.map((b) => b.stopRatio));
log(`  ${mark(stop <= 0.15)} 잠듦/동결 시간 비율 ${pct(stop)}`);

log('\n## 기술 구성 (목표: 공격기 4개 vs 공격기 3 + 변화기 1 승률 차이 ±15% 안)');
const a4 = battles.filter((b) => b.comp === 'atk4'), a3 = battles.filter((b) => b.comp === 'atk3+1');
log(`  ${mark(a3.length && a4.length && Math.abs(winRate(a3) / winRate(a4) - 1) <= 0.15)} 공격4 ${pct(winRate(a4))} (${a4.length}회) / 공격3+변화1 ${pct(winRate(a3))} (${a3.length}회)`);

log('\n## 회복 (감시용: 회복량이 받은 공격 피해의 40%를 넘는 비율)');
log(`  ${pct(mean(battles.map((b) => b.bigHeal / 2)))}`);

// ---------- 2. 전략 봇 (§15.2) ----------

log('\n## 전략 봇 (붕괴: 승률 65% 이상 / 다른 모든 전략에 55% 이상, 쓸모없음: 35% 미만)');
const stratRate = {};
for (const strategy of STRATEGIES) {
  const bs = [];
  const ws = [];
  for (let i = 0; i < STRATEGY_RUNS; i++) {
    const run = playRun(hashSeed(SEED, 200, STRATEGIES.indexOf(strategy), i), {
      species: STARTER_POOL[i % STARTER_POOL.length], strategy, onBattle: (b) => bs.push(b),
    });
    ws.push(run.wins);
  }
  stratRate[strategy] = winRate(bs);
}
console.error(`전략 런 ${((Date.now() - t0) / 1000).toFixed(1)}초`);

// 맞대결: 전략별 라운드 풀끼리 직접 전투
const H2H_POOL = Math.max(4, Math.round(POOL / 3));
const pools = Object.fromEntries(STRATEGIES.map((s, k) => [s, makePool(s, H2H_POOL, 300 + k)]));
const h2h = {};
for (const a of STRATEGIES) {
  h2h[a] = {};
  for (const b of STRATEGIES) {
    if (a === b) continue;
    let score = 0, n = 0;
    for (let r = 1; r <= MAX_ROUND; r++) {
      for (let i = 0; i < H2H_POOL; i++) {
        const res = simulate(pools[a][r][i], pools[b][r][(i + r) % H2H_POOL], hashSeed(SEED, 400, r, i));
        score += res.winner === 'A' ? 1 : res.winner === 'draw' ? 0.5 : 0;
        n++;
      }
    }
    h2h[a][b] = score / n;
  }
}
console.error(`맞대결 ${((Date.now() - t0) / 1000).toFixed(1)}초`);

for (const s of STRATEGIES) {
  const beatsAll = STRATEGIES.filter((x) => x !== s).every((x) => h2h[s][x] >= 0.55);
  const broken = stratRate[s] >= 0.65 || beatsAll;
  const useless = stratRate[s] < 0.35;
  const flag = broken ? '✖ 붕괴' : useless ? '△ 쓸모없음' : '✔';
  log(`  ${flag.padEnd(6)} ${s.padEnd(12)} 일반 봇 상대 승률 ${pct(stratRate[s])}${beatsAll ? ' (모든 전략에 55% 이상)' : ''}`);
}
log('\n  맞대결 표 (행 전략의 승률)');
log(`  ${''.padEnd(12)} ${STRATEGIES.map((s) => s.slice(0, 6).padStart(7)).join('')}`);
for (const a of STRATEGIES) log(`  ${a.padEnd(12)} ${STRATEGIES.map((b) => (a === b ? '-' : pct(h2h[a][b]).replace('%', '')).padStart(7)).join('')}`);
log('\n  "일반 봇이 그 전략을 따라 할수록 평균 승수가 계속 오름" 판정은 아직 없음 (M5에서 추가 검토)');
log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(out.join('\n'));
