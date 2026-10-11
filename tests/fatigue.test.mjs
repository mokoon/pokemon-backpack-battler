// M1-4: 피로와 시간 제한 (§11.3), 무승부
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { tickDot, heal } from '../js/sim/effects.js';

const snap = (species, moves) => ({
  v: 1, species, ability: null, round: 1,
  bags: [{ id: 'bag_base', x: 0, y: 0, rot: 0 }],
  items: moves.map((m, i) => ({ id: `move:${m}`, x: i, y: 0, rot: 0 })),
});

test('피로: 30초까지 없음, 그 뒤 1초마다 최대 HP × 1% × (경과초 − 30)', () => {
  const ctx = { t: 0, rng: createRng(1), events: [], weather: null };
  const f = makeFighter('A', snap(4, ['scratch'])), foe = makeFighter('B', snap(1, ['tackle']));
  for (const sec of [30, 31, 35]) {
    ctx.t = sec * 1000;
    tickDot(ctx, f, foe);
  }
  assert.deepEqual(ctx.events.map((e) => [e.source, e.damage]), [
    ['fatigue', Math.round(f.maxHp * 0.01)],
    ['fatigue', Math.round(f.maxHp * 0.05)],
  ]);
});

test('피로는 받는 피해 감소와 대타출동을 무시한다', () => {
  const ctx = { t: 32000, rng: createRng(1), events: [], weather: null };
  const f = makeFighter('A', snap(7, ['tackle'])), foe = makeFighter('B', snap(1, ['tackle']));
  f.subHp = 999;
  f.reflectUntil = f.lightScreenUntil = 99999;
  tickDot(ctx, f, foe);
  assert.equal(f.hp, f.maxHp - Math.round(f.maxHp * 0.02));
});

test('30초 이후 회복량은 절반', () => {
  const ctx = { t: 10000, rng: createRng(1), events: [], weather: null };
  const f = makeFighter('A', snap(1, ['tackle']));
  f.hp = 1;
  heal(ctx, f, 100, 'test');
  ctx.t = 31000;
  heal(ctx, f, 100, 'test');
  assert.equal(f.hp, 1 + 100 + 50);
});

test('서로 공격이 안 통하는 교착(고스트 vs 노말)은 피로로 끝나고, 같은 틱에 둘 다 쓰러지면 무승부', () => {
  // 1 + 2 + … + 14 = 105% → 44초에 양쪽 동시에 쓰러짐
  const r = simulate(snap(92, ['lick']), snap(440, ['pound']), 1);
  assert.ok(r.events.filter((e) => e.type === 'hit').every((e) => e.damage === 0));
  assert.equal(r.winner, 'draw');
  assert.equal(r.durationMs, 44000);
  assert.deepEqual(r.events.at(-1), { t: 44000, type: 'end', winner: 'draw', reason: 'ko' });
});

test('모든 전투는 90초 안에 끝난다', () => {
  for (let seed = 0; seed < 50; seed++) {
    const r = simulate(snap(440, ['pound']), snap(374, ['take-down']), seed);
    assert.ok(r.durationMs <= 90000);
    assert.ok(['A', 'B', 'draw'].includes(r.winner));
  }
});
