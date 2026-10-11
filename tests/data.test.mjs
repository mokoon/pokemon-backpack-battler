// DESIGN §5.5 표와 데이터 빌드 결과가 같은지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES } from '../js/data/moves.js';
import { POKEMON } from '../js/data/pokemon.js';
import { LEARNSETS } from '../js/data/learnsets.js';
import { TYPE_CHART } from '../js/data/typechart.js';

// [기술, 칸, 칸보정, 쿨(초), 1회 위력, 초당 위력]
const TABLE = [
  ['tackle', 1, 0.85, 2.8, 24, 8.5],
  ['quick-attack', 1, 0.85, 3.2, 27, 8.5],
  ['double-kick', 2, 1.03, 3.2, 25, 15.5],
  ['thunderbolt', 3, 1.06, 5.0, 119, 23.9],
  ['thunder', 3, 1.20, 6.0, 198, 23.1],
  ['fire-blast', 3, 1.02, 8.0, 224, 23.9],
  ['earthquake', 3, 0.95, 6.0, 143, 23.9],
  ['bullet-seed', 3, 1.20, 3.2, 24, 23.2],
  ['flare-blitz', 4, 1.09, 5.0, 164, 32.7],
  ['close-combat', 4, 1.09, 8.0, 262, 32.7],
  ['hyper-beam', 5, 1.20, 8.0, 360, 40.5],
];

for (const [id, tiles, adj, cool, power1, perSec] of TABLE) {
  test(`§5.5 ${id}`, () => {
    const m = MOVES[id];
    assert.equal(m.excluded, false);
    assert.equal(m.tiles, tiles);
    assert.equal(Math.round(m.tileAdj * 100) / 100, adj);
    assert.equal(m.cool, cool);
    assert.equal(m.power1, power1);
    assert.ok(Math.abs(m.perSec - perSec) <= 0.051, `초당 위력 ${m.perSec} ≠ ${perSec}`);
  });
}

test('§5.5 솔라빔: 4칸, 쿨 6.0 × 1.3', () => {
  const m = MOVES['solar-beam'];
  assert.equal(m.tiles, 4);
  assert.equal(Math.round(m.tileAdj * 100) / 100, 1.09);
  assert.equal(m.cool, 7.8);
});

test('§5.6 모양: 물리는 길쭉, 특수는 뭉침', () => {
  assert.equal(MOVES.earthquake.shape, 'I3');
  assert.equal(MOVES.thunderbolt.shape, 'L3');
  assert.equal(MOVES['flare-blitz'].shape, 'L4');
  assert.equal(MOVES['hyper-beam'].shape, 'P5');
});

test('§5.1 제외 기술', () => {
  assert.equal(MOVES.explosion.excludeReason, 'self-faint');
  assert.equal(MOVES['seismic-toss'].excludeReason, 'no-power');
  assert.equal(MOVES['baton-pass'].excludeReason, 'no-family');
  assert.equal(MOVES['tachyon-cutter'].excluded, false);   // 명중 0 = 반드시 맞음
  for (const k of ['snore', 'dream-eater', 'fake-out', 'focus-punch', 'last-resort']) assert.equal(MOVES[k].excludeReason, 'conditional', k);
});

test('§18.1 move_meta가 없는 8~9세대 공격기는 원작 효과를 손으로 보충', () => {
  assert.equal(Object.values(MOVES).filter((m) => !m.excluded && m.class !== 'status' && !m.meta).length, 0);
  assert.equal(MOVES['wave-crash'].meta.drain, -33);                                      // 반동 1/3
  assert.deepEqual([MOVES.trailblaze.meta.category, MOVES.trailblaze.statChanges], ['damage-raise', [{ stat: 'spe', change: 1 }]]);
  assert.deepEqual([MOVES['chilling-water'].meta.category, MOVES['chilling-water'].statChanges], ['damage-lower', [{ stat: 'atk', change: -1 }]]);
  assert.deepEqual([MOVES['triple-dive'].meta.minHits, MOVES['triple-dive'].meta.maxHits], [3, 3]);
  assert.equal(MOVES.ruination.excludeReason, 'no-power');                               // 위력 1 = 상황에 따라 피해
  assert.equal(MOVES['upper-hand'].excludeReason, 'conditional');
});

test('§5.8 변화기 계열과 칸', () => {
  assert.equal(MOVES['swords-dance'].family, 'boost2');
  assert.equal(MOVES['swords-dance'].tiles, 2);
  assert.equal(MOVES.growl.tiles, 1);
  assert.equal(MOVES.spore.tiles, 3);
  assert.equal(MOVES.hypnosis.tiles, 2);
  assert.equal(MOVES.reflect.tiles, 3);
});

test('§2.2 시작 포켓몬과 배우는 기술', () => {
  assert.equal(POKEMON[4].startMove, 'ember');            // 가장 낮은 레벨의 자기 타입 공격기
  assert.equal(POKEMON[440].startMove, 'pound');           // 핑복: 노말 자기 타입
  assert.equal(POKEMON[374].startMove, 'tackle');          // 메탕: 자기 타입 공격기가 없으면 원래 규칙
  assert.equal(POKEMON[374].name, '메탕');
  assert.equal(LEARNSETS[374].length, 8);
  assert.equal(POKEMON[172].baby, true);
  assert.equal(POKEMON[94].evo.item, 'linking-cord');
  assert.equal(POKEMON[113].evo.item, 'oval-stone');
});

test('타입 상성 원작 그대로', () => {
  assert.equal(TYPE_CHART.electric.ground, 0);
  assert.equal(TYPE_CHART.water.fire, 2);
  assert.equal(TYPE_CHART.fire.water, 0.5);
});
