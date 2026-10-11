// M1-3: 능력 변화(§7), 상태이상(§8), 날씨(§9), 특수 공격기(§5.7), 변화기 계열(§5.8)
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter, calcDamage } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { addStatus, addStages, stage, stageMul, tickTimers, tickDot, useStatusMove, chargeMul } from '../js/sim/effects.js';
import { MOVES } from '../js/data/moves.js';

// 3×3 가방 4개 (2×2 배치), 기술마다 가방 하나
const snap = (species, moves) => ({
  v: 1, species, ability: null, round: 1,
  bags: [[0, 0], [3, 0], [0, 3], [3, 3]].map(([x, y]) => ({ id: 'bag_base', x, y, rot: 0 })),
  items: moves.map((m, i) => ({ id: `move:${m}`, x: (i % 2) * 3, y: Math.floor(i / 2) * 3, rot: 0 })),
});
const fighter = (species, moves = ['tackle'], side = 'A') => makeFighter(side, snap(species, moves));
const newCtx = (seed = 1) => ({ t: 0, rng: createRng(seed), events: [], weather: null });
// 틱 1~2단계만 돌린다
function runTicks(ctx, f, foe, ms) {
  const end = ctx.t + ms;
  while (ctx.t < end) {
    ctx.t += 100;
    tickTimers(ctx, f);
    if (ctx.t % 1000 === 0) tickDot(ctx, f, foe);
  }
}

// ---------- 능력 변화 ----------

test('§7.1 단계 배율 곡선', () => {
  assert.equal(stageMul(2), 1.5);
  assert.equal(stageMul(6), 2.5);
  assert.equal(stageMul(-2).toFixed(2), '0.67');
  assert.equal(stageMul(-6), 0.4);
});

test('§7 단계마다 독립 8초 타이머, 최대 ±6', () => {
  const ctx = newCtx();
  const f = fighter(4, ['scratch']);
  addStages(ctx, f, 'atk', 2);            // t=0, 8초에 만료
  ctx.t = 4000;
  addStages(ctx, f, 'atk', 2);            // t=4초, 12초에 만료
  addStages(ctx, f, 'atk', 4);            // +6에서 막힘
  assert.equal(stage(f, 'atk'), 6);
  runTicks(ctx, f, fighter(1), 4000);     // t=8초
  assert.equal(stage(f, 'atk'), 4);
  runTicks(ctx, f, fighter(1), 4000);     // t=12초
  assert.equal(stage(f, 'atk'), 0);
});

test('§7 칼춤 +2 → 물리 피해 1.5배, 상대 방어 하락은 받는 피해 증가', () => {
  const ctx = newCtx();
  const a = fighter(4, ['scratch']), b = fighter(1);
  const base = calcDamage(a, b, MOVES.slash).damage;
  useStatusMove(ctx, a, b, MOVES['swords-dance'], 'swords-dance');
  assert.equal(stage(a, 'atk'), 2);
  const boosted = calcDamage(a, b, MOVES.slash).damage;
  assert.ok(Math.abs(boosted - base * 1.5) <= 1);
  useStatusMove(ctx, a, b, MOVES.leer, 'leer');        // 방어 −1 (명중 100)
  assert.equal(stage(b, 'def'), -1);
  assert.ok(calcDamage(a, b, MOVES.slash).damage > boosted);
});

test('§5.7 인파이트: 자신 방어·특방 −1', () => {
  const r = simulate(snap(66, ['close-combat']), snap(74, ['tackle']), 1);
  const st = r.events.filter((e) => e.type === 'stage' && e.side === 'A');
  assert.deepEqual(st.slice(0, 2).map((e) => [e.stat, e.stage]), [['def', -1], ['spd', -1]]);
});

// ---------- 상태이상 ----------

test('§8 화상 5중첩: 2초마다 1씩 줄며 1초마다 최대 HP 0.4% × 중첩 피해', () => {
  const ctx = newCtx();
  const f = fighter(1), foe = fighter(4, ['scratch']);
  addStatus(ctx, f, 'burn', 5);
  runTicks(ctx, f, foe, 10000);
  const dots = ctx.events.filter((e) => e.type === 'dot').map((e) => e.damage);
  const stacks = [5, 4, 4, 3, 3, 2, 2, 1, 1];        // 1초 ~ 9초. 10초에는 0
  assert.deepEqual(dots, stacks.map((n) => Math.round(f.maxHp * 0.004 * n)));
  assert.equal(f.status.burn, 0);
});

test('§8 화상 1중첩 이상이면 물리 피해 −20%', () => {
  const a = fighter(1), b = fighter(7);             // 파이리는 불꽃 타입이라 화상 면역
  const base = calcDamage(a, b, MOVES.slash).damage;
  addStatus(newCtx(), a, 'burn', 1);
  assert.equal(a.status.burn, 1);
  assert.ok(Math.abs(calcDamage(a, b, MOVES.slash).damage - base * 0.8) <= 1);
  assert.equal(calcDamage(a, b, MOVES.ember).damage, calcDamage(fighter(1), b, MOVES.ember).damage);   // 특수는 그대로
});

test('§8 졸음 10중첩 → 1.5초 잠듦(충전 정지) → 6초 졸음 면역', () => {
  const ctx = newCtx();
  const f = fighter(4, ['scratch']), foe = fighter(1);
  addStatus(ctx, f, 'drowsy', 10);
  assert.equal(f.haltUntil, 1500);
  assert.equal(f.status.drowsy, 0);
  assert.ok(ctx.events.some((e) => e.type === 'sleep'));
  runTicks(ctx, f, foe, 3000);
  addStatus(ctx, f, 'drowsy', 5);                 // 면역 중 (1.5 + 6 = 7.5초까지)
  assert.equal(f.status.drowsy, 0);
  runTicks(ctx, f, foe, 4600);                     // t = 7.6초
  addStatus(ctx, f, 'drowsy', 5);
  assert.equal(f.status.drowsy, 5);
});

test('§8 10만볼트: 명중마다 마비 2중첩, 마비는 충전 속도 −4%/중첩', () => {
  const r = simulate(snap(172, ['thunderbolt']), snap(4, ['scratch']), 3);
  const i = r.events.findIndex((e) => e.type === 'hit' && e.side === 'A');
  assert.deepEqual(r.events[i + 1], { t: r.events[i].t, side: 'B', type: 'status', status: 'paralysis', stacks: 2 });
  const f = fighter(4, ['scratch']);
  addStatus(newCtx(), f, 'paralysis', 5);
  assert.equal(chargeMul(f), 0.8);
});

test('§8 타입 면역: 불꽃은 화상, 전기는 마비가 쌓이지 않음', () => {
  const ctx = newCtx();
  const fire = fighter(4, ['scratch']), elec = fighter(172, ['thunderbolt']);
  addStatus(ctx, fire, 'burn', 5);
  addStatus(ctx, elec, 'paralysis', 5);
  assert.equal(fire.status.burn, 0);
  assert.equal(elec.status.paralysis, 0);
});

test('§8 냉기 10중첩 → 1초 동결 + 5초 면역, 냉기는 충전 −2%/중첩', () => {
  const ctx = newCtx();
  const f = fighter(1);
  addStatus(ctx, f, 'chill', 10);
  assert.equal(f.haltUntil, 1000);
  assert.equal(f.immune.chill, 6000);
  const g = fighter(1);
  addStatus(ctx, g, 'chill', 4);
  assert.equal(chargeMul(g), 0.92);
});

test('§8 맹독: 독 6 + 2초마다 독 +1', () => {
  const ctx = newCtx();
  const a = fighter(4, ['scratch']), b = fighter(7);
  useStatusMove(ctx, a, b, { ...MOVES.toxic, accuracy: null }, 'toxic');
  assert.equal(b.status.poison, 6);
  runTicks(ctx, b, a, 4000);
  assert.equal(b.status.poison, 8);
  const c = fighter(92, ['lick']);                 // 독 타입은 면역
  useStatusMove(ctx, a, c, { ...MOVES.toxic, accuracy: null }, 'toxic');
  assert.equal(c.status.poison, 0);
});

test('§8 혼란: 기술 대신 자해할 수 있다', () => {
  const r = simulate(snap(92, ['confuse-ray', 'lick']), snap(7, ['tackle', 'water-gun']), 5);
  assert.ok(r.events.some((e) => e.type === 'status' && e.status === 'confusion' && e.stacks === 6));
  assert.ok(r.events.some((e) => e.type === 'confused' && e.side === 'B'));
});

test('§8 풀죽음: 상대의 가장 많이 충전된 기술 충전량 감소', () => {
  // 물기: 풀죽음 30% → 충전량 −15%p
  const r = simulate(snap(7, ['bite']), snap(1, ['tackle']), 1);
  const e = r.events.find((x) => x.type === 'flinch');
  assert.equal(e.side, 'B');
});

// ---------- 날씨 ----------

test('§9 쾌청: 불꽃 ×1.3 / 비: 불꽃 ×0.7, 번개 반드시 명중', () => {
  const a = fighter(4, ['scratch']), b = fighter(7);
  const ctx = newCtx();
  const base = calcDamage(a, b, MOVES.flamethrower, { ctx }).damage;
  ctx.weather = { type: 'sun', until: 99999 };
  assert.ok(Math.abs(calcDamage(a, b, MOVES.flamethrower, { ctx }).damage - base * 1.3) <= 1);
  ctx.weather = { type: 'rain', until: 99999 };
  assert.ok(Math.abs(calcDamage(a, b, MOVES.flamethrower, { ctx }).damage - base * 0.7) <= 1);
  // 비바라기 후 번개: 빗나감 없음 (시드 여러 개)
  for (let seed = 1; seed <= 5; seed++) {
    const r = simulate(snap(172, ['rain-dance', 'thunder']), snap(74, ['tackle']), seed);
    const rainAt = r.events.find((e) => e.type === 'weather').t;
    assert.ok(!r.events.some((e) => e.type === 'miss' && e.move === 'thunder' && e.t > rainAt && e.t < rainAt + 12000));
  }
});

test('§9 모래바람: 바위·땅·강철 외 0.5%/초, 12초 뒤 끝', () => {
  const ctx = newCtx();
  ctx.weather = { type: 'sand', until: 12000 };
  const f = fighter(4, ['scratch']), rock = fighter(74);
  tickDot(ctx, f, rock);
  tickDot(ctx, rock, f);
  const dots = ctx.events.filter((e) => e.type === 'dot');
  assert.deepEqual(dots.map((e) => [e.side, e.damage]), [['A', Math.round(f.maxHp * 0.005)]]);
});

// ---------- 변화기 계열 ----------

test('§5.8 회복: 20% → 15% → 10% → 5%', () => {
  const ctx = newCtx();
  const f = fighter(1), foe = fighter(4, ['scratch']);
  const amounts = [];
  for (let i = 0; i < 5; i++) {
    f.hp = 1;
    useStatusMove(ctx, f, foe, MOVES.synthesis, 'synthesis');
    amounts.push(f.hp - 1);
  }
  assert.deepEqual(amounts, [0.2, 0.15, 0.1, 0.05, 0.05].map((r) => Math.round(f.maxHp * r)));
});

test('§5.8 방어: 2초 안 다음 공격 1회 −80%', () => {
  const ctx = newCtx();
  const a = fighter(4, ['scratch']), b = fighter(7);
  const base = calcDamage(a, b, MOVES.slash, { ctx }).damage;
  useStatusMove(ctx, b, a, MOVES.protect, 'protect');
  assert.equal(b.protectUntil, 2000);
  assert.equal(calcDamage(a, b, MOVES.slash, { ctx, guarded: true }).damage, Math.round(base * 0.2));
});

test('§5.8 벽 6초 −33%, 오로라베일은 설경에서만', () => {
  const ctx = newCtx();
  const a = fighter(4, ['scratch']), b = fighter(7);
  const base = calcDamage(a, b, MOVES.slash, { ctx }).damage;
  useStatusMove(ctx, b, a, MOVES.reflect, 'reflect');
  assert.ok(Math.abs(calcDamage(a, b, MOVES.slash, { ctx }).damage - base * 0.67) <= 1);
  assert.equal(calcDamage(a, b, MOVES.ember, { ctx }).damage, calcDamage(a, fighter(7), MOVES.ember, { ctx }).damage);
  useStatusMove(ctx, b, a, MOVES['aurora-veil'], 'aurora-veil');
  assert.equal(ctx.events.at(-1).type, 'fail');
});

test('§5.8 대타출동: HP 15% 소모, 보호막이 피해를 먼저 받고 상태이상을 막음', () => {
  const ctx = newCtx();
  const f = fighter(7), foe = fighter(4, ['scratch']);
  useStatusMove(ctx, f, foe, MOVES.substitute, 'substitute');
  const cost = Math.round(f.maxHp * 0.15);
  assert.equal(f.subHp, cost);
  assert.equal(f.hp, f.maxHp - cost);
  addStatus(ctx, f, 'burn', 5);
  assert.equal(f.status.burn, 0);
});

test('§5.8 씨뿌리기: 0.8%/초 흡수, 풀 타입 무효', () => {
  const ctx = newCtx();
  const a = fighter(1), b = fighter(7);
  useStatusMove(ctx, a, b, { ...MOVES['leech-seed'], accuracy: null }, 'leech-seed');
  a.hp = 100;
  ctx.t = 1000;
  tickDot(ctx, b, a);
  const d = Math.round(b.maxHp * 0.008);
  assert.equal(b.hp, b.maxHp - d);
  assert.equal(a.hp, 100 + d);
  useStatusMove(ctx, b, a, { ...MOVES['leech-seed'], accuracy: null }, 'leech-seed');
  assert.equal(ctx.events.at(-1).type, 'fail');
});

test('§5.8 도발: 3초간 상대 변화기 충전 정지, 공격기는 그대로', () => {
  // B(꼬부기)의 방어는 도발(3초, 쿨 4.2초) 사이 틈에만 충전되어 훨씬 덜 쓰인다
  const uses = (aMoves) => {
    const r = simulate(snap(92, aMoves), snap(7, ['protect', 'tackle']), 1);
    return (id) => r.events.filter((e) => e.type === 'use' && e.side === 'B' && e.move === id).map((e) => e.t);
  };
  const plain = uses(['lick']), taunted = uses(['taunt', 'lick']);
  assert.ok(taunted('protect').length < plain('protect').length);
  assert.equal(taunted('tackle')[0], plain('tackle')[0]);
});

test('§5.7 반동으로 쉬는 기술: 파괴광선 후 1.5초 충전 정지', () => {
  const r = simulate(snap(6, ['hyper-beam']), snap(74, ['tackle']), 2);
  const e = r.events.find((x) => x.type === 'recharge');
  assert.equal(e.until - e.t, 1500);
});

test('결정성: 효과가 많은 전투도 같은 시드면 같은 로그', () => {
  const a = snap(1, ['leech-seed', 'sleep-powder', 'tackle']);
  const b = snap(4, ['will-o-wisp', 'swords-dance', 'sunny-day', 'flamethrower']);
  const first = JSON.stringify(simulate(a, b, 9));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(simulate(a, b, 9)), first);
});
