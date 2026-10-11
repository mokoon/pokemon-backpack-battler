// 영양제 (§10.4): 사면 바로 그 종족값 +VITAMIN.amount, 능력치마다 최대 VITAMIN.max번
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, choosePokemon, chooseAbility, buy, toSnapshot, evolutions, recordBattle } from '../js/game/run.js';
import { priceOf, createShop, rollShop } from '../js/game/shop.js';
import { createBoard } from '../js/game/bag.js';
import { validateSnapshot } from '../js/sim/snapshot.js';
import { makeFighter } from '../js/sim/battle.js';
import { createRng } from '../js/sim/rng.js';
import { ITEM_RULES } from '../js/rules/items.js';
import { ITEMS } from '../js/data/items.js';
import { STARTER_POOL, VITAMIN } from '../js/config.js';

const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function charmander() {
  let run = { ...createRun(1), candidates: [4] };
  run = ok(choosePokemon(run, 4)).run;
  return { ...ok(chooseAbility(run, 'blaze')).run, gold: 99 };
}
const withShop = (run, id) => ({ ...run, shop: { ...run.shop, slots: [{ id, price: priceOf(id), locked: false }, null, null, null, null] } });

test('타우린을 사면 공격 종족값 +10, 가방에 놓지 않음, 최대 5번', () => {
  let run = charmander();
  const base = makeFighter('A', toSnapshot(run)).atk;
  for (let n = 1; n <= VITAMIN.max; n++) {
    const r = ok(buy(withShop(run, 'item:protein'), 0, { to: 'board', x: 0, y: 0, rot: 0 }));
    assert.deepEqual(r.note, { vitamin: 'item:protein', stat: 'atk', count: n });
    run = r.run;
  }
  assert.equal(run.boosts.atk, VITAMIN.max);
  assert.equal(run.board.items.length, 1);                        // 시작 기술만
  assert.equal(run.gold, 99 - VITAMIN.max * priceOf('item:protein'));
  assert.equal(buy(withShop(run, 'item:protein'), 0, {}).ok, false);
  const snap = toSnapshot(run);
  assert.deepEqual(snap.boosts, { atk: VITAMIN.max });
  assert.deepEqual(validateSnapshot(snap), []);
  assert.equal(makeFighter('A', snap).atk, base + VITAMIN.max * VITAMIN.amount);
  assert.equal(validateSnapshot({ ...snap, boosts: { atk: VITAMIN.max + 1 } }).length, 1);
  assert.equal(validateSnapshot({ ...snap, boosts: { luck: 1 } }).length, 1);
});

test('맥스업은 최대 HP, 진화해도 유지', () => {
  let run = ok(buy(withShop(charmander(), 'item:hp-up'), 0, {})).run;
  const hp = (r) => makeFighter('A', toSnapshot(r)).maxHp;
  assert.ok(hp(run) > hp(charmander()));
  run = ok(recordBattle(run, 'win')).run;
  run = ok(recordBattle(run, 'win')).run;   // 3라운드: 이상한사탕
  const i = run.shop.slots.findIndex((s) => s?.evo);
  run = ok(buy({ ...run, gold: 99 }, i, { to: 'evolve' })).run;
  assert.deepEqual([run.species, run.boosts.hp], [5, 1]);
});

test('상점: 영양제는 묶음 하나로 나오고, 최대로 먹은 능력치는 안 나옴', () => {
  const boosts = { atk: VITAMIN.max, hp: VITAMIN.max, def: VITAMIN.max, spa: VITAMIN.max, spd: VITAMIN.max };
  const ctx = { rng: createRng(5), round: 6, species: 4, board: createBoard(), boosts };
  let shop = createShop();
  let seen = 0;
  for (let i = 0; i < 3000; i++) {
    shop = rollShop(shop, ctx);
    for (const s of shop.slots) {
      if (!s || ITEM_RULES[s.id.slice(5)]?.kind !== 'vitamin') continue;
      seen++;
      assert.equal(s.id, 'item:carbos');   // 스피드만 남음
    }
  }
  assert.ok(seen > 0);
});

test('시작 후보 계통의 진화 도구는 모두 규칙과 이름이 있음', () => {
  const walk = (s) => evolutions(s).flatMap((e) => [e.item.slice(5), ...walk(e.to)]);
  for (const id of new Set(STARTER_POOL.flatMap(walk))) {
    assert.equal(ITEM_RULES[id]?.placeable, false, id);
    assert.ok(ITEMS[id]?.name && ITEMS[id].name !== id, id);
  }
});
