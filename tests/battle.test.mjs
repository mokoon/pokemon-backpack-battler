// M1-2: 틱 루프, 충전, 피해 공식, 결정성
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter, calcDamage } from '../js/sim/battle.js';
import { MOVES } from '../js/data/moves.js';
import { generateBot } from '../js/game/bot.js';

const snap = (species, moves, ability = null, round = 1) => ({
  v: 1, species, ability, round,
  bags: [{ id: 'bag_base', x: 0, y: 0, rot: 0 }],
  items: moves.map((m, i) => ({ id: `move:${m}`, x: i, y: 0, rot: 0 })),
});
const fighter = (species, moves = ['tackle'], round = 1) => makeFighter('A', snap(species, moves, null, round));

test('최대 HP = (종족HP + 150) × 3.4 × (1 + 0.18(r−1))', () => {
  assert.equal(fighter(4, ['scratch']).maxHp, 643);          // (39 + 150) × 3.4 = 642.6
  assert.equal(fighter(4, ['scratch'], 6).maxHp, 1221);      // × 1.9
});

test('피해 손계산 1: 파이리 할퀴기 → 이상해씨 (자속 없음, 등배)', () => {
  // 24 × (52+50)/(57+50) × 1.2 = 27.45 → 27
  assert.equal(calcDamage(fighter(4, ['scratch']), fighter(1), MOVES.scratch).damage, 27);
});

test('피해 손계산 2: 파이리 불꽃세례 → 이상해씨 (자속 1.25, 효과 굉장 2배)', () => {
  // 31 × (60+50)/(57+50) × 1.25 × 2 × 1.2 = 95.61 → 96
  const r = calcDamage(fighter(4, ['scratch']), fighter(1), MOVES.ember);
  assert.equal(r.eff, 2);
  assert.equal(r.damage, 96);
});

test('피해 손계산 3: 꼬부기 몸통박치기 급소 → 파이리', () => {
  // 방어 (43+50)/2 = 46.5. 24 × (48+50)/(46.5+50) × 1.5 × 1.2 = 43.87 → 44
  assert.equal(calcDamage(fighter(7), fighter(4, ['scratch']), MOVES.tackle, { crit: true }).damage, 44);
});

test('피해 손계산 4: 무효 상성은 0 (전기 → 꼬마돌)', () => {
  const r = calcDamage(fighter(172, ['thunder-shock']), fighter(74), MOVES['thunder-shock']);
  assert.deepEqual(r, { damage: 0, eff: 0 });
});

test('같은 입력 100번 → 이벤트 로그 완전히 같음', () => {
  const a = snap(4, ['scratch', 'ember', 'growl']);
  const b = snap(7, ['tackle', 'water-gun']);
  const first = JSON.stringify(simulate(a, b, 42));
  for (let i = 0; i < 99; i++) assert.equal(JSON.stringify(simulate(a, b, 42)), first);
  assert.notEqual(JSON.stringify(simulate(a, b, 43)), first);   // 시드가 다르면 (급소 등) 달라짐
});

test('전투가 끝나고 승자가 정해짐', () => {
  const r = simulate(snap(4, ['scratch', 'ember']), snap(1, ['tackle']), 1);
  assert.ok(['A', 'B', 'draw'].includes(r.winner));
  assert.equal(r.events.at(-1).type, 'end');
  assert.ok(r.durationMs > 0 && r.durationMs <= 90000);
});

test('충전: 스피드 보정과 우선도 시작 충전', () => {
  // 파이리 스피드 65 → sqrt(165/180) = 0.9574. 할퀴기 쿨 2.8초 → 2.92초 → 3000ms 틱에 첫 발동
  const r = simulate(snap(4, ['scratch']), snap(74, ['tackle']), 1);
  assert.equal(r.events.find((e) => e.side === 'A' && e.type === 'use').t, 3000);
  // 꼬부기 아쿠아제트(우선도 +1, 쿨 4.2): 35% 충전에서 시작, 스피드 43 → sqrt(143/180) = 0.8913. 4.2 × 0.65 / 0.8913 = 3.06초 → 3100ms
  const q = simulate(snap(7, ['aqua-jet']), snap(74, ['tackle']), 1);
  assert.equal(q.events.find((e) => e.side === 'A' && e.type === 'use').t, 3100);
});

test('같은 틱, 같은 스피드, 같은 위치면 A 먼저', () => {
  const r = simulate(snap(4, ['scratch']), snap(4, ['scratch']), 1);
  const uses = r.events.filter((e) => e.type === 'use');
  assert.equal(uses[0].t, uses[1].t);
  assert.deepEqual([uses[0].side, uses[1].side], ['A', 'B']);
});

test('기술이 없으면 발버둥 + 반동 25%', () => {
  const none = { ...snap(4, []), items: [] };
  const r = simulate(none, snap(74, ['tackle']), 1);
  const recoil = r.events.find((e) => e.type === 'recoil');
  assert.equal(recoil.damage, Math.round(643 * 0.25));
});

test('같은 틱에 쓰러지면 그 틱의 남은 기술은 발동하지 않음 (§11.2)', () => {
  // 봇 가방 맞대결 중, 수정 전에는 쓰러진 틱에 기술이 더 나가던 경우 (시드 11: 오물웨이브로 쓰러뜨린 뒤 도둑질)
  const check = (a, b, seed) => {
    const r = simulate(a, b, seed);
    const koAt = r.events.findIndex((e) => typeof e.hp === 'number' && e.hp <= 0);
    const t = r.events[koAt].t;
    return !r.events.slice(koAt + 1).some((e) => e.t === t && e.type === 'use');
  };
  assert.ok(check(generateBot(11, 3).snapshot, generateBot(1011, 3).snapshot, 11));
  for (let s = 0; s < 30; s++) assert.ok(check(generateBot(s, 3).snapshot, generateBot(s + 1000, 3).snapshot, s), `seed ${s}`);
});
