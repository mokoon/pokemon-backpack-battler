// M2-4: 봇 생성기 (DESIGN §14)
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBot, STRATEGIES, bestSpot } from '../js/game/bot.js';
import { validateSnapshot, cellsOf } from '../js/sim/snapshot.js';
import { createBoard, add } from '../js/game/bag.js';

const bagCells = (snap) => snap.bags.reduce((n, b) => n + cellsOf(b.id, 0, 0).length, 0);

test('시드가 같으면 같은 봇 가방, 다르면 다름', () => {
  assert.deepEqual(generateBot(7, 6).snapshot, generateBot(7, 6).snapshot);
  assert.notDeepEqual(generateBot(7, 6).snapshot, generateBot(8, 6).snapshot);
});

test('라운드가 오를수록 가방 칸 수가 늘어남 (시드 30개 평균)', () => {
  const avg = (round) => {
    let sum = 0;
    for (let s = 0; s < 30; s++) sum += bagCells(generateBot(s, round).snapshot);
    return sum / 30;
  };
  const series = [1, 3, 6, 9, 12].map(avg);
  for (let i = 1; i < series.length; i++) assert.ok(series[i] > series[i - 1], series.join(' < '));
});

test('모든 봇 스냅샷이 검사를 통과 (라운드, 시드, 전략, 난이도)', () => {
  for (const strategy of STRATEGIES) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      for (let s = 0; s < 3; s++) {
        for (const round of [1, 5, 10, 14]) {
          const { snapshot } = generateBot(s * 31 + 1, round, { strategy, difficulty });
          assert.deepEqual(validateSnapshot(snapshot), [], `${strategy} ${difficulty} ${s} ${round}`);
          assert.equal(snapshot.round, round);
        }
      }
    }
  }
});

test('봇은 진화한다 (일반), 미진화 전략은 하지 않는다', () => {
  // 파이리 고정: 12라운드면 일반 봇은 리자몽까지
  const normal = generateBot(3, 12, { species: 4 }).snapshot.species;
  const base = generateBot(3, 12, { species: 4, strategy: 'noEvolveBase' }).snapshot.species;
  const mid = generateBot(3, 12, { species: 4, strategy: 'noEvolveMid' }).snapshot.species;
  assert.equal(normal, 6);
  assert.equal(base, 4);
  assert.equal(mid, 5);
});

test('어려움 봇은 같은 시드 보통 봇보다 가방 칸 + 물건이 많거나 같음 (골드 ×1.15)', () => {
  let harder = 0;
  for (let s = 0; s < 20; s++) {
    const size = (d) => {
      const snap = generateBot(s, 10, { difficulty: d }).snapshot;
      return bagCells(snap) + snap.items.length;
    };
    if (size('hard') >= size('easy')) harder++;
  }
  assert.ok(harder >= 15, `${harder}/20`);
});

test('배치: 타입 강화 도구는 같은 타입 기술 옆에 놓는다', () => {
  let board = createBoard();
  board = add(board, 'move:ember', { to: 'board', x: 4, y: 3, rot: 0 }).board;   // 기본 가방 가운데
  board = add(board, 'move:scratch', { to: 'board', x: 3, y: 2, rot: 0 }).board;
  const t = bestSpot(board, 'item:charcoal', 4);
  const cell = cellsOf('item:charcoal', t.x, t.y, t.rot)[0];
  assert.equal(Math.abs(cell[0] - 4) + Math.abs(cell[1] - 3), 1);
});
