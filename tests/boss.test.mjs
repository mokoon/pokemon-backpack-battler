// M4-4: 최종 보스전(§2.5), 이로치(§16), 계통 기록
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, choosePokemon, bossOf, isBossRound } from '../js/game/run.js';
import { generateOpponent } from '../js/game/bot.js';
import { validateSnapshot } from '../js/sim/snapshot.js';
import { makeFighter, simulate } from '../js/sim/battle.js';
import { lineOf } from '../js/ui/records.js';
import { BOSS_POOL, BOSS_BST, WIN_TARGET, VITAMIN } from '../js/config.js';
import { POKEMON } from '../js/data/pokemon.js';

test('보스: 런 시드로 정해지고, 풀의 4마리가 모두 나옴', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    assert.equal(bossOf(seed), bossOf(seed));
    seen.add(bossOf(seed));
  }
  assert.deepEqual([...seen].sort(), [...BOSS_POOL].sort());
});

test('9승 상태의 전투만 보스전', () => {
  assert.equal(isBossRound({ wins: WIN_TARGET - 1 }), true);
  assert.equal(isBossRound({ wins: WIN_TARGET - 2 }), false);
  const normal = generateOpponent({ seed: 3, round: 9, wins: 8 });
  assert.ok(!normal.boss);
});

test('보스 상대: 전설, 첫 번째 특성, 종족값 합 600으로 보정, 유효한 스냅샷', () => {
  for (let seed = 0; seed < 4; seed++) {
    const run = { seed, round: 11, wins: WIN_TARGET - 1 };
    const snap = generateOpponent(run);
    const mon = POKEMON[snap.species];
    assert.equal(snap.species, bossOf(seed));
    assert.equal(snap.boss, true);
    assert.equal(snap.ability, mon.abilities[0].id);
    assert.deepEqual(validateSnapshot(snap), []);
    // 보정 전후 비교: 같은 가방에서 boss만 뺀 쪽보다 능력치가 낮다 (680 → 600)
    const f = makeFighter('B', snap);
    const raw = makeFighter('B', { ...snap, boss: undefined });
    assert.ok(f.maxHp < raw.maxHp && f.atk < raw.atk);
    assert.equal(f.build.pokemon.bst, BOSS_BST);
    const vitamins = Object.values(snap.boosts ?? {}).reduce((a, b) => a + b, 0) * VITAMIN.amount;   // 영양제는 보정 뒤에 더함
    const sum = Object.values(f.build.pokemon.stats).reduce((a, b) => a + b, 0) - vitamins;
    assert.ok(Math.abs(sum - BOSS_BST) <= 3, `합 ${sum}`);
  }
  assert.deepEqual(validateSnapshot({ ...generateOpponent({ seed: 0, round: 11, wins: 9 }), boss: 'yes' }).length, 1);
});

test('보스전도 결정적', () => {
  const run = { seed: 7, round: 12, wins: 9 };
  const mine = generateOpponent({ seed: 8, round: 12, wins: 0 });
  const a = simulate(mine, generateOpponent(run), 1);
  const b = simulate(mine, generateOpponent(run), 1);
  assert.deepEqual(a.events, b.events);
});

test('이로치: 후보 카드마다 정해지고, 고른 포켓몬에 이어짐, 약 1/64', () => {
  let shiny = 0, total = 0;
  for (let seed = 0; seed < 4000; seed++) {
    const run = createRun(seed);
    assert.equal(run.shinies.length, run.candidates.length);
    assert.deepEqual(createRun(seed).shinies, run.shinies);
    shiny += run.shinies.filter(Boolean).length;
    total += run.shinies.length;
    if (run.shinies.some(Boolean)) {
      const i = run.shinies.indexOf(true);
      assert.equal(choosePokemon(run, run.candidates[i]).run.shiny, true);
    }
  }
  const rate = shiny / total;
  assert.ok(rate > 1 / 100 && rate < 1 / 40, `이로치 비율 ${rate}`);
});

test('기록 계통: 진화형도 첫 단계(아기 포함)로 묶음', () => {
  assert.equal(lineOf(6), 4);
  assert.equal(lineOf(26), 172);
  assert.equal(lineOf(242), 440);
  assert.equal(lineOf(376), 374);
});
