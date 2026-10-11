// M1-5: MVP 도구 효과 (§10.2), 타입 가방, 나무열매 바구니 (§4.3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, makeFighter, calcDamage } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { validateSnapshot } from '../js/sim/snapshot.js';
import { addStatus, addStages, stage, tickDot, checkHpBerries } from '../js/sim/effects.js';
import { MOVES } from '../js/data/moves.js';

// 보드 9×6을 3×3 가방 6개로 채운다
const FULL = [[0, 0], [3, 0], [6, 0], [0, 3], [3, 3], [6, 3]].map(([x, y]) => ({ id: 'bag_base', x, y, rot: 0 }));
const snap = (species, items, bags = FULL) => ({
  v: 1, species, ability: null, round: 1, bags,
  items: items.map(([id, x, y, rot = 0]) => ({ id, x, y, rot })),
});
const fighter = (species, items, bags) => {
  const s = snap(species, items, bags);
  assert.deepEqual(validateSnapshot(s), []);
  return makeFighter('A', s);
};
const slot = (f, id) => f.moves.find((m) => m.id === id);
const newCtx = () => ({ t: 0, rng: createRng(1), events: [], weather: null });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('타입 강화 도구: 인접한 그 타입 기술만 +20%, 여러 개는 그대로 더함', () => {
  const f = fighter(4, [['move:ember', 0, 0], ['item:charcoal', 1, 0], ['item:charcoal', 0, 1], ['move:scratch', 4, 0], ['item:charcoal', 5, 0]]);
  assert.ok(near(slot(f, 'ember').dmgBonus, 0.4));
  assert.equal(slot(f, 'scratch').dmgBonus, 0);           // 노말 기술이라 목탄 효과 없음
});

test('전체 효과 도구는 겹칠수록 덜 오름: 달인의띠 4개 = +56%', () => {
  const items = [['move:ember', 0, 0], ...[0, 1, 2, 3].map((i) => ['item:expert-belt', 3 + i, 0])];
  assert.ok(near(fighter(4, items).item.expertBelt, 0.56));
});

test('생명의구슬: 공격기 +20%, 사용마다 최대 HP 2% 잃음', () => {
  const f = fighter(4, [['move:ember', 0, 0], ['item:life-orb', 3, 0]]);
  assert.ok(near(slot(f, 'ember').dmgBonus, 0.2));
  const r = simulate(snap(4, [['move:ember', 0, 0], ['item:life-orb', 3, 0]]), snap(1, [['move:tackle', 0, 0]]), 1);
  const cost = r.events.find((e) => e.type === 'recoil' && e.move === 'life-orb');
  assert.equal(cost.damage, Math.round(f.maxHp * 0.02));
});

test('구애머리띠: 인접 물리 +40%, 인접하지 않은 공격기 충전 −20%', () => {
  const f = fighter(4, [['move:scratch', 0, 0], ['item:choice-band', 1, 0], ['move:ember', 4, 0]]);
  assert.ok(near(slot(f, 'scratch').dmgBonus, 0.4));
  assert.ok(near(slot(f, 'ember').chargeBonus, -0.2));
});

test('구애스카프: 인접 기술 충전 +30%, 인접하지 않은 기술 피해 −10%', () => {
  const f = fighter(4, [['move:scratch', 0, 0], ['item:choice-scarf', 1, 0], ['move:ember', 4, 0]]);
  assert.ok(near(slot(f, 'scratch').chargeBonus, 0.3));
  assert.ok(near(slot(f, 'ember').dmgBonus, -0.1));
});

test('광각렌즈 +10%p, 초점렌즈 급소 +1단계, 선제공격손톱 시작 충전 +30%', () => {
  const f = fighter(4, [['move:scratch', 1, 1], ['item:wide-lens', 0, 1], ['item:scope-lens', 2, 1], ['item:quick-claw', 1, 0]]);
  const s = slot(f, 'scratch');
  assert.deepEqual([s.accBonus, s.critBonus], [10, 1]);
  assert.ok(near(s.charge, 0.3));
});

test('타입 가방: 모든 칸이 그 가방 위인 같은 타입 기술 충전 +10%', () => {
  const bags = [{ id: 'bag_type_fire', x: 0, y: 0, rot: 0 }, { id: 'bag_base', x: 3, y: 0, rot: 0 }];
  const f = fighter(4, [['move:ember', 0, 0], ['move:scratch', 1, 0], ['move:flamethrower', 3, 0]], bags);
  assert.ok(near(slot(f, 'ember').chargeBonus, 0.1));
  assert.equal(slot(f, 'scratch').chargeBonus, 0);         // 노말 기술
  assert.equal(slot(f, 'flamethrower').chargeBonus, 0);    // 다른 가방 위
});

test('진화의휘석: 더 진화할 수 있으면 받는 피해 −33% (2단계 남으면 −45%), 2개는 곱해서 덜 오름', () => {
  assert.ok(near(fighter(5, [['item:eviolite', 0, 0]]).item.allTaken, 0.67));
  assert.ok(near(fighter(5, [['item:eviolite', 0, 0], ['item:eviolite', 0, 1]]).item.allTaken, 0.67 * (1 - 0.33 * 0.8)));
  assert.ok(near(fighter(4, [['item:eviolite', 0, 0]]).item.allTaken, 0.55));   // 파이리: 진화 2단계 남음
  assert.equal(fighter(6, [['item:eviolite', 0, 0]]).item.allTaken, 1);   // 리자몽은 최종 진화
});

test('돌격조끼: 받는 특수 피해 −20%, 변화기 쿨타임 +50%', () => {
  const f = fighter(7, [['item:assault-vest', 0, 0], ['move:protect', 0, 1], ['move:tackle', 3, 0]]);
  const atk = fighter(4, [['move:ember', 0, 0]]);
  const plain = fighter(7, [['move:tackle', 0, 0]]);
  assert.ok(Math.abs(calcDamage(atk, f, MOVES.ember).damage - calcDamage(atk, plain, MOVES.ember).damage * 0.8) <= 1);
  assert.equal(calcDamage(atk, f, MOVES.scratch).damage, calcDamage(atk, plain, MOVES.scratch).damage);
  assert.equal(slot(f, 'protect').coolMs, 9000);
});

test('기합의띠: HP 50% 이상에서 쓰러질 피해 → 1 남김, 전투당 1번', () => {
  // 망나뇽 역린(L4: (0,0)(0,1)(0,2)(1,2)) + 인접 구애머리띠 2개, 용의이빨 → 피츄(HP 450) 한 방. 피츄 + 기합의띠 2개
  const dragonite = [['move:outrage', 0, 0], ['item:choice-band', 1, 0], ['item:choice-band', 1, 1], ['item:dragon-fang', 0, 3]];
  const r = simulate(snap(149, dragonite), snap(172, [['move:thunder-shock', 0, 0], ['item:focus-sash', 1, 0], ['item:focus-sash', 2, 0]]), 1);
  assert.equal(r.events.filter((e) => e.type === 'item' && e.item === 'focus-sash').length, 1);
  const i = r.events.findIndex((e) => e.type === 'item' && e.item === 'focus-sash');
  assert.deepEqual([r.events[i + 1].type, r.events[i + 1].hp], ['hit', 1]);   // 띠 이벤트 바로 뒤 명중 이벤트
  assert.equal(r.winner, 'A');
});

test('자뭉열매 2개: 50% 이하가 될 때마다 하나씩 차례로 발동', () => {
  const ctx = newCtx();
  const f = fighter(1, [['item:sitrus-berry', 0, 0], ['item:sitrus-berry', 1, 0]]);
  const heals = () => ctx.events.filter((e) => e.type === 'heal' && e.source === 'sitrus-berry').length;
  f.hp = Math.floor(f.maxHp * 0.4);
  checkHpBerries(ctx, f);
  assert.equal(heals(), 1);
  checkHpBerries(ctx, f);                // 회복 뒤에도 50% 이하로 새로 내려가지 않으면 그대로
  assert.equal(heals(), 1);
  f.hp = f.maxHp;
  checkHpBerries(ctx, f);
  f.hp = Math.floor(f.maxHp * 0.3);
  checkHpBerries(ctx, f);
  assert.equal(heals(), 2);
});

test('나무열매 바구니 안의 열매는 발동 +1', () => {
  const bags = [{ id: 'bag_berry', x: 0, y: 0, rot: 0 }, { id: 'bag_base', x: 1, y: 0, rot: 0 }];
  const f = fighter(1, [['item:oran-berry', 0, 0], ['item:oran-berry', 1, 0]], bags);
  assert.deepEqual(f.once.map((o) => o.uses), [2, 1]);
});

test('핀치 열매: HP 25% 이하에서 능력 +1단계', () => {
  const ctx = newCtx();
  const f = fighter(4, [['item:liechi-berry', 0, 0], ['item:salac-berry', 1, 0]]);
  f.hp = Math.floor(f.maxHp * 0.2);
  checkHpBerries(ctx, f);
  assert.deepEqual([stage(f, 'atk'), stage(f, 'spe')], [1, 1]);
});

test('리샘열매: 아무 상태이상이 3중첩 이상 → 모두 제거, 1회', () => {
  const ctx = newCtx();
  const f = fighter(1, [['item:lum-berry', 0, 0]]);
  addStatus(ctx, f, 'paralysis', 2);
  assert.equal(f.status.paralysis, 2);
  addStatus(ctx, f, 'burn', 3);
  assert.deepEqual([f.status.paralysis, f.status.burn], [0, 0]);
  addStatus(ctx, f, 'burn', 3);
  assert.equal(f.status.burn, 3);
});

test('리샘열매는 버섯포자 10중첩으로 잠들기 전에 발동', () => {
  const ctx = newCtx();
  const f = fighter(4, [['item:lum-berry', 0, 0]]);
  addStatus(ctx, f, 'drowsy', 10);
  assert.equal(f.haltUntil, 0);
});

test('하양허브: 능력 하락이 걸리면 즉시 모두 제거, 1회', () => {
  const ctx = newCtx();
  const f = fighter(4, [['item:white-herb', 0, 0]]);
  addStages(ctx, f, 'atk', 2);
  addStages(ctx, f, 'def', -1);
  assert.deepEqual([stage(f, 'atk'), stage(f, 'def')], [2, 0]);
  addStages(ctx, f, 'def', -1);
  assert.equal(stage(f, 'def'), -1);
});

test('먹다남은음식 0.7%/초 회복, 검은오물은 독 타입만 회복', () => {
  const ctx = { ...newCtx(), t: 1000 };
  const f = fighter(4, [['item:leftovers', 0, 0]]);
  f.hp = 100;
  tickDot(ctx, f, fighter(1, []));
  assert.equal(f.hp, 100 + Math.round(f.maxHp * 0.007));
  const p = fighter(92, [['item:black-sludge', 0, 0]]), n = fighter(4, [['item:black-sludge', 0, 0]]);
  p.hp = 100;
  tickDot(ctx, p, f);
  tickDot(ctx, n, f);
  assert.equal(p.hp, 100 + Math.round(p.maxHp * 0.01));
  assert.equal(n.hp, n.maxHp - Math.round(n.maxHp * 0.007));
});

test('은밀망토: 10만볼트 마비 중첩을 받지 않음', () => {
  const r = simulate(snap(172, [['move:thunderbolt', 0, 0]]), snap(4, [['move:scratch', 0, 0], ['item:covert-cloak', 1, 0]]), 3);
  assert.ok(r.events.some((e) => e.type === 'hit' && e.side === 'A'));
  assert.ok(!r.events.some((e) => e.type === 'status' && e.side === 'B'));
});

test('반감 열매: 그 타입 효과가 굉장한 공격 3회까지 −50%', () => {
  const r = simulate(snap(7, [['move:water-gun', 0, 0]]), snap(4, [['move:scratch', 0, 0], ['item:passho-berry', 1, 0]]), 1);
  const hits = r.events.filter((e) => e.type === 'hit' && e.side === 'A' && !e.crit);
  assert.equal(r.events.filter((e) => e.type === 'item' && e.item === 'passho-berry').length, 3);
  assert.ok(Math.abs(hits[0].damage - hits[3].damage / 2) <= 1);
});

test('울퉁불퉁멧: 접촉 기술 피해의 15% 반사, 조개껍질방울: 준 피해의 8% 회복', () => {
  const r = simulate(snap(4, [['move:scratch', 0, 0], ['item:shell-bell', 1, 0]]), snap(74, [['move:tackle', 0, 0], ['item:rocky-helmet', 1, 0]]), 1);
  const hit = r.events.find((e) => e.type === 'hit' && e.side === 'A');
  const i = r.events.indexOf(hit);
  assert.deepEqual(r.events[i + 1], { t: hit.t, side: 'A', type: 'recoil', move: 'rocky-helmet', damage: Math.max(1, Math.round(hit.damage * 0.15)), hp: r.events[i + 1].hp });
  assert.ok(r.events.some((e) => e.type === 'heal' && e.source === 'shell-bell'));
});

test('빛의점토: 벽 6초 → 9초', () => {
  const r = simulate(snap(7, [['move:reflect', 0, 0], ['item:light-clay', 3, 0]]), snap(4, [['move:scratch', 0, 0]]), 1);
  const e = r.events.find((x) => x.type === 'screen');
  assert.equal(e.until - e.t, 9000);
});

test('결정성: 도구가 많은 전투도 같은 시드면 같은 로그', () => {
  const a = snap(4, [['move:ember', 0, 0], ['item:charcoal', 1, 0], ['item:life-orb', 3, 0], ['item:sitrus-berry', 0, 1], ['item:focus-sash', 6, 0]]);
  const b = snap(7, [['move:water-gun', 0, 0], ['item:leftovers', 3, 0], ['item:rocky-helmet', 6, 0], ['item:occa-berry', 0, 1]]);
  const first = JSON.stringify(simulate(a, b, 7));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(simulate(a, b, 7)), first);
});
