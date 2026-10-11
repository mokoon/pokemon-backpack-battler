// M2-1: 보드/가방 조각/배치/회전/겹침, 기술 4가지 제한 (DESIGN §4)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard, add, place, remove, activeMoves, activeItems, ownedIds, toSnapshot, MSG_MOVE_LIMIT, MSG_SAME_MOVE,
} from '../js/game/bag.js';
import { validateSnapshot } from '../js/sim/snapshot.js';

// 순서대로 add하고 실패하면 바로 테스트 실패
function build(steps, board = createBoard()) {
  for (const [id, target] of steps) {
    const r = add(board, id, target);
    assert.ok(r.ok, `${id}: ${r.error}`);
    board = r.board;
  }
  return board;
}
const at = (x, y, rot = 0) => ({ to: 'board', x, y, rot });
const uidOf = (board, id) => [...board.bags, ...board.items].find((t) => t.id === id).uid;

// 기본 가방(3,2)~(5,4)에 1칸 기술 4개
const FOUR = [['move:scratch', at(3, 2)], ['move:ember', at(4, 2)], ['move:growl', at(5, 2)], ['move:leer', at(3, 3)]];

test('시작 보드: 가운데 3×3 기본 가방, 보관함 6칸', () => {
  const b = createBoard();
  assert.deepEqual(b.bags.map((x) => [x.id, x.x, x.y]), [['bag_base', 3, 2]]);
  assert.equal(b.storage.length, 6);
});

test('다섯 번째 기술은 가방에 놓이지 않고, 가방 밖과 보관함에는 놓임', () => {
  const b = build(FOUR);
  assert.equal(activeMoves(b).length, 4);
  const r = add(b, 'move:smokescreen', at(4, 3));
  assert.deepEqual(r, { ok: false, error: MSG_MOVE_LIMIT });
  assert.ok(add(b, 'move:smokescreen', at(0, 0)).ok);                 // 가방 밖 (보드 빈 곳)
  assert.ok(add(b, 'move:smokescreen', { to: 'storage', slot: 0 }).ok);
  assert.ok(add(b, 'item:charcoal', at(4, 3)).ok);                    // 도구는 개수 제한 없음
});

test('중복 기술은 가방에 놓이지 않고, 가방 밖과 보관함에는 놓임', () => {
  const b = build([['move:ember', at(3, 2)]]);
  assert.deepEqual(add(b, 'move:ember', at(4, 2)), { ok: false, error: MSG_SAME_MOVE });
  assert.ok(add(b, 'move:ember', at(0, 0)).ok);
  assert.ok(add(b, 'move:ember', { to: 'storage', slot: 3 }).ok);
});

test('가방 밖 기술을 가방 안으로 옮길 때도 4가지 제한', () => {
  let b = build([...FOUR, ['move:smokescreen', at(0, 0)]]);
  const uid = uidOf(b, 'move:smokescreen');
  assert.equal(place(b, uid, at(4, 3)).error, MSG_MOVE_LIMIT);
  b = remove(b, uidOf(b, 'move:leer')).board;                          // 하나 빼면 들어감
  assert.ok(place(b, uid, at(4, 3)).ok);
});

test('겹침, 보드 밖은 안 됨', () => {
  const b = build([['move:flamethrower', at(3, 2)]]);                  // L3: (3,2)(3,3)(4,3)
  assert.equal(add(b, 'item:charcoal', at(3, 3)).error, '다른 물건과 겹쳐요');
  assert.equal(add(b, 'item:life-orb', at(8, 0)).error, '보드 밖에는 놓을 수 없어요');
  assert.equal(add(b, 'bag_2x2', at(4, 3)).error, '가방끼리 겹쳐요');
  assert.ok(add(b, 'item:charcoal', at(4, 2)).ok);
});

test('회전: 1×2 도구를 세우면 세로로 놓임', () => {
  const b = build([['item:life-orb', at(3, 2, 1)]]);
  assert.equal(activeItems(b).length, 1);
  assert.equal(add(b, 'item:charcoal', at(3, 3)).error, '다른 물건과 겹쳐요');
});

test('가방 조각을 옮기면 그 위 물건도 같이 옮겨진다', () => {
  let b = build([['bag_2x2', at(0, 0)], ['item:charcoal', at(1, 1)], ['move:ember', at(3, 2)]]);
  const r = place(b, uidOf(b, 'bag_2x2'), at(0, 5));
  assert.ok(r.ok, r.error);
  b = r.board;
  const charcoal = b.items.find((t) => t.id === 'item:charcoal');
  assert.deepEqual([charcoal.x, charcoal.y], [1, 6]);
  assert.deepEqual(b.items.find((t) => t.id === 'move:ember').x, 3);   // 다른 가방 위 물건은 그대로
});

test('물건이 올라간 가방은 돌릴 수 없고, 빈 가방은 돌릴 수 있다', () => {
  const b = build([['bag_2x3', at(0, 0)], ['item:charcoal', at(0, 0)], ['bag_pouch', at(7, 0)]]);
  assert.ok(!place(b, uidOf(b, 'bag_2x3'), at(0, 0, 1)).ok);
  assert.ok(place(b, uidOf(b, 'bag_pouch'), at(7, 0, 1)).ok);
});

test('가방을 옮겨서 가방 밖 기술이 가방 안에 들어오면 4가지 제한 검사', () => {
  const b = build([...FOUR, ['bag_2x2', at(0, 0)], ['move:smokescreen', at(7, 5)]]);
  assert.equal(place(b, uidOf(b, 'bag_2x2'), at(7, 5)).error, MSG_MOVE_LIMIT);
});

test('보관함: 빈 칸에만, 보관함 물건은 전투에 안 나감', () => {
  let b = build([['move:ember', { to: 'storage', slot: 2 }]]);
  assert.equal(add(b, 'item:charcoal', { to: 'storage', slot: 2 }).error, '보관함 칸이 비어 있지 않아요');
  assert.equal(activeMoves(b).length, 0);
  b = place(b, b.storage[2].uid, at(3, 2)).board;
  assert.equal(activeMoves(b).length, 1);
  assert.equal(b.storage[2], null);
});

test('스냅샷: 가방 위 물건만 넣고, 검사를 통과한다', () => {
  const b = build([['move:ember', at(3, 2)], ['item:charcoal', at(4, 2)], ['move:scratch', at(0, 0)], ['item:leftovers', { to: 'storage', slot: 0 }]]);
  const snap = toSnapshot(b, { species: 4, ability: 'blaze', round: 1 });
  assert.deepEqual(snap.items.map((i) => i.id), ['move:ember', 'item:charcoal']);
  assert.deepEqual(validateSnapshot(snap), []);
  assert.deepEqual(ownedIds(b).sort(), ['bag_base', 'item:charcoal', 'item:leftovers', 'move:ember', 'move:scratch']);
});

test('원래 보드는 바뀌지 않는다 (새 상태를 돌려줌)', () => {
  const b = createBoard();
  const before = JSON.stringify(b);
  add(b, 'move:ember', at(3, 2));
  assert.equal(JSON.stringify(b), before);
});
