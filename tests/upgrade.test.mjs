// 강화 (§10.3): 같은 지닌 도구 3개 → 도구+ (효과 ×2), 가진 기술을 상점에서 또 사면 +1 (최대 +3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, choosePokemon, chooseAbility, buy, sell, toSnapshot } from '../js/game/run.js';
import { add } from '../js/game/bag.js';
import { sellPrice, priceOf } from '../js/game/shop.js';
import { validateSnapshot } from '../js/sim/snapshot.js';
import { makeFighter, calcDamage } from '../js/sim/battle.js';
import { MOVES } from '../js/data/moves.js';
import { UPGRADE } from '../js/config.js';

const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function charmander() {
  let run = { ...createRun(1), candidates: [4] };
  run = ok(choosePokemon(run, 4)).run;
  return { ...ok(chooseAbility(run, 'blaze')).run, gold: 99 };
}
const withShop = (run, ids) => ({ ...run, shop: { ...run.shop, slots: [...ids.map((id) => ({ id, price: priceOf(id), locked: false })), null, null, null, null].slice(0, 5) } });
const owned = (run, id) => [...run.board.items, ...run.board.storage.filter(Boolean)].filter((t) => t.id === id);

test('가진 기술을 사면 +1 강화, 최대 +3', () => {
  let run = charmander();   // 시작 기술 불꽃세례
  for (let lv = 1; lv <= UPGRADE.moveMaxLv; lv++) {
    const r = ok(buy(withShop(run, ['move:ember']), 0, { to: 'upgrade' }));
    assert.deepEqual(r.note, { upgraded: 'move:ember', lv });
    run = r.run;
    assert.equal(owned(run, 'move:ember')[0].lv, lv);
    assert.equal(owned(run, 'move:ember').length, 1);
  }
  assert.equal(run.gold, 99 - 3 * priceOf('move:ember'));
  assert.equal(buy(withShop(run, ['move:ember']), 0, { to: 'upgrade' }).ok, false);
  assert.deepEqual(validateSnapshot(toSnapshot(run)), []);
  assert.equal(toSnapshot(run).items[0].lv, 3);
});

test('강화한 공격기: 1회 위력 +20%씩 / 변화기: 충전 속도 +15%씩', () => {
  const snap = (moves) => ({ v: 1, species: 4, ability: null, round: 1, bags: [{ id: 'bag_base', x: 0, y: 0, rot: 0 }], items: moves });
  const a0 = makeFighter('A', snap([{ id: 'move:ember', x: 0, y: 0, rot: 0 }]));
  const a2 = makeFighter('A', snap([{ id: 'move:ember', x: 0, y: 0, rot: 0, lv: 2 }]));
  assert.equal(a2.moves[0].move.power1, Math.round(MOVES.ember.power1 * 1.4));
  const b = makeFighter('B', snap([{ id: 'move:scratch', x: 0, y: 0, rot: 0 }]));
  assert.ok(calcDamage(a2, b, a2.moves[0].move).damage > calcDamage(a0, b, a0.moves[0].move).damage);
  const s0 = makeFighter('A', snap([{ id: 'move:growl', x: 0, y: 0, rot: 0 }]));
  const s1 = makeFighter('A', snap([{ id: 'move:growl', x: 0, y: 0, rot: 0, lv: 1 }]));
  assert.equal(s1.moves[0].coolMs, Math.round(s0.moves[0].coolMs / 1.15));
  assert.equal(validateSnapshot(snap([{ id: 'move:ember', x: 0, y: 0, rot: 0, lv: 4 }])).length, 1);
  assert.equal(validateSnapshot(snap([{ id: 'item:charcoal', x: 0, y: 0, rot: 0, lv: 2 }])).length, 1);
});

test('같은 지닌 도구 3개 → 도구+ 하나 (보관함 것부터 없앰), 판매가는 3개 값', () => {
  let run = charmander();
  run = { ...run, board: add(run.board, 'item:charcoal', { to: 'storage', slot: 0 }).board };
  run = { ...run, board: add(run.board, 'item:charcoal', { to: 'board', x: 4, y: 2, rot: 0 }).board };
  const r = ok(buy(withShop(run, ['item:charcoal']), 0, { to: 'board', x: 5, y: 2, rot: 0 }));
  assert.deepEqual(r.note, { merged: 'item:charcoal' });
  const left = owned(r.run, 'item:charcoal');
  assert.equal(left.length, 1);
  assert.equal(left[0].lv, 1);
  assert.equal(r.run.board.storage[0], null);                 // 보관함 것이 없어짐
  assert.ok(r.run.board.items.includes(left[0]));             // 가방 위에 남음
  assert.equal(sellPrice('item:charcoal', null, null, 1), Math.floor(priceOf('item:charcoal') * 3 / 2));
  assert.equal(ok(sell(r.run, left[0].uid)).run.gold, r.run.gold + Math.floor(priceOf('item:charcoal') * 3 / 2));
  // 2개까지는 합치지 않음
  const two = ok(buy(withShop(charmander(), ['item:charcoal']), 0, { to: 'board', x: 4, y: 2, rot: 0 }));
  assert.equal(two.note, null);
});

test('도구+ 효과 ×2: 목탄+ 인접 피해 보너스, 자뭉열매+ 두 번 발동', () => {
  const snap = (lv) => ({
    v: 1, species: 4, ability: null, round: 1, bags: [{ id: 'bag_base', x: 0, y: 0, rot: 0 }],
    items: [{ id: 'move:ember', x: 0, y: 0, rot: 0 }, { id: 'item:charcoal', x: 1, y: 0, rot: 0, lv }, { id: 'item:sitrus-berry', x: 0, y: 1, rot: 0, lv }],
  });
  const f0 = makeFighter('A', snap(0)), f1 = makeFighter('A', snap(1));
  assert.ok(Math.abs(f1.moves[0].dmgBonus - 2 * f0.moves[0].dmgBonus) < 1e-9);
  assert.equal(f1.once.find((o) => o.id === 'sitrus-berry').uses, 2);
});
