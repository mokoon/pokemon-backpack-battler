// M1-6: 개발 초기 10개 계통의 특성 26개 (§13.3, §13.4)
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter, calcDamage, effectiveness } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { addStatus, addStages, stage, tickTimers, tickDot, checkHpBerries, accuracyMod, useStatusMove } from '../js/sim/effects.js';
import { ABILITIES, battleAbility } from '../js/rules/abilities.js';
import { MOVES } from '../js/data/moves.js';
import { POKEMON } from '../js/data/pokemon.js';
import { STARTER_POOL } from '../js/config.js';

const FULL = [[0, 0], [3, 0], [6, 0], [0, 3], [3, 3], [6, 3]].map(([x, y]) => ({ id: 'bag_base', x, y, rot: 0 }));
const snap = (species, ability, items) => ({
  v: 1, species, ability, round: 1, bags: FULL,
  items: items.map((it) => (typeof it === 'string' ? [`move:${it}`, 0, 0] : it)).map(([id, x, y]) => ({ id, x, y, rot: 0 })),
});
const fighter = (species, ability, items = [], side = 'A') => makeFighter(side, snap(species, ability, items));
const newCtx = (weather = null) => ({ t: 0, rng: createRng(1), events: [], weather: weather && { type: weather, until: 1e9 } });
const ratio = (a, b) => a / b;

test('10개 계통의 특성 26개가 모두 구현 상태 (todo 없음)', () => {
  const chains = new Set(STARTER_POOL.slice(0, 10).map((s) => POKEMON[s].chain));   // 개발 초기 10개 계통
  const ids = new Set(Object.values(POKEMON).filter((p) => chains.has(p.chain)).flatMap((p) => p.abilities.map((a) => a.id)));
  assert.equal(ids.size, 26);
  for (const id of ids) assert.ok(ABILITIES[id], `${id} 미구현`);
  assert.equal(battleAbility('healer'), null);          // economy는 전투 효과 없음
  assert.equal(battleAbility('intimidate'), null);      // todo
});

test('맹화: HP 1/3 이하에서 불꽃 기술 ×1.5', () => {
  const a = fighter(4, 'blaze', ['scratch']), b = fighter(1, null);
  const base = calcDamage(a, b, MOVES.ember).damage;
  a.hp = Math.floor(a.maxHp / 3);
  assert.ok(Math.abs(calcDamage(a, b, MOVES.ember).damage - base * 1.5) <= 1);
  assert.equal(calcDamage(a, b, MOVES.scratch).damage, calcDamage(fighter(4, null, ['scratch']), b, MOVES.scratch).damage);
});

test('선파워: 쾌청에서 특수 ×1.5, 1초마다 최대 HP 1% 잃음', () => {
  const ctx = newCtx('sun');
  const a = fighter(4, 'solar-power', ['scratch']), b = fighter(1, null);
  const plain = calcDamage(a, b, MOVES.ember, { ctx: newCtx() }).damage;
  assert.ok(Math.abs(calcDamage(a, b, MOVES.ember, { ctx }).damage / (plain * 1.5 * 1.3) - 1) < 0.02);   // 반올림 오차
  ctx.t = 1000;
  tickDot(ctx, a, b);
  assert.equal(a.maxHp - a.hp, Math.round(a.maxHp * 0.01));
});

test('젖은접시: 비에서 1초마다 1% 회복', () => {
  const ctx = { ...newCtx('rain'), t: 1000 };
  const f = fighter(7, 'rain-dish', ['tackle']);
  f.hp = 100;
  tickDot(ctx, f, fighter(4, null, ['scratch']));
  assert.equal(f.hp, 100 + Math.round(f.maxHp * 0.01));
});

test('엽록소: 쾌청에서 충전 +50%', () => {
  const uses = (ability) => simulate(snap(1, ability, [['move:sunny-day', 0, 0], ['move:tackle', 3, 0]]), snap(74, null, ['tackle']), 1)
    .events.filter((e) => e.type === 'use' && e.side === 'A' && e.move === 'tackle' && e.t < 16000).length;
  assert.ok(uses('chlorophyll') > uses('overgrow'));
});

test('정전기: 접촉 공격을 받으면 상대 마비 3중첩', () => {
  const r = simulate(snap(4, null, ['scratch']), snap(172, 'static', ['thunder-shock']), 1);
  const i = r.events.findIndex((e) => e.type === 'hit' && e.side === 'A');
  assert.deepEqual(r.events[i + 1], { t: r.events[i].t, side: 'A', type: 'status', status: 'paralysis', stacks: 3 });
});

test('피뢰침: 전기 무효, 맞으면 특공 +1 / 부유: 땅 무효', () => {
  const r = simulate(snap(172, null, ['thunder-shock']), snap(172, 'lightning-rod', ['charm']), 1);
  const hit = r.events.find((e) => e.type === 'hit' && e.side === 'A');
  assert.deepEqual([hit.damage, hit.eff], [0, 0]);
  assert.ok(r.events.some((e) => e.type === 'stage' && e.side === 'B' && e.stat === 'spa' && e.stage === 1));
  assert.equal(effectiveness(fighter(92, 'levitate'), MOVES.earthquake), 0);
  assert.equal(effectiveness(fighter(94, 'cursed-body'), MOVES.earthquake), 2);
});

test('저주받은바디: 공격을 받으면 그 기술 충전량 −10%p', () => {
  // 파이리 불꽃세례: 쿨 3.6초, 충전 속도 0.9405 → 틱당 0.0261. 1.0 → 39틱, 1.1 → 43틱 (0.4초 늦어짐)
  const gap = (species, ability) => {
    const uses = simulate(snap(4, null, ['ember']), snap(species, ability, []), 1).events   // B는 발버둥만 (마비 등 영향 없음)
      .filter((e) => e.type === 'use' && e.side === 'A').map((e) => e.t);
    return uses[1] - uses[0];
  };
  assert.equal(gap(94, 'cursed-body') - gap(93, 'levitate'), 400);
});

test('근성: 상태이상이면 물리 ×1.35, 화상 감소 무시', () => {
  const a = fighter(66, 'guts', ['karate-chop']), b = fighter(1, null);
  const base = calcDamage(a, b, MOVES['karate-chop']).damage;
  addStatus(newCtx(), a, 'burn', 1);
  assert.ok(Math.abs(calcDamage(a, b, MOVES['karate-chop']).damage - base * 1.35) <= 1);
});

test('노가드: 내 기술만 반드시 명중 (폭발펀치 명중 50), 상대 기술은 그대로', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = simulate(snap(66, 'no-guard', ['dynamic-punch']), snap(4, null, ['scratch']), seed);
    assert.ok(!r.events.some((e) => e.type === 'miss' && e.side === 'A'));
  }
  const opp = [];
  for (let seed = 1; seed <= 10; seed++) opp.push(...simulate(snap(66, null, ['dynamic-punch']), snap(66, 'no-guard', ['karate-chop']), seed).events.filter((e) => e.type === 'miss' && e.side === 'A'));
  assert.ok(opp.length > 0);        // 상대가 노가드여도 내 폭발펀치는 빗나갈 수 있음
});

test('불굴의마음: 풀죽음을 받으면 스피드 +1 / 정신력: 풀죽음 무효', () => {
  const r = simulate(snap(7, null, ['bite']), snap(66, 'steadfast', ['karate-chop']), 1);
  assert.ok(r.events.some((e) => e.type === 'stage' && e.side === 'B' && e.stat === 'spe'));
  const s = simulate(snap(7, null, ['bite']), snap(149, 'inner-focus', ['wrap']), 1);
  assert.ok(!s.events.some((e) => e.type === 'flinch'));
});

test('돌머리: 반동기 반동 없음', () => {
  const recoil = (ability) => simulate(snap(74, ability, ['take-down']), snap(4, null, ['scratch']), 1)
    .events.filter((e) => e.type === 'recoil' && e.side === 'A').length;
  assert.equal(recoil('rock-head'), 0);
  assert.ok(recoil('sand-veil') > 0);
});

test('옹골참: HP 가득에서 쓰러질 피해 → 1 남김, 전투당 1번', () => {
  // 알통몬 인파이트 + 인접 구애머리띠 2개, 검은띠 → 꼬마돌(HP 570) 한 방
  const machop = [['move:close-combat', 0, 0], ['item:choice-band', 1, 0], ['item:choice-band', 1, 1], ['item:black-belt', 0, 3]];
  const r = simulate(snap(66, 'guts', machop), snap(74, 'sturdy', ['tackle']), 1);
  const i = r.events.findIndex((e) => e.type === 'ability' && e.ability === 'sturdy');
  assert.ok(i > 0);
  assert.deepEqual([r.events[i + 1].type, r.events[i + 1].hp], ['hit', 1]);
  assert.equal(r.events.filter((e) => e.type === 'ability' && e.ability === 'sturdy').length, 1);
});

test('모래숨기: 모래바람에서 상대 명중 −20%p, 모래바람 피해 무효', () => {
  const ctx = newCtx('sand');
  const a = fighter(4, null, ['scratch']), b = fighter(74, 'sand-veil', ['tackle']);
  assert.equal(accuracyMod(ctx, a, b), -20);
  assert.equal(accuracyMod(newCtx(), a, b), 0);
  const c = fighter(4, null, ['scratch']);
  c.ability = 'sand-veil';                  // 피해 무효 확인용 (원래 파이리 특성은 아님)
  ctx.t = 1000;
  tickDot(ctx, c, a);
  assert.equal(c.hp, c.maxHp);
});

test('탈피: 2초마다 가장 많이 쌓인 상태이상 −2', () => {
  const ctx = newCtx();
  const f = fighter(147, 'shed-skin', ['wrap']);
  addStatus(ctx, f, 'poison', 3);
  addStatus(ctx, f, 'burn', 5);
  ctx.t = 2000;
  tickTimers(ctx, f);                        // 화상 자연 감소 5 → 4, 탈피 4 → 2
  assert.deepEqual([f.status.burn, f.status.poison], [2, 3]);
});

test('이상한비늘: 상태이상이면 받는 물리 ×0.67 / 멀티스케일: HP 가득이면 받는 피해 −50%', () => {
  const a = fighter(4, null, ['scratch']);
  const d = fighter(147, 'marvel-scale', ['wrap']);
  const base = calcDamage(a, d, MOVES.slash).damage;
  addStatus(newCtx(), d, 'poison', 1);
  assert.ok(Math.abs(calcDamage(a, d, MOVES.slash).damage - base * 0.67) <= 1);
  const m = fighter(149, 'multiscale', ['wrap']);
  const full = calcDamage(a, m, MOVES.slash).damage;
  m.hp -= 1;
  assert.ok(Math.abs(full - calcDamage(a, m, MOVES.slash).damage * 0.5) <= 1);
});

test('자연회복: HP 50% 이하가 처음 됐을 때 모든 상태이상 제거, 1회', () => {
  const ctx = newCtx();
  const f = fighter(440, 'natural-cure', ['pound']);
  addStatus(ctx, f, 'burn', 4);
  f.hp = Math.floor(f.maxHp * 0.4);
  checkHpBerries(ctx, f);
  assert.equal(f.status.burn, 0);
  addStatus(ctx, f, 'burn', 4);
  f.hp = f.maxHp;
  checkHpBerries(ctx, f);
  f.hp = 10;
  checkHpBerries(ctx, f);
  assert.equal(f.status.burn, 4);
});

test('하늘의은총: 추가 효과 상태이상 중첩 ×2', () => {
  const r = simulate(snap(113, 'serene-grace', ['thunderbolt']), snap(4, null, ['scratch']), 3);
  const i = r.events.findIndex((e) => e.type === 'hit' && e.side === 'A');
  assert.equal(r.events[i + 1].stacks, 4);
});

test('클리어바디: 상대가 거는 능력 하락 무효, 자기 하락은 그대로', () => {
  const ctx = newCtx();
  const a = fighter(4, null, ['scratch']), b = fighter(374, 'clear-body', ['take-down']);
  useStatusMove(ctx, a, b, MOVES.growl, 'growl');
  assert.equal(stage(b, 'atk'), 0);
  addStages(ctx, b, 'atk', -1);
  assert.equal(stage(b, 'atk'), -1);
});
