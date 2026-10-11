// M2-2: 상점 (슬롯, 등급 확률, 새로고침, 찜, 판매, 골드) — DESIGN §12
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/sim/rng.js';
import { createBoard, add } from '../js/game/bag.js';
import {
  createShop, rollShop, newRound, refresh, toggleLock, buy, sellPrice, priceOf, roundGold, refreshCost,
} from '../js/game/shop.js';
import { MOVES } from '../js/data/moves.js';
import { LEARNSETS } from '../js/data/learnsets.js';
import { ITEM_RULES } from '../js/rules/items.js';

const at = (x, y, rot = 0) => ({ to: 'board', x, y, rot });
function boardWith(steps) {
  let b = createBoard();
  for (const [id, target] of steps) b = add(b, id, target).board;
  return b;
}
const gradeOf = (id) => {
  const [kind, name] = id.split(':');
  if (kind === 'move') return MOVES[name].grade;
  if (kind === 'item') return ITEM_RULES[name].grade;
  return null;
};
const ctxOf = (over = {}) => ({ rng: createRng(1), round: 1, species: 4, board: createBoard(), ...over });

test('1만 번 새로고침: 배울 수 없는 기술, 최대 강화한 기술, 같은 기술 두 칸이 나오지 않음. 가진 기술은 강화용으로 나옴', () => {
  // 리자드: 할퀴기(가방, +3 최대), 불꽃세례(가방 밖), 화염방사(보관함)를 가짐. 진화 전(파이리)만 배우는 기술도 나오면 안 됨
  const board = boardWith([['move:scratch', at(3, 2)], ['move:ember', at(0, 0)], ['move:flamethrower', { to: 'storage', slot: 0 }]]);
  board.items.find((t) => t.id === 'move:scratch').lv = 3;
  const seen = new Set();
  const learn = new Set(LEARNSETS[5]);
  const ctx = ctxOf({ rng: createRng(7), round: 6, species: 5, board });
  let shop = createShop();
  let moveSlots = 0;
  for (let i = 0; i < 10000; i++) {
    shop = rollShop(shop, ctx);
    const moves = shop.slots.filter((s) => s?.id.startsWith('move:')).map((s) => s.id.slice(5));
    moveSlots += moves.length;
    assert.equal(new Set(moves).size, moves.length);
    for (const m of moves) {
      assert.ok(learn.has(MOVES[m].id), `배울 수 없는 기술 ${m}`);
      assert.ok(!MOVES[m].excluded, `제외 기술 ${m}`);
      assert.ok(m !== 'scratch', `최대 강화 기술 ${m}`);
      seen.add(m);
    }
  }
  assert.ok(moveSlots > 10000);
  assert.ok(seen.has('ember') && seen.has('flamethrower'));   // 가진 기술(최대 전)은 강화용으로 나옴
});

test('등급 확률: 라운드 1~2는 일반/고급만, 비율은 대략 75:25', () => {
  const ctx = ctxOf({ rng: createRng(3) });
  const count = { common: 0, uncommon: 0 };
  for (let i = 0; i < 3000; i++) {
    for (const s of rollShop(createShop(), ctx).slots) {
      const g = gradeOf(s.id);
      if (!g) continue;
      assert.ok(g === 'common' || g === 'uncommon', `${s.id} ${g}`);
      count[g]++;
    }
  }
  const ratio = count.common / (count.common + count.uncommon);
  assert.ok(ratio > 0.70 && ratio < 0.80, `일반 비율 ${ratio}`);
});

test('기술 칸 보장: 라운드 1~2는 최소 2칸, 그 뒤엔 가방 기술이 4개 미만이면 최소 1칸', () => {
  for (let seed = 0; seed < 500; seed++) {
    const early = rollShop(createShop(), ctxOf({ rng: createRng(seed) }));
    assert.ok(early.slots.filter((s) => s.id.startsWith('move:')).length >= 2);
    const later = rollShop(createShop(), ctxOf({ rng: createRng(seed), round: 5 }));
    assert.ok(later.slots.filter((s) => s.id.startsWith('move:')).length >= 1);
  }
});

test('가방 칸이 3칸 이하로 남으면 가방 조각이 더 자주 나옴', () => {
  const full = boardWith([[3, 2], [3, 3], [3, 4]].map(([x, y]) => ['item:assault-vest', at(x, y)]));   // 기본 가방을 꽉 채움
  const share = (board) => {
    const ctx = ctxOf({ rng: createRng(5), round: 5, board });
    let bags = 0, total = 0;
    for (let i = 0; i < 3000; i++) {
      for (const s of rollShop(createShop(), ctx).slots) { total++; if (s.id.startsWith('bag_')) bags++; }
    }
    return bags / total;
  };
  const roomy = share(createBoard());
  const tight = share(full);
  assert.ok(roomy > 0.15 && roomy < 0.22, `여유 ${roomy}`);
  assert.ok(tight > 0.27, `부족 ${tight}`);
});

test('타입 맞춤: 불꽃 기술을 가지면 타입 강화 도구의 절반 이상이 목탄', () => {
  const board = boardWith([['move:ember', at(3, 2)]]);
  const ctx = ctxOf({ rng: createRng(9), board });
  let boosters = 0, charcoal = 0;
  for (let i = 0; i < 5000; i++) {
    for (const s of rollShop(createShop(), ctx).slots) {
      const name = s.id.slice(5);
      if (ITEM_RULES[name]?.kind !== 'typeBoost') continue;
      boosters++;
      if (name === 'charcoal') charcoal++;
    }
  }
  assert.ok(charcoal / boosters > 0.45, `${charcoal}/${boosters}`);
});

test('진화의휘석, 변함없는돌은 진화 해금 전에는 나오지 않음', () => {
  const seen = (evoUnlocked) => {
    const ctx = ctxOf({ rng: createRng(2), round: 6, evoUnlocked });
    const ids = new Set();
    for (let i = 0; i < 3000; i++) for (const s of rollShop(createShop(), ctx).slots) ids.add(s.id);
    return ids;
  };
  assert.ok(!seen(false).has('item:eviolite') && !seen(false).has('item:everstone'));
  assert.ok(seen(true).has('item:eviolite') && seen(true).has('item:everstone'));
});

test('새로고침: 1골드, 한 라운드에 4번마다 +1, 골드 부족이면 실패', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 7, 8].map(refreshCost), [1, 1, 1, 1, 2, 2, 3]);
  const ctx = ctxOf();
  let shop = rollShop(createShop(), ctx);
  let gold = 6;
  for (let i = 0; i < 5; i++) ({ shop, gold } = refresh(shop, gold, ctx));
  assert.equal(gold, 0);                          // 1+1+1+1+2
  assert.equal(refresh(shop, gold, ctx).ok, false);
  assert.equal(newRound(shop, ctx).refreshes, 0);
});

test('찜: 새로고침과 다음 라운드에도 남음', () => {
  const ctx = ctxOf();
  let shop = toggleLock(rollShop(createShop(), ctx), 2);
  const kept = shop.slots[2].id;
  shop = refresh(shop, 99, ctx).shop;
  shop = newRound(shop, { ...ctx, round: 2 });
  assert.deepEqual([shop.slots[2].id, shop.slots[2].locked], [kept, true]);
  assert.equal(toggleLock(shop, 2).slots[2].locked, false);
});

test('구매: 골드 차감, 칸 비움 / 골드 부족이면 실패', () => {
  const shop = rollShop(createShop(), ctxOf());
  const { price, id } = shop.slots[0];
  const r = buy(shop, 0, 20);
  assert.deepEqual([r.ok, r.id, r.gold, r.shop.slots[0]], [true, id, 20 - price, null]);
  assert.equal(buy(shop, 0, price - 1).ok, false);
});

test('가격과 판매가', () => {
  assert.deepEqual(['move:tackle', 'move:thunderbolt', 'move:flare-blitz', 'move:hyper-beam'].map(priceOf), [3, 5, 7, 10]);
  assert.deepEqual(['bag_pouch', 'bag_2x2', 'bag_2x3', 'bag_type_fire', 'bag_berry'].map(priceOf), [2, 4, 6, 6, 8]);
  assert.deepEqual(['item:charcoal', 'item:leftovers', 'item:choice-band', 'item:life-orb'].map(priceOf), [3, 5, 7, 10]);
  assert.equal(sellPrice('move:thunderbolt'), 2);                 // 5 / 2 내림
  assert.equal(sellPrice('bag_base'), null);
  assert.equal(sellPrice('bag_evo'), null);
  assert.equal(sellPrice('move:scratch', 'scratch'), 1);          // 시작 기술
});

test('라운드 골드 (§12.1) + 계통 보정 (§2.4)', () => {
  assert.equal(roundGold(1, 147), 12);            // 망나뇽 600 → 보정 0, 표에 없음
  assert.equal(roundGold(14, 147), 15);
  assert.equal(roundGold(20, 147), 15);           // 14를 넘으면 14의 값
  assert.equal(roundGold(1, 92), 12 - 3);         // 계통 보정 표: 고오스 −3
  assert.equal(roundGold(1, 94), 12 - 3);         // 진화해도 같은 계통
  assert.equal(roundGold(1, 10), 12 + 3);         // 캐터피 → 버터플 395 → 3
});

test('같은 시드면 같은 상점', () => {
  const a = rollShop(createShop(), ctxOf({ rng: createRng(42), round: 8 }));
  const b = rollShop(createShop(), ctxOf({ rng: createRng(42), round: 8 }));
  assert.deepEqual(a, b);
});

test('라운드 1~2에는 공격기가 최소 1칸 (변화기만 나오지 않음)', () => {
  // 핑복은 배울 수 있는 변화기가 많다
  for (let seed = 0; seed < 500; seed++) {
    const shop = rollShop(createShop(), ctxOf({ rng: createRng(seed), species: 440 }));
    assert.ok(shop.slots.some((s) => s.id.startsWith('move:') && MOVES[s.id.slice(5)].class !== 'status'), `seed ${seed}`);
  }
});
