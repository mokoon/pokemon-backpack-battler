// 전투 효과: 능력 변화(§7), 상태이상(§8), 날씨(§9), 변화기 계열(§5.8). 순수 모듈.
import {
  STAGE_STEP, STAGE_MAX, STAGE_MS, STATUS, TOXIC_ADD_MS, FREEZE_MS, FREEZE_IMMUNE_MS, SLEEP_MS, SLEEP_IMMUNE_MS,
  STATUS_MOVE_STACKS, WEATHER_MS, WEATHER_MOVES, SAND_DOT, HEAL_SEQUENCE, PROTECT_MS, SCREEN_MS,
  SUBSTITUTE_COST, LEECH_SEED_MS, LEECH_SEED_DOT, TAUNT_MS, STAGE_ACC_STEP,
  FATIGUE_START_MS, FATIGUE_RATE, FATIGUE_HEAL_MULT, ITEM, ITEM_STACK_WEIGHTS, ABILITY,
} from '../config.js';
import { takeOnce } from './items.js';

const STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

export function initEffects(f) {
  f.stages = [];          // { stat, d: ±1, until }
  f.status = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0]));
  f.toxic = false;
  f.immune = { chill: 0, drowsy: 0 };
  f.haltUntil = 0;        // 잠듦, 동결, 반동으로 쉬기: 모든 충전 정지
  f.protectUntil = 0;
  f.reflectUntil = 0;
  f.lightScreenUntil = 0;
  f.veilUntil = 0;
  f.subHp = 0;
  f.tauntUntil = 0;
  f.seedUntil = 0;        // 이 포켓몬에게 심긴 씨뿌리기
  f.healUses = 0;
}

// ---------- 능력 변화 ----------

export function stage(f, stat) {
  const n = f.stages.reduce((s, e) => s + (e.stat === stat ? e.d : 0), 0);
  return Math.max(-STAGE_MAX, Math.min(STAGE_MAX, n));
}

// +n → 1 + 0.25n, −n → 1 / (1 + 0.25n)
export const stageMul = (n) => (n >= 0 ? 1 + STAGE_STEP * n : 1 / (1 + STAGE_STEP * -n));

// fromFoe: 상대가 거는 변화 (클리어바디가 하락을 막는다)
export function addStages(ctx, f, stat, k, fromFoe = false) {
  // 클리어바디(모두), 날카로운눈(명중), 부풀린가슴(방어): 상대가 거는 하락을 막는다
  const guarded = f.ability === 'clear-body' || (f.ability === 'keen-eye' && stat === 'accuracy') || (f.ability === 'big-pecks' && stat === 'def');
  if (fromFoe && k < 0 && guarded) {
    ctx.events.push({ t: ctx.t, side: f.side, type: 'ability', ability: f.ability });
    return;
  }
  const cur = stage(f, stat);
  const next = Math.max(-STAGE_MAX, Math.min(STAGE_MAX, cur + k));
  for (let i = 0; i < Math.abs(next - cur); i++) f.stages.push({ stat, d: Math.sign(k), until: ctx.t + STAGE_MS });
  ctx.events.push({ t: ctx.t, side: f.side, type: 'stage', stat, change: k, stage: next });
  // 하양허브: 능력 하락이 걸리면 즉시 모두 제거
  if (next < cur && takeOnce(f, (o) => o.kind === 'whiteHerb')) {
    const lowered = STATS.filter((s) => stage(f, s) < 0);
    f.stages = f.stages.filter((e) => e.d > 0);
    ctx.events.push({ t: ctx.t, side: f.side, type: 'item', item: 'white-herb' });
    for (const s of lowered) ctx.events.push({ t: ctx.t, side: f.side, type: 'stage', stat: s, change: 0, stage: stage(f, s) });
  }
}

export function clearStages(ctx, f) {
  const changed = STATS.filter((s) => stage(f, s) !== 0);
  f.stages = [];
  for (const stat of changed) ctx.events.push({ t: ctx.t, side: f.side, type: 'stage', stat, change: 0, stage: 0 });
}

// 명중률 보정 %p: 명중/회피 단계, 모래숨기
export function accuracyMod(ctx, user, target) {
  const sandVeil = ctx.weather?.type === 'sand' && target.ability === 'sand-veil' ? ABILITY.sandVeilAcc : 0;
  const evasion = user.ability === 'keen-eye' ? Math.min(0, stage(target, 'evasion')) : stage(target, 'evasion');   // 날카로운눈: 회피 상승 무시
  return (stage(user, 'accuracy') - evasion) * STAGE_ACC_STEP - sandVeil;
}
export const noGuard = (user) => user.ability === 'no-guard';   // 내 기술만 반드시 명중 (원작은 양쪽, §13.4)

// ---------- 상태이상 ----------

export function addStatus(ctx, f, status, n) {
  const rule = STATUS[status];
  if (rule.immune.some((t) => f.types.includes(t))) return;
  if (f.subHp > 0 || (f.immune[status] ?? 0) > ctx.t) return;
  const before = f.status[status];
  f.status[status] = Math.min(rule.max, before + n);
  if (f.status[status] === before) return;
  ctx.events.push({ t: ctx.t, side: f.side, type: 'status', status, stacks: f.status[status] });
  // 리샘열매: 아무 상태이상이 3중첩 이상 → 모두 제거
  if (f.status[status] >= ITEM.lumStacks && takeOnce(f, (o) => o.kind === 'lumBerry')) {
    ctx.events.push({ t: ctx.t, side: f.side, type: 'item', item: 'lum-berry' });
    for (const s of Object.keys(f.status)) clearStatus(ctx, f, s);
    f.toxic = false;
    return;
  }
  if (status === 'chill' && f.status.chill >= rule.max) halt(ctx, f, 'chill', FREEZE_MS, FREEZE_IMMUNE_MS, 'freeze');
  if (status === 'drowsy' && f.status.drowsy >= rule.max) halt(ctx, f, 'drowsy', SLEEP_MS, SLEEP_IMMUNE_MS, 'sleep');
}

// 상대(from)가 거는 상태이상. 싱크로면 독·화상·마비를 같은 중첩만큼 되돌려 준다
export function inflict(ctx, from, f, status, n) {
  const before = f.status[status];
  addStatus(ctx, f, status, n);
  if (f.ability === 'synchronize' && f.status[status] > before && ['poison', 'burn', 'paralysis'].includes(status)) {
    ctx.events.push({ t: ctx.t, side: f.side, type: 'ability', ability: 'synchronize' });
    addStatus(ctx, from, status, n);
  }
}

function halt(ctx, f, status, ms, immuneMs, type) {
  f.status[status] = 0;
  f.immune[status] = ctx.t + ms + immuneMs;
  f.haltUntil = Math.max(f.haltUntil, ctx.t + ms);
  ctx.events.push({ t: ctx.t, side: f.side, type, until: ctx.t + ms });
  ctx.events.push({ t: ctx.t, side: f.side, type: 'status', status, stacks: 0, halt: true });   // 잠듦/얼음으로 바뀌어 중첩이 0
}

export function clearStatus(ctx, f, status) {
  if (!f.status[status]) return;
  f.status[status] = 0;
  ctx.events.push({ t: ctx.t, side: f.side, type: 'status', status, stacks: 0 });
}

export const hasAnyStatus = (f) => Object.values(f.status).some((n) => n > 0);

// 충전 속도 배율: 스피드 단계 × (1 + 기술별 보너스 − 마비, 냉기 감속)  (§5.2)
export function chargeMul(f, bonus = 0) {
  const slow = f.status.paralysis * STATUS.paralysis.slow + f.status.chill * STATUS.chill.slow;
  return stageMul(stage(f, 'spe')) * Math.max(0, 1 + bonus - slow);
}

// ---------- 틱 1~2단계 ----------

// 1. 타이머 감소와 만료: 능력 변화, 상태이상 자연 감소, 맹독, 날씨
export function tickTimers(ctx, f) {
  const t = ctx.t;
  const expired = f.stages.filter((e) => e.until <= t);
  if (expired.length) {
    const before = Object.fromEntries(STATS.map((s) => [s, stage(f, s)]));
    f.stages = f.stages.filter((e) => e.until > t);
    for (const stat of STATS) {
      const now = stage(f, stat);
      if (now !== before[stat]) ctx.events.push({ t, side: f.side, type: 'stage', stat, change: 0, stage: now });
    }
  }
  for (const [status, rule] of Object.entries(STATUS)) {
    if (rule.decayMs && f.status[status] > 0 && t % rule.decayMs === 0) {
      f.status[status]--;
      ctx.events.push({ t, side: f.side, type: 'status', status, stacks: f.status[status], decay: true });   // 자연 감소
    }
  }
  if (f.toxic && f.status.poison > 0 && t % TOXIC_ADD_MS === 0) addStatus(ctx, f, 'poison', 1);
  // 가속: 5초마다 스피드 +1 (만료 없음, 최대 speedBoostMax)
  if (f.ability === 'speed-boost' && t % ABILITY.speedBoostMs === 0 && (f.speedBoosts ?? 0) < ABILITY.speedBoostMax && stage(f, 'spe') < STAGE_MAX) {
    f.speedBoosts = (f.speedBoosts ?? 0) + 1;
    f.stages.push({ stat: 'spe', d: 1, until: Infinity });
    ctx.events.push({ t, side: f.side, type: 'stage', stat: 'spe', change: 1, stage: stage(f, 'spe') });
  }
  // 탈피: 2초마다 가장 많이 쌓인 상태이상 −2
  if (f.ability === 'shed-skin' && t % ABILITY.shedSkinMs === 0) {
    const [top, n] = Object.entries(f.status).reduce((a, b) => (b[1] > a[1] ? b : a));
    if (n > 0) {
      f.status[top] = Math.max(0, n - ABILITY.shedSkinStacks);
      ctx.events.push({ t, side: f.side, type: 'status', status: top, stacks: f.status[top] });
    }
  }
}

export function tickWeather(ctx) {
  if (ctx.weather && ctx.weather.until <= ctx.t) {
    ctx.weather = null;
    ctx.events.push({ t: ctx.t, type: 'weather', weather: null });
  }
}

// 2. 지속 피해 (1초 경계에서만). 받는 피해 감소와 대타출동을 무시한다.
export function tickDot(ctx, f, foe) {
  const dot = (source, ratio) => {
    if (f.ability === 'magic-guard' && source !== 'fatigue') return 0;   // 매직가드: 피로만 받음
    const damage = Math.max(1, Math.round(f.maxHp * ratio));
    f.hp -= damage;
    ctx.events.push({ t: ctx.t, side: f.side, type: 'dot', source, damage, hp: f.hp });
    return damage;
  };
  if (f.status.poison) dot('poison', STATUS.poison.dot * f.status.poison);
  if (f.status.burn) dot('burn', STATUS.burn.dot * f.status.burn);
  const w = ctx.weather?.type;
  if (w === 'sand' && f.ability !== 'sand-veil' && !f.types.some((t) => ['rock', 'ground', 'steel'].includes(t))) dot('sand', SAND_DOT);
  if (w === 'sun' && f.ability === 'solar-power') dot('solar-power', ABILITY.solarPowerCost);
  if (f.seedUntil > ctx.t) heal(ctx, foe, dot('leech-seed', LEECH_SEED_DOT), 'leech-seed');
  if (f.item.sludgeDamage) dot('black-sludge', f.item.sludgeDamage);
  if (ctx.t > FATIGUE_START_MS) dot('fatigue', FATIGUE_RATE * (ctx.t - FATIGUE_START_MS) / 1000);
  if (w === 'rain' && f.ability === 'rain-dish') heal(ctx, f, Math.round(f.maxHp * ABILITY.rainDish), 'rain-dish');
  if (w === 'snow' && f.ability === 'ice-body') heal(ctx, f, Math.round(f.maxHp * ABILITY.iceBody), 'ice-body');
  if (f.item.leftovers) heal(ctx, f, Math.round(f.maxHp * f.item.leftovers), 'leftovers');
  if (f.item.sludgeHeal) heal(ctx, f, Math.round(f.maxHp * f.item.sludgeHeal), 'black-sludge');
}

// HP 기준 발동: HP가 기준 이하로 새로 내려갔을 때. 열매는 종류마다 하나씩 (§10.1), 자연회복은 1회.
// 확인할 때마다 기준 HP를 갱신한다.
export function checkHpBerries(ctx, f) {
  const prev = f.berryHp ?? f.maxHp;
  const crossed = (ratio) => prev > f.maxHp * ratio && f.hp <= f.maxHp * ratio && f.hp > 0;
  if (f.ability === 'natural-cure' && !f.naturalCured && crossed(ABILITY.naturalCureAt)) {
    f.naturalCured = true;
    ctx.events.push({ t: ctx.t, side: f.side, type: 'ability', ability: 'natural-cure' });
    for (const s of Object.keys(f.status)) clearStatus(ctx, f, s);
    f.toxic = false;
  }
  if (crossed(ITEM.hpBerryAt)) {
    for (const [id, ratio] of [['sitrus-berry', ITEM.sitrus], ['oran-berry', ITEM.oran]]) {
      if (!takeOnce(f, (o) => o.id === id)) continue;
      // 이 전투에서 먹은 HP 열매가 많을수록 덜 회복 (전체 효과 도구와 같은 감소 비율, §10.1)
      const w = ITEM_STACK_WEIGHTS[Math.min(f.hpBerriesUsed ?? 0, ITEM_STACK_WEIGHTS.length - 1)];
      f.hpBerriesUsed = (f.hpBerriesUsed ?? 0) + 1;
      heal(ctx, f, Math.round(f.maxHp * ratio * w), id);
    }
  }
  if (crossed(ITEM.pinchAt)) {
    for (const id of new Set(f.once.filter((o) => o.kind === 'pinchBerry').map((o) => o.id))) {
      const o = takeOnce(f, (x) => x.id === id);
      if (!o) continue;
      ctx.events.push({ t: ctx.t, side: f.side, type: 'item', item: id });
      addStages(ctx, f, o.stat, 1);
    }
  }
  f.berryHp = f.hp;
}

export function heal(ctx, f, amount, source) {
  if (ctx.t > FATIGUE_START_MS) amount = Math.round(amount * FATIGUE_HEAL_MULT);
  amount = Math.min(amount, f.maxHp - f.hp);   // 실제로 오른 양만
  if (amount <= 0 || f.hp <= 0) return;
  f.hp += amount;
  ctx.events.push({ t: ctx.t, side: f.side, type: 'heal', source, amount, hp: f.hp });
}

// ---------- 변화기 (§5.8) ----------

// 상대를 노리는 변화기의 명중 판정
function statusHits(ctx, user, target, move) {
  if (!move.accuracy || noGuard(user)) return true;
  return ctx.rng.chance((move.accuracy + accuracyMod(ctx, user, target)) / 100);
}

export function useStatusMove(ctx, user, target, move, id) {
  const t = ctx.t;
  const fail = () => ctx.events.push({ t, side: user.side, type: 'fail', move: id });
  const selfTarget = move.target === 'user' || ['protect', 'screen', 'aurora-veil', 'substitute', 'weather', 'haze', 'heal'].includes(move.family);
  if (!selfTarget && !statusHits(ctx, user, target, move)) {
    ctx.events.push({ t, side: user.side, type: 'miss', move: id });
    return;
  }
  switch (move.family) {
    case 'boost1':
    case 'boost2':
      for (const c of move.statChanges) addStages(ctx, user, c.stat, c.change);
      break;
    case 'lower':
      for (const c of move.statChanges) addStages(ctx, target, c.stat, c.change, true);
      break;
    case 'ailment':
    case 'sleep':
    case 'confuse': {
      const { toxic, ...stacks } = STATUS_MOVE_STACKS[id] ?? {};
      for (const [status, n] of Object.entries(stacks)) inflict(ctx, user, target, status, n);
      if (toxic && target.status.poison > 0) target.toxic = true;
      for (const c of move.statChanges) addStages(ctx, target, c.stat, c.change, true);   // 뽐내기: 상대 공격 +2
      break;
    }
    case 'heal': {
      const ratio = HEAL_SEQUENCE[Math.min(user.healUses++, HEAL_SEQUENCE.length - 1)];
      heal(ctx, user, Math.round(user.maxHp * ratio), id);
      break;
    }
    case 'protect':
      user.protectUntil = t + PROTECT_MS;
      ctx.events.push({ t, side: user.side, type: 'protect', until: user.protectUntil });
      break;
    case 'screen': {
      const key = id === 'reflect' ? 'reflectUntil' : 'lightScreenUntil';
      user[key] = t + Math.round(SCREEN_MS * (1 + user.item.lightClay));
      ctx.events.push({ t, side: user.side, type: 'screen', move: id, until: user[key] });
      break;
    }
    case 'aurora-veil':
      if (ctx.weather?.type !== 'snow') return fail();
      user.veilUntil = t + Math.round(SCREEN_MS * (1 + user.item.lightClay));
      ctx.events.push({ t, side: user.side, type: 'screen', move: id, until: user.veilUntil });
      break;
    case 'weather':
      ctx.weather = { type: WEATHER_MOVES[id], until: t + WEATHER_MS };
      ctx.events.push({ t, type: 'weather', weather: ctx.weather.type, until: ctx.weather.until });
      break;
    case 'substitute': {
      const cost = Math.round(user.maxHp * SUBSTITUTE_COST);
      if (user.hp <= cost) return fail();
      user.hp -= cost;
      user.subHp = cost;
      ctx.events.push({ t, side: user.side, type: 'substitute', amount: cost, hp: user.hp });
      break;
    }
    case 'leech-seed':
      if (target.types.includes('grass')) return fail();
      target.seedUntil = t + LEECH_SEED_MS;
      ctx.events.push({ t, side: target.side, type: 'leech-seed', until: target.seedUntil });
      break;
    case 'taunt':
      if (target.ability === 'oblivious') {   // 둔감: 도발 무효
        ctx.events.push({ t, side: target.side, type: 'ability', ability: 'oblivious' });
        break;
      }
      target.tauntUntil = t + TAUNT_MS;
      ctx.events.push({ t, side: target.side, type: 'taunt', until: target.tauntUntil });
      break;
    case 'haze':
      clearStages(ctx, user);
      clearStages(ctx, target);
      break;
  }
}
