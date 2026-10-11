// M1-1: 시드 난수, 스냅샷 검사, 배치/인접, 발버둥
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/sim/rng.js';
import { validateSnapshot, resolveBuild, placeCells, SHAPES } from '../js/sim/snapshot.js';

// 파이리, 기본 가방(3×3, 0~2) + 큰 가방(2×3, x 3~4)
const snap = (items, extra = {}) => ({
  v: 1, species: 4, ability: 'blaze', round: 1,
  bags: [{ id: 'bag_base', x: 0, y: 0, rot: 0 }, { id: 'bag_2x3', x: 3, y: 0, rot: 0 }],
  items, ...extra,
});
const at = (id, x, y, rot = 0) => ({ id, x, y, rot });

test('시드가 같으면 같은 난수, 다르면 다른 난수', () => {
  const seq = (s) => { const r = createRng(s); return Array.from({ length: 5 }, r.next); };
  assert.deepEqual(seq(1), seq(1));
  assert.notDeepEqual(seq(1), seq(2));
  assert.ok(seq(7).every((x) => x >= 0 && x < 1));
});

test('유효한 스냅샷은 오류 없음', () => {
  const s = snap([at('move:scratch', 0, 0), at('move:flamethrower', 1, 0), at('item:charcoal', 0, 1)]);
  assert.deepEqual(validateSnapshot(s), []);
});

test('기술 5개는 오류', () => {
  const five = ['scratch', 'ember', 'growl', 'leer', 'smokescreen'].map((m, i) => at(`move:${m}`, i, 0));
  assert.ok(validateSnapshot(snap(five)).some((e) => e.includes('4개를 넘음')));
});

test('중복 기술은 오류', () => {
  const s = snap([at('move:scratch', 0, 0), at('move:scratch', 1, 0)]);
  assert.ok(validateSnapshot(s).some((e) => e.includes('중복 기술')));
});

test('배울 수 없는 기술은 오류, 진화 전 형태가 배우던 기술은 허용', () => {
  assert.ok(validateSnapshot(snap([at('move:surf', 0, 0)])).some((e) => e.includes('배울 수 없는')));
  // 메탕구(375)는 메탕(374)의 기술을 그대로 쓸 수 있다
  const s = snap([at('move:take-down', 0, 0)], { species: 375, ability: 'clear-body' });
  assert.deepEqual(validateSnapshot(s), []);
});

test('겹침, 가방 밖, 보드 밖, 진화 도구는 오류', () => {
  assert.ok(validateSnapshot(snap([at('move:scratch', 0, 0), at('item:charcoal', 0, 0)])).some((e) => e.includes('겹침')));
  assert.ok(validateSnapshot(snap([at('move:scratch', 6, 0)])).some((e) => e.includes('가방 밖')));
  assert.ok(validateSnapshot({ ...snap([]), bags: [at('bag_base', 7, 0)] }).some((e) => e.includes('보드 밖')));
  assert.ok(validateSnapshot(snap([at('item:rare-candy', 0, 0)])).some((e) => e.includes('놓을 수 없는')));
});

test('회전: L3 모양을 90° 돌리면 왼쪽 위 기준으로 맞춰진다', () => {
  assert.deepEqual(placeCells(SHAPES.L3, 2, 3, 1), [[3, 3], [2, 3], [2, 4]]);
  assert.deepEqual(placeCells(SHAPES.I3, 0, 0, 1), [[0, 0], [0, 1], [0, 2]]);
});

test('인접은 변 공유만, 물건 단위 1회, 읽기 순서 정렬', () => {
  // 할퀴기 (0,0), 화염방사 L3 (1,0)(1,1)(2,1), 목탄 (0,1), 먹다남은음식 (0,2)(1,2)
  const s = snap([at('item:charcoal', 0, 1), at('move:flamethrower', 1, 0), at('move:scratch', 0, 0), at('item:leftovers', 0, 2)]);
  assert.deepEqual(validateSnapshot(s), []);
  const b = resolveBuild(s);
  const ids = b.entries.map((e) => e.id);
  assert.deepEqual(ids, ['scratch', 'flamethrower', 'charcoal', 'leftovers']);
  const adjIds = (id) => b.entries.find((e) => e.id === id).adj.map((i) => ids[i]);
  assert.deepEqual(adjIds('charcoal'), ['scratch', 'flamethrower', 'leftovers']);
  assert.deepEqual(adjIds('leftovers'), ['flamethrower', 'charcoal']);   // 화염방사 (1,1)과 (1,2) 변 공유
  assert.deepEqual(b.moves.map((m) => m.id), ['scratch', 'flamethrower']);
  assert.deepEqual(b.entries[0].onBags, ['bag_base']);
});

test('기술이 없으면 발버둥', () => {
  const b = resolveBuild(snap([at('item:charcoal', 0, 0)]));
  assert.equal(b.moves.length, 1);
  assert.equal(b.moves[0].move.struggle, true);
  assert.equal(b.moves[0].move.power, 50);
  assert.equal(b.moves[0].move.recoil, 0.25);
});
