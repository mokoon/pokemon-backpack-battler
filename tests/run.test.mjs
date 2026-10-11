// M2-3: 런 상태 — 포켓몬 선택, 특성, 시작 기술, 진화 도구, 승/패/무, 종료 (DESIGN §2)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRun, choosePokemon, chooseAbility, recordBattle, refresh, buy, sell, move, useEvolution, evolutions, replaceMove,
  toSnapshot, abilityChoices,
} from '../js/game/run.js';
import { add, activeMoves } from '../js/game/bag.js';
import { validateSnapshot } from '../js/sim/snapshot.js';
import { STARTER_POOL } from '../js/config.js';

const ok = (r) => { assert.ok(r.ok, r.error); return r.run; };
// 후보를 정해서 시작 (테스트용)
function startAs(species, ability, seed = 1) {
  let run = { ...createRun(seed), candidates: [species] };
  run = ok(choosePokemon(run, species));
  return run.phase === 'ability' ? ok(chooseAbility(run, ability)) : run;
}
const evoSlot = (run) => run.shop.slots.findIndex((s) => s?.evo);

test('후보 4마리: 풀에서 서로 다르게, 같은 시드면 같은 후보', () => {
  for (let seed = 0; seed < 50; seed++) {
    const c = createRun(seed).candidates;
    assert.equal(new Set(c).size, 4);
    assert.ok(c.every((s) => STARTER_POOL.includes(s)));
    assert.deepEqual(createRun(seed).candidates, c);
  }
  assert.notDeepEqual(createRun(1).candidates, createRun(2).candidates);
});

test('시작: 특성 선택 → 1라운드 상점, 12골드, 시작 기술이 가방에', () => {
  let run = createRun(3);
  assert.equal(choosePokemon(run, 999).ok, false);
  run = ok(choosePokemon(run, run.candidates[0]));
  assert.equal(run.phase, 'ability');
  assert.equal(chooseAbility(run, 'intimidate').ok, false);
  run = startAs(4, 'blaze');
  assert.deepEqual([run.phase, run.round, run.gold], ['shop', 1, 12]);
  assert.deepEqual(activeMoves(run.board).map((m) => m.id), ['move:ember']);
  assert.equal(run.shop.slots.filter(Boolean).length, 5);
  assert.deepEqual(validateSnapshot(toSnapshot(run)), []);
});

test('§2.3 해금 라운드 표와 같은 라운드에 진화 도구가 처음 나옴', () => {
  // [포켓몬, 특성, 1차 해금, 2차 해금]
  const TABLE = [[4, 'blaze', 3, 6], [7, 'torrent', 3, 6], [1, 'overgrow', 3, 6], [172, 'static', 1, 7],
    [92, 'levitate', 5, 7], [66, 'guts', 5, 7], [74, 'sturdy', 5, 7], [147, 'shed-skin', 5, 10],
    [440, 'natural-cure', 1, 7], [374, 'clear-body', 4, 8]];
  for (const [species, ability, first, second] of TABLE) {
    let run = startAs(species, ability);
    let seen = null;
    while (seen === null && run.round <= 12) {
      if (evoSlot(run) >= 0) seen = run.round;
      else run = ok(recordBattle(run, 'draw'));
    }
    assert.equal(seen, first, `${species} 1차`);
    const mid = evolutions(species)[0].to;
    assert.equal(evolutions(mid)[0].unlock, second, `${species} 2차`);
  }
});

test('진화 도구 가격: 아기 4, 중간 6, 최종 9', () => {
  assert.deepEqual([evolutions(172)[0].price, evolutions(25)[0].price], [4, 9]);
  assert.deepEqual([evolutions(4)[0].price, evolutions(5)[0].price], [6, 9]);
  assert.equal(evolutions(440)[0].item, 'item:oval-stone');
  assert.equal(evolutions(93)[0].item, 'item:linking-cord');
});

test('지금 진화: 종족이 바뀌고, 진화 가방 보상, 특성 유지, 2차 도구는 아직 안 나옴', () => {
  let run = startAs(4, 'blaze');
  while (evoSlot(run) < 0) run = ok(recordBattle(run, 'win'));
  const gold = run.gold;
  run = ok(buy(run, evoSlot(run), { to: 'evolve' }));
  assert.deepEqual([run.species, run.ability, run.gold], [5, 'blaze', gold - 6]);
  assert.ok(run.board.storage.some((t) => t?.id === 'bag_evo'));
  assert.equal(run.round, 3);
  run = ok(recordBattle(run, 'win'));
  assert.equal(evoSlot(run), -1);                         // 리자드 → 리자몽은 6라운드
});

test('나중에 진화: 보관함에 넣었다가 사용, 팔면 산 가격의 절반', () => {
  let run = startAs(172, 'static');
  run = ok(recordBattle(run, 'win'));                     // 2라운드
  const i = evoSlot(run);
  run = ok(buy(run, i, { to: 'storage', slot: 0 }));
  assert.equal(run.board.storage[0].id, 'item:soothe-bell');
  assert.equal(add(run.board, 'item:soothe-bell', { to: 'board', x: 3, y: 3, rot: 0 }).ok, false);   // 가방에는 못 놓음
  const sold = ok(sell(run, run.board.storage[0].uid));
  assert.equal(sold.gold, run.gold + 2);                  // 4 / 2
  run = ok(useEvolution(run, run.board.storage[0].uid));
  assert.equal(run.species, 25);
  assert.equal(run.board.storage[0]?.id, 'bag_evo');      // 도구 자리에 진화 가방
});

test('변함없는돌이 가방에 있으면 진화 도구를 쓸 수 없고, 매 라운드 +3골드', () => {
  let run = startAs(4, 'blaze');
  run = { ...run, board: add(run.board, 'item:everstone', { to: 'board', x: 4, y: 2, rot: 0 }).board };
  const gold = run.gold;
  run = ok(recordBattle(run, 'win'));
  assert.equal(run.gold, gold + 9 + 3);
  run = ok(recordBattle(run, 'win'));                     // 3라운드: 이상한사탕
  assert.equal(buy(run, evoSlot(run), { to: 'evolve' }).error, '변함없는돌이 가방에 있어서 진화할 수 없어요');
  run = ok(buy(run, evoSlot(run), { to: 'storage', slot: 0 }));
  assert.equal(useEvolution(run, run.board.storage[0].uid).ok, false);
  const stone = run.board.items.find((t) => t.id === 'item:everstone');
  run = ok(move(run, stone.uid, { to: 'storage', slot: 1 }));   // 가방에서 빼면 진화 가능
  assert.equal(ok(useEvolution(run, run.board.storage[0].uid)).species, 5);
});

test('진화 후 같은 슬롯 특성이 바뀌면 다시 고른다 (고우스트 부유 → 팬텀 저주받은바디)', () => {
  let run = startAs(93, 'levitate');
  while (evoSlot(run) < 0) run = ok(recordBattle(run, 'win'));
  run = ok(buy(run, evoSlot(run), { to: 'evolve' }));
  assert.deepEqual([run.species, run.phase], [94, 'ability']);
  assert.deepEqual(abilityChoices(94).map((a) => a.id), ['cursed-body']);
  run = ok(chooseAbility(run, 'cursed-body'));
  assert.deepEqual([run.phase, run.ability], ['shop', 'cursed-body']);
});

test('판매: 시작 기술 1골드, 기본 가방은 팔 수 없음', () => {
  const run = startAs(4, 'blaze');
  const start = run.board.items[0];
  assert.equal(ok(sell(run, start.uid)).gold, run.gold + 1);
  assert.equal(sell(run, run.board.bags[0].uid).error, '팔 수 없는 가방이에요');
});

test('경제 특성(프렌드가드): 매 라운드 새로고침 1회 무료', () => {
  let run = startAs(440, 'friend-guard');
  const gold = run.gold;
  run = ok(refresh(run));
  assert.equal(run.gold, gold);
  run = ok(refresh(run));
  assert.equal(run.gold, gold - 1);
});

test('10승이면 클리어, 5패면 종료, 무승부는 라운드만 진행', () => {
  let run = startAs(4, 'blaze');
  run = ok(recordBattle(run, 'draw'));
  assert.deepEqual([run.round, run.wins, run.losses, run.draws], [2, 0, 0, 1]);
  let w = run;
  for (let i = 0; i < 10; i++) w = ok(recordBattle(w, 'win'));
  assert.equal(w.phase, 'cleared');
  let l = run;
  for (let i = 0; i < 5; i++) l = ok(recordBattle(l, 'loss'));
  assert.equal(l.phase, 'over');
  assert.equal(recordBattle(l, 'win').ok, false);
});

test('같은 시드, 같은 행동이면 같은 상점', () => {
  const play = () => ok(refresh(ok(recordBattle(startAs(7, 'torrent', 9), 'win'))));
  assert.deepEqual(play().shop, play().shop);
});

test('최종 진화 뒤에는 진화의휘석, 변함없는돌이 상점에 나오지 않음', () => {
  let run = startAs(147, 'shed-skin');
  run = { ...run, species: 149 };                 // 망나뇽 (최종 진화)
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    run = ok(recordBattle(run, 'draw'));
    for (let k = 0; k < 5; k++) {
      run.shop.slots.forEach((s) => s && seen.add(s.id));
      run = ok(refresh({ ...run, gold: 99 }));
    }
  }
  assert.ok(!seen.has('item:eviolite') && !seen.has('item:everstone'));
});

test('기술 교체: 가방 기술 4개일 때 새 기술을 기존 기술 자리에 → 옛 기술은 보관함으로', () => {
  let run = startAs(4, 'blaze');                    // 불꽃세례 (3,2)
  for (const [m, x, y] of [['scratch', 4, 2], ['growl', 5, 2], ['leer', 3, 3]]) {
    run = { ...run, board: add(run.board, `move:${m}`, { to: 'board', x, y, rot: 0 }).board };
  }
  run = { ...run, gold: 10, shop: { ...run.shop, slots: [{ id: 'move:smokescreen', price: 3, locked: false }, null, null, null, null] } };
  const ember = run.board.items.find((t) => t.id === 'move:ember');
  const place = (r) => buy(r, 0, { to: 'board', x: 3, y: 2, rot: 0 });
  assert.equal(place(run).ok, false);                // 그냥 놓으면 겹침/4개 제한
  const next = ok(replaceMove(run, ember.uid, place));
  assert.deepEqual(activeMoves(next.board).map((m) => m.id).sort(), ['move:growl', 'move:leer', 'move:scratch', 'move:smokescreen']);
  assert.equal(next.board.storage[0].id, 'move:ember');
  assert.equal(next.gold, 7);
  // 보관함이 가득 차 있으면 교체하지 않음 (아무것도 안 바뀜)
  const full = { ...run, board: { ...run.board, storage: run.board.storage.map((_, i) => ({ uid: 900 + i, id: 'item:charcoal', rot: 0 })) } };
  assert.equal(replaceMove(full, ember.uid, place).ok, false);
});
