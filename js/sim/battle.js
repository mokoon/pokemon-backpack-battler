// 전투 시뮬레이터 (DESIGN §6, §11). 순수 모듈: Math.random, Date.now, DOM 금지.
import {
  HP_MUL, HP_BASE_ADD, hpScale, SPEED_ADD, SPEED_DIV, PRIORITY_START_CHARGE, DMG_K, STAT_ADD, STAB,
  CRIT_MULT, CRIT_CHANCE, WEATHER_MS, UPGRADE, MULTI_HIT_2_5, TICK_MS, TIME_LIMIT_MS, RECHARGE_HALT_MS,
  BURN_PHYS_MULT, CONFUSION_CHANCE, CONFUSION_POWER, AILMENT_CHANCE_DIV, AILMENT_MAP, FLINCH_DIV,
  WEATHER_BOOST, WEATHER_WEAKEN, WEATHER_DEF_MULT, PROTECT_MULT, SCREEN_MULT, CHARGE_COOL_MUL, ITEM, ABILITY,
} from '../config.js';
import { TYPE_CHART } from '../data/typechart.js';
import { createRng } from './rng.js';
import { validateSnapshot, resolveBuild } from './snapshot.js';
import {
  initEffects, stage, stageMul, addStages, clearStages, addStatus, clearStatus, chargeMul, hasAnyStatus,
  accuracyMod, noGuard, tickTimers, tickWeather, tickDot, heal, useStatusMove, checkHpBerries, inflict,
} from './effects.js';
import { setupItems, takeOnce } from './items.js';
import { ABILITIES, battleAbility } from '../rules/abilities.js';

const SOLAR_MOVES = ['solar-beam', 'solar-blade'];
const CONFUSION_HIT = { type: null, class: 'physical', power1: CONFUSION_POWER };

// 스냅샷 → 전투 중 상태
export function makeFighter(side, snap) {
  const build = resolveBuild(snap);
  const st = build.pokemon.stats;
  const maxHp = Math.round((HP_MUL * st.hp + HP_BASE_ADD) * hpScale(build.round));
  const f = {
    side,
    build,
    species: build.species,
    ability: battleAbility(build.ability),
    types: build.pokemon.types,
    maxHp,
    hp: maxHp,
    atk: st.atk,
    spa: st.spa,
    def: (st.def + st.spd) / 2,
    spe: st.spe,
    speedRate: Math.sqrt((st.spe + SPEED_ADD) / SPEED_DIV),
    moves: build.moves.map((m, order) => ({
      ...m,
      order,
      move: upgradedMove(m.move, m.lv ?? 0),
      coolMs: Math.round((m.move.cool * 1000) / (m.move.class === 'status' ? 1 + UPGRADE.statusCharge * (m.lv ?? 0) : 1)),
      charge: PRIORITY_START_CHARGE[Math.min(m.move.priority, 3)] ?? 0,   // 0~1
    })),
  };
  initEffects(f);
  setupItems(f);
  return f;
}

// 강화된 기술 (§10.3): 공격기는 1회 위력 +20%씩, 변화기는 충전이 빨라진다(coolMs에서 처리)
function upgradedMove(move, lv) {
  if (!lv || move.class === 'status') return move;
  return { ...move, power1: Math.round(move.power1 * (1 + UPGRADE.movePower * lv)) };
}

export function typeFactor(moveType, defTypes) {
  if (!moveType) return 1;   // 발버둥, 혼란 자해: 상성 계산 없음
  return defTypes.reduce((f, t) => f * (TYPE_CHART[moveType]?.[t] ?? 1), 1);
}

// 상성 + 특성 무효 (부유: 땅, 피뢰침: 전기)
export function effectiveness(target, move) {
  if ((move.type === 'ground' && target.ability === 'levitate') || (move.type === 'electric' && target.ability === 'lightning-rod')) return 0;
  return typeFactor(move.type, target.types);
}

// 한 번의 명중(연속기는 1타) 피해 (§6). ctx가 있으면 날씨, 벽, 방어를 반영한다.
// bonus: 기술별 도구 피해 보너스 합 (setupItems의 dmgBonus), extra: 그 밖의 배율 (반감 열매 등)
export function calcDamage(user, target, move, { crit = false, ctx = null, guarded = false, bonus = 0, extra = 1 } = {}) {
  const eff = effectiveness(target, move);
  if (eff === 0) return { damage: 0, eff };
  const phys = move.class === 'physical';
  const a = phys ? user.atk : user.spa;
  const stab = move.type && user.types.includes(move.type) ? STAB : 1;
  let mul = stab * eff * (crit ? CRIT_MULT : 1) * DMG_K;
  mul *= stageMul(stage(user, phys ? 'atk' : 'spa'));
  mul /= stageMul(stage(target, phys ? 'def' : 'spd'));
  // 특성 (공격 쪽): 맹화류, 근성(화상 감소 무시), 선파워
  const guts = user.ability === 'guts' && hasAnyStatus(user);
  if (phys && user.status.burn > 0 && !guts) mul *= BURN_PHYS_MULT;
  if (guts && phys) mul *= ABILITY.gutsMult;
  if (user.ability === 'hustle' && phys) mul *= ABILITY.hustleMult;
  const pinch = ABILITIES[user.ability]?.pinchType;
  if (pinch && move.type === pinch && user.hp <= user.maxHp * ABILITY.pinchAt) mul *= ABILITY.pinchMult;
  if (user.ability === 'solar-power' && !phys && ctx?.weather?.type === 'sun') mul *= ABILITY.solarPower;
  // 특성 (받는 쪽): 멀티스케일, 이상한비늘
  if (target.ability === 'multiscale' && target.hp === target.maxHp) mul *= ABILITY.multiscale;
  if (target.ability === 'marvel-scale' && phys && hasAnyStatus(target)) mul *= ABILITY.marvelScale;
  if (target.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) mul *= ABILITY.thickFat;
  // 도구: 피해 보너스는 더하고(달인의띠 포함), 받는 피해 감소는 곱한다
  mul *= Math.max(0, 1 + bonus + (eff > 1 ? user.item.expertBelt : 0));
  mul *= target.item.allTaken * (phys ? 1 : target.item.specialTaken) * extra;
  if (ctx) {
    const t = ctx.t;
    const w = ctx.weather?.type;
    if ((w === 'sun' && move.type === 'fire') || (w === 'rain' && move.type === 'water')) mul *= WEATHER_BOOST;
    if ((w === 'sun' && move.type === 'water') || (w === 'rain' && move.type === 'fire')) mul *= WEATHER_WEAKEN;
    if (w === 'sand' && !phys && target.types.includes('rock')) mul *= WEATHER_DEF_MULT;
    if (w === 'snow' && phys && target.types.includes('ice')) mul *= WEATHER_DEF_MULT;
    if (target.veilUntil > t || (phys ? target.reflectUntil : target.lightScreenUntil) > t) mul *= SCREEN_MULT;
    if (guarded) mul *= PROTECT_MULT;
  }
  return { damage: Math.max(1, Math.round(move.power1 * (a + STAT_ADD) / (target.def + STAT_ADD) * mul)), eff };
}

function hitCount(move, rng) {
  const lo = move.meta?.minHits, hi = move.meta?.maxHits;
  if (!lo || !hi) return 1;
  if (lo === 2 && hi === 5) {
    let r = rng.next();
    for (const [n, p] of MULTI_HIT_2_5) if ((r -= p) < 0) return n;
    return 5;
  }
  return lo + rng.int(hi - lo + 1);
}

function accuracyHits(ctx, user, target, slot) {
  const { move, id } = slot;
  const w = ctx.weather?.type;
  if (!move.accuracy || noGuard(user) || (id === 'thunder' && w === 'rain') || (id === 'blizzard' && w === 'snow')) return true;
  const hustle = user.ability === 'hustle' && move.class === 'physical' ? ABILITY.hustleAcc : 1;   // 의욕: 물리 명중률 ×0.8
  return ctx.rng.chance(((move.accuracy + slot.accBonus + accuracyMod(ctx, user, target)) * hustle) / 100);
}

// 공격 피해를 대타출동이 먼저 받는다. 옹골참: HP 가득에서 쓰러질 피해면 1 남김 (전투당 1번, 기합의띠와 따로)
// 기합의띠: HP 50% 이상에서 쓰러질 피해면 1 남김 (전투당 1번)
function applyHit(ctx, target, damage) {
  const sub = Math.min(target.subHp, damage);
  target.subHp -= sub;
  const before = target.hp;
  target.hp -= damage - sub;
  if (target.hp <= 0 && target.ability === 'sturdy' && !target.sturdyUsed && before === target.maxHp) {
    target.sturdyUsed = true;
    target.hp = 1;
    ctx.events.push({ t: ctx.t, side: target.side, type: 'ability', ability: 'sturdy' });
  }
  if (target.hp <= 0 && target.sash > 0 && before >= target.maxHp * ITEM.sashMinHp) {
    target.sash--;
    target.hp = 1;
    ctx.events.push({ t: ctx.t, side: target.side, type: 'item', item: 'focus-sash' });
  }
  return sub;
}

// 반감 열매: 그 타입 효과가 굉장한 공격을 ITEM.resistBerryUses회까지 −50% (실크열매는 원작처럼 노말 공격이면 발동)
function resistBerry(ctx, target, move, eff) {
  if (!move.type || (eff <= 1 && move.type !== 'normal')) return 1;
  const berry = takeOnce(target, (o) => o.kind === 'resistBerry' && o.type === move.type);
  if (!berry) return 1;
  ctx.events.push({ t: ctx.t, side: target.side, type: 'item', item: berry.id });
  return ITEM.resistBerry;
}

function useAttack(ctx, user, target, slot) {
  const { t, rng, events } = ctx;
  const move = slot.move;
  if (!accuracyHits(ctx, user, target, slot)) {
    events.push({ t, side: user.side, type: 'miss', move: slot.id });
    return;
  }
  const guarded = target.protectUntil > t;
  const hits = hitCount(move, rng);
  const meta = move.meta;
  let dealt = 0;
  let landed = 0;
  for (let i = 0; i < hits; i++) {
    // 대운: 급소 단계 +1, 조가비갑옷: 급소에 맞지 않음
    const critStage = (meta?.critRate ?? 0) + slot.critBonus + (user.ability === 'super-luck' ? 1 : 0);
    const crit = target.ability !== 'shell-armor' && rng.chance(CRIT_CHANCE[Math.min(critStage, 2)]);
    const eff0 = effectiveness(target, move);
    const extra = eff0 > 0 ? resistBerry(ctx, target, move, eff0) : 1;
    const { damage, eff } = calcDamage(user, target, move, { crit, ctx, guarded, bonus: slot.dmgBonus, extra });
    const sub = applyHit(ctx, target, damage);
    dealt += damage;
    events.push({ t, side: user.side, type: 'hit', move: slot.id, damage, crit, eff, sub, hp: target.hp });
    if (move.type === 'electric' && target.ability === 'lightning-rod') addStages(ctx, target, 'spa', 1);
    if (eff === 0) break;
    landed++;
    // 정전기: 접촉 공격을 받을 때마다 상대 마비 3중첩
    if (target.ability === 'static' && move.flags.includes('contact')) addStatus(ctx, user, 'paralysis', ABILITY.staticStacks);
    if (target.ability === 'poison-point' && move.flags.includes('contact')) addStatus(ctx, user, 'poison', ABILITY.poisonPointStacks);
    // 울퉁불퉁멧: 접촉 기술에 맞으면 그 피해의 일부를 반사
    if (target.item.helmet && move.flags.includes('contact')) {
      selfDamage(ctx, user, Math.max(1, Math.round(damage * target.item.helmet)), 'rocky-helmet');
    }
    // 추가 효과: 상태이상은 확률 대신 확정 중첩 (§8.3), 타마다 적용. 은밀망토면 받지 않음
    const status = AILMENT_MAP[meta?.ailment];
    if (status && meta.ailmentChance > 0 && !target.item.cloak) {
      const stacks = Math.max(1, Math.round(meta.ailmentChance / AILMENT_CHANCE_DIV));
      inflict(ctx, user, target, status, stacks * (user.ability === 'serene-grace' ? ABILITY.sereneGrace : 1));
    }
    if (move.type === 'fire') clearStatus(ctx, target, 'chill');
    if (meta?.flinchChance && !target.item.cloak) flinch(ctx, target, meta.flinchChance / FLINCH_DIV / 100);
  }
  if (guarded && landed) target.protectUntil = 0;
  if (!landed) return;

  // 능력 변화: 확률은 시드 난수 (§5.7). damage-raise는 자신, 그 외는 상대
  const statChance = (meta?.statChance ?? 0) * (user.ability === 'serene-grace' ? ABILITY.sereneGrace : 1);
  if (move.statChanges.length && (!statChance || rng.chance(statChance / 100))) {
    const who = meta?.category === 'damage-raise' ? user : target;
    if (who === user || !target.item.cloak) for (const c of move.statChanges) addStages(ctx, who, c.stat, c.change, who === target);
  }
  // 저주받은바디: 공격을 받으면 그 기술 충전량 −10%p (음수 = 다음 발동이 늦어짐)
  if (target.ability === 'cursed-body') slot.charge -= ABILITY.cursedBody;
  if (slot.id === 'clear-smog') clearStages(ctx, target);
  if (meta?.drain > 0) heal(ctx, user, Math.round(dealt * meta.drain / 100), slot.id);
  if (user.item.shellBell) heal(ctx, user, Math.round(dealt * user.item.shellBell), 'shell-bell');
  if (meta?.drain < 0 && user.ability !== 'rock-head') selfDamage(ctx, user, Math.max(1, Math.round(dealt * -meta.drain / 100)), slot.id);
  if (move.recoil) selfDamage(ctx, user, Math.max(1, Math.round(user.maxHp * move.recoil)), slot.id);   // 발버둥
  if (move.flags.includes('recharge')) {
    user.haltUntil = Math.max(user.haltUntil, t + RECHARGE_HALT_MS);
    events.push({ t, side: user.side, type: 'recharge', until: user.haltUntil });
  }
}

function selfDamage(ctx, f, damage, move) {
  if (f.ability === 'magic-guard' && move !== 'struggle') return;   // 매직가드: 반동·생명의구슬·울퉁불퉁멧 무효 (발버둥 반동은 받음)
  f.hp -= damage;
  ctx.events.push({ t: ctx.t, side: f.side, type: 'recoil', move, damage, hp: f.hp });
}

// 풀죽음: 상대의 가장 많이 충전된 기술 충전량을 깎는다
function flinch(ctx, target, amount) {
  if (target.ability === 'inner-focus') return;
  if (target.ability === 'steadfast') addStages(ctx, target, 'spe', 1);
  const top = target.moves.reduce((a, m) => (m.charge > a.charge ? m : a));
  top.charge = Math.max(0, top.charge - amount);
  ctx.events.push({ t: ctx.t, side: target.side, type: 'flinch', move: top.id, charge: top.charge });
}

function useMove(ctx, user, target, slot) {
  const { t, rng, events } = ctx;
  events.push({ t, side: user.side, type: 'use', move: slot.id });
  // 혼란: 중첩 × 4% 확률로 위력 40 무속성 물리 자해
  if (user.status.confusion > 0 && rng.chance(user.status.confusion * CONFUSION_CHANCE)) {
    const { damage } = calcDamage(user, user, CONFUSION_HIT);
    user.hp -= damage;
    events.push({ t, side: user.side, type: 'confused', damage, hp: user.hp });
    return;
  }
  if (slot.move.class === 'status') return useStatusMove(ctx, user, target, slot.move, slot.id);
  useAttack(ctx, user, target, slot);
  // 생명의구슬: 공격기 사용마다 최대 HP 일부를 잃음
  if (user.item.lifeOrbCost) selfDamage(ctx, user, Math.max(1, Math.round(user.maxHp * user.item.lifeOrbCost)), 'life-orb');
}

function effectiveCoolMs(ctx, slot) {
  if (ctx.weather?.type === 'sun' && SOLAR_MOVES.includes(slot.id)) return slot.coolMs / CHARGE_COOL_MUL;
  return slot.coolMs;
}

// simulate(snapA, snapB, seed) → { winner: 'A'|'B'|'draw', events, durationMs }
export function simulate(snapA, snapB, seed) {
  for (const [side, snap] of [['A', snapA], ['B', snapB]]) {
    const errors = validateSnapshot(snap);
    if (errors.length) throw new Error(`스냅샷 ${side} 오류: ${errors.join(', ')}`);
  }
  const A = makeFighter('A', snapA);
  const B = makeFighter('B', snapB);
  const ctx = { t: 0, rng: createRng(seed), events: [], weather: null };
  ctx.events.push({ t: 0, type: 'start', hp: { A: A.hp, B: B.hp }, maxHp: { A: A.maxHp, B: B.maxHp } });
  const foe = (f) => (f === A ? B : A);
  // 모래날림: 전투 시작 시 모래바람 (§13.3)
  for (const f of [A, B]) {
    if (f.ability !== 'sand-stream') continue;
    ctx.weather = { type: 'sand', until: WEATHER_MS };
    ctx.events.push({ t: 0, side: f.side, type: 'ability', ability: 'sand-stream' });
    ctx.events.push({ t: 0, type: 'weather', weather: 'sand', until: WEATHER_MS });
  }

  while (ctx.t < TIME_LIMIT_MS) {
    ctx.t += TICK_MS;
    const t = ctx.t;
    // 1. 타이머, 만료
    tickWeather(ctx);
    for (const f of [A, B]) tickTimers(ctx, f);
    // 2. 지속 피해/회복 (1초 경계)
    if (t % 1000 === 0) for (const f of [A, B]) tickDot(ctx, f, foe(f));
    for (const f of [A, B]) checkHpBerries(ctx, f);
    // 3. 충전 (잠듦·동결·반동 중에는 정지, 도발 중에는 변화기 정지)
    for (const f of [A, B]) {
      if (f.haltUntil >= t) continue;
      const chloro = f.ability === 'chlorophyll' && ctx.weather?.type === 'sun' ? ABILITY.chlorophyll : 0;
      for (const m of f.moves) {
        if (m.move.class === 'status' && f.tauntUntil >= t) continue;
        m.charge += TICK_MS * f.speedRate * chargeMul(f, m.chargeBonus + chloro) / effectiveCoolMs(ctx, m);
      }
    }
    // 4. 충전이 찬 기술 발동: 우선도 → 스피드 → 가방 읽기 순서 → A 먼저
    const ready = [];
    for (const f of [A, B]) for (const m of f.moves) if (m.charge >= 1 - 1e-9) ready.push({ f, m });
    ready.sort((x, y) =>
      y.m.move.priority - x.m.move.priority || y.f.spe - x.f.spe || x.m.order - y.m.order ||
      (x.f.side === 'A' ? -1 : 1) - (y.f.side === 'A' ? -1 : 1));
    for (const { f, m } of ready) {
      if (A.hp <= 0 || B.hp <= 0) break;   // 이 틱에 이미 쓰러졌으면 남은 기술은 발동하지 않음 (§11.2)
      m.charge = 0;
      useMove(ctx, f, foe(f), m);
      for (const g of [A, B]) checkHpBerries(ctx, g);
    }
    // 5. HP 확인
    if (A.hp <= 0 || B.hp <= 0) {
      const winner = A.hp <= 0 && B.hp <= 0 ? 'draw' : A.hp <= 0 ? 'B' : 'A';
      ctx.events.push({ t, type: 'end', winner, reason: 'ko' });
      return { winner, events: ctx.events, durationMs: t };
    }
  }
  // 시간 제한 (§11.3): 남은 HP 비율이 높은 쪽 승리
  const ra = A.hp / A.maxHp, rb = B.hp / B.maxHp;
  const winner = ra === rb ? 'draw' : ra > rb ? 'A' : 'B';
  ctx.events.push({ t: ctx.t, type: 'end', winner, reason: 'time' });
  return { winner, events: ctx.events, durationMs: ctx.t };
}
