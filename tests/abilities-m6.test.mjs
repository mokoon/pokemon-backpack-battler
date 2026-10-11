// M6: 시작 포켓몬 20마리로 확장하며 추가한 특성 (§13.3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter, calcDamage } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { addStages, stage, tickTimers, tickDot, accuracyMod, useStatusMove } from '../js/sim/effects.js';
import { MOVES } from '../js/data/moves.js';
import { POKEMON } from '../js/data/pokemon.js';
import { STARTER_POOL } from '../js/config.js';
import { evolutions, abilityChoices } from '../js/game/run.js';

const FULL = [[0, 0], [3, 0], [6, 0], [0, 3], [3, 3], [6, 3]].map(([x, y]) => ({ id: 'bag_base', x, y, rot: 0 }));
const snap = (species, ability, items) => ({
  v: 1, species, ability, round: 1, bags: FULL,
  items: items.map((it) => (typeof it === 'string' ? [`move:${it}`, 0, 0] : it)).map(([id, x, y]) => ({ id, x, y, rot: 0 })),
});
const fighter = (species, ability, items = [], side = 'A') => makeFighter(side, snap(species, ability, items));
const newCtx = (weather = null) => ({ t: 0, rng: createRng(1), events: [], weather: weather && { type: weather, until: 1e9 } });

test('시작 후보 20마리, 모든 계통의 모든 단계에 고를 수 있는 특성이 있음', () => {
  assert.equal(STARTER_POOL.length, 20);
  assert.equal(new Set(STARTER_POOL).size, 20);
  const walk = (s) => [s, ...evolutions(s).flatMap((e) => walk(e.to))];
  for (const s of STARTER_POOL) {
    assert.ok(!POKEMON[s].legendary && !POKEMON[s].mythical, `${s} 전설`);
    assert.ok(evolutions(s).length > 0, `${s} 진화 없음`);
    for (const x of walk(s)) assert.ok(abilityChoices(x).length > 0, `${POKEMON[x].name} 고를 특성 없음`);
  }
});

test('날카로운눈: 명중 하락을 막고 상대 회피 상승 무시 / 부풀린가슴: 방어 하락을 막음', () => {
  const ctx = newCtx();
  const a = fighter(16, 'keen-eye', ['gust']), b = fighter(16, null, ['gust'], 'B');
  addStages(ctx, a, 'accuracy', -1, true);
  assert.equal(stage(a, 'accuracy'), 0);
  addStages(ctx, b, 'evasion', 2);
  assert.equal(accuracyMod(ctx, a, b), 0);
  assert.ok(accuracyMod(ctx, fighter(16, null, ['gust']), b) < 0);
  const c = fighter(16, 'big-pecks', ['gust']);
  addStages(ctx, c, 'def', -1, true);
  addStages(ctx, c, 'atk', -1, true);
  assert.deepEqual([stage(c, 'def'), stage(c, 'atk')], [0, -1]);
});

test('싱크로: 상대에게 독을 받으면 같은 중첩을 되돌려 줌', () => {
  const ctx = newCtx();
  const a = fighter(7, null, ['toxic']), b = fighter(63, 'synchronize', ['confusion'], 'B');   // 독 타입은 독에 면역이라 꼬부기
  useStatusMove(ctx, a, b, { ...MOVES.toxic, accuracy: null }, 'toxic');
  assert.ok(b.status.poison > 0);
  assert.equal(a.status.poison, b.status.poison);
});

test('매직가드: 독·모래바람·반동은 받지 않고 피로는 받음', () => {
  const f = fighter(63, 'magic-guard', ['confusion']), foe = fighter(4, null, ['scratch'], 'B');
  f.status.poison = 5;
  const ctx = { ...newCtx('sand'), t: 1000 };
  tickDot(ctx, f, foe);
  assert.equal(f.hp, f.maxHp);
  const r = simulate(snap(63, 'magic-guard', ['take-down']), snap(4, null, ['scratch']), 1);
  assert.ok(!r.events.some((e) => e.type === 'recoil' && e.side === 'A'));
  ctx.t = 40000;
  tickDot(ctx, f, foe);
  assert.ok(f.hp < f.maxHp);   // 피로
});

test('의욕: 물리 ×1.5 / 대운: 급소 단계 +1 / 조가비갑옷: 급소 없음', () => {
  const a = fighter(175, 'hustle', ['pound']), b = fighter(4, null, ['scratch']);
  const plain = calcDamage(fighter(175, 'serene-grace', ['pound']), b, MOVES.pound).damage;
  assert.ok(Math.abs(calcDamage(a, b, MOVES.pound).damage - plain * 1.5) <= 1);
  const crits = (ability, defAbility) => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      n += simulate(snap(175, ability, ['pound']), snap(387, defAbility, ['tackle']), seed).events.filter((e) => e.type === 'hit' && e.side === 'A' && e.crit).length;
    }
    return n;
  };
  assert.ok(crits('super-luck', 'overgrow') > crits('serene-grace', 'overgrow'));
  assert.equal(crits('super-luck', 'shell-armor'), 0);
});

test('가속: 10초마다 스피드 +1, 만료 없음, 최대 2', () => {
  const ctx = newCtx();
  const f = fighter(255, 'speed-boost', ['ember']);
  for (ctx.t = 100; ctx.t <= 40000; ctx.t += 100) tickTimers(ctx, f);
  assert.equal(stage(f, 'spe'), 2);
});

test('두꺼운지방: 불꽃 ×0.5 / 아이스바디: 설경에서 1초마다 1% 회복', () => {
  const a = fighter(4, null, ['ember']);
  const fat = fighter(363, 'thick-fat', ['powder-snow']), plain = fighter(363, 'oblivious', ['powder-snow']);
  assert.ok(Math.abs(calcDamage(a, fat, MOVES.ember).damage - calcDamage(a, plain, MOVES.ember).damage * 0.5) <= 1);
  const ice = fighter(363, 'ice-body', ['powder-snow']);
  ice.hp = 100;
  tickDot({ ...newCtx('snow'), t: 1000 }, ice, a);
  assert.equal(ice.hp, 100 + Math.round(ice.maxHp * 0.01));
});

test('둔감: 도발을 받지 않음', () => {
  const ctx = newCtx();
  const f = fighter(363, 'oblivious', ['powder-snow'], 'B');
  useStatusMove(ctx, fighter(92, null, ['lick']), f, { ...MOVES.taunt, accuracy: null }, 'taunt');
  assert.equal(f.tauntUntil, 0);
});

test('모래날림: 전투 시작 시 모래바람 12초', () => {
  const r = simulate(snap(248, 'sand-stream', ['rock-throw']), snap(4, null, ['scratch']), 1);
  const w = r.events.find((e) => e.type === 'weather');
  assert.deepEqual([w.t, w.weather, w.until], [0, 'sand', 12000]);
  assert.ok(r.events.some((e) => e.type === 'dot' && e.source === 'sand' && e.side === 'B'));
});

test('독가시: 접촉 공격을 받으면 상대 독 3중첩 / 벌레의알림: HP 1/3 이하 벌레 ×1.5', () => {
  const r = simulate(snap(4, null, ['scratch']), snap(543, 'poison-point', ['poison-sting']), 1);
  const i = r.events.findIndex((e) => e.type === 'hit' && e.side === 'A');
  assert.deepEqual(r.events[i + 1], { t: r.events[i].t, side: 'A', type: 'status', status: 'poison', stacks: 3 });
  const a = fighter(543, 'swarm', ['bug-bite']), b = fighter(4, null, ['scratch']);
  const base = calcDamage(a, b, MOVES['bug-bite']).damage;
  a.hp = Math.floor(a.maxHp / 3);
  assert.ok(Math.abs(calcDamage(a, b, MOVES['bug-bite']).damage - base * 1.5) <= 1);
});
