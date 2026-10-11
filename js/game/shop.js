// 상점과 경제 (DESIGN §12, §5.9, §4.3, §2.4). 순수 함수, 난수는 호출하는 쪽이 준 시드 난수(rng)만 쓴다.
//
// shop = { slots: [{ id, price, locked } | null] × SHOP_SLOTS, refreshes }   refreshes: 이번 라운드 새로고침 횟수
// ctx  = { rng, round, species, board, evoUnlocked, evoItem }               evoUnlocked: 진화의휘석/변함없는돌 출현 (§2.3)
//        evoItem: { id, price } 지금 살 수 있는 진화 도구 (run.js가 정함). 첫 상점은 보장, 새로고침은 EVO_REFRESH_CHANCE
import {
  GRADES, GRADE_PRICE, BAG_PIECES, UNSELLABLE_BAGS, SELL_RATIO, START_MOVE_SELL, ROUND_GOLD, weakBonusGold, LINE_GOLD,
  SHOP_SLOTS, REFRESH_COST, REFRESH_STEP, KIND_WEIGHTS, LOW_SPACE_CELLS, LOW_SPACE_BAG_WEIGHT,
  EARLY_MOVE_ROUNDS, EARLY_MOVE_SLOTS, MAX_MOVES, TYPE_MATCH_CHANCE, GRADE_ODDS, EVO_REFRESH_CHANCE,
} from '../config.js';
import { MOVES } from '../data/moves.js';
import { POKEMON } from '../data/pokemon.js';
import { LEARNSETS } from '../data/learnsets.js';
import { TYPES, TYPE_CHART } from '../data/typechart.js';
import { ITEM_RULES } from '../rules/items.js';
import { ownedIds, activeMoves, freeBagCells } from './bag.js';

const MOVE_KEY = Object.fromEntries(Object.entries(MOVES).map(([k, m]) => [m.id, k]));
const TYPE_LIST = Object.keys(TYPES);

// ---------- 가격, 골드 ----------

export function priceOf(id) {
  const [kind, name] = id.split(':');
  if (kind === 'move') return GRADE_PRICE[MOVES[name].grade];
  if (kind === 'item') return GRADE_PRICE[ITEM_RULES[name].grade];
  return BAG_PIECES[id.startsWith('bag_type_') ? 'bag_type' : id]?.price ?? null;
}

// 판매가: 산 가격의 절반 (내림). 기본 가방, 진화 가방은 팔 수 없음(null). 시작 기술은 1골드.
// 진화 도구는 등급이 없어 가격이 정해져 있지 않으므로 paid를 넘긴다.
// paid: 산 가격을 따로 기억하는 물건 (진화 도구)
export function sellPrice(id, startMove = null, paid = null) {
  if (UNSELLABLE_BAGS.includes(id)) return null;
  if (startMove && id === `move:${startMove}`) return START_MOVE_SELL;
  return Math.floor((paid ?? priceOf(id)) * SELL_RATIO);
}

// 진화 계통에서 최종 진화형 BST 최댓값 (분기 진화는 가장 높은 것, §2.4)
export function finalBst(species) {
  const chain = POKEMON[species].chain;
  const line = Object.entries(POKEMON).filter(([, p]) => p.chain === chain);
  const parents = new Set(line.map(([, p]) => p.evolvesFrom));
  return Math.max(...line.filter(([s]) => !parents.has(Number(s))).map(([, p]) => p.bst));
}

// 계통 첫 단계 (아기 포켓몬이 있으면 아기)
export const lineRoot = (species) => (POKEMON[species].evolvesFrom ? lineRoot(POKEMON[species].evolvesFrom) : species);

// 계통 보정 골드: 표(LINE_GOLD)에 있으면 그 값, 없으면 최종 진화 BST 식 (§2.4)
export const lineGold = (species) => LINE_GOLD[lineRoot(species)] ?? weakBonusGold(finalBst(species));

export const roundGold = (round, species) => Math.max(0, ROUND_GOLD[Math.min(round, ROUND_GOLD.length) - 1] + lineGold(species));

export const refreshCost = (refreshes) => REFRESH_COST + Math.floor(refreshes / REFRESH_STEP);

// ---------- 후보 ----------

// 도구 후보 (등급별). 타입 강화 도구 18종, 반감 열매 18종, 핀치 열매 5종은 표의 한 줄처럼 묶음 하나로 센다.
const GROUPS = ['typeBoost', 'resistBerry', 'pinchBerry'];
function itemPool(grade, evoUnlocked) {
  const pool = [];
  for (const [id, r] of Object.entries(ITEM_RULES)) {
    if (r.grade !== grade || (r.evoOnly && !evoUnlocked)) continue;
    const entry = GROUPS.includes(r.kind) ? `group:${r.kind}` : `item:${id}`;
    if (!pool.includes(entry)) pool.push(entry);
  }
  return pool;
}

// 가방 조각 후보 (등급별). 타입 가방 18종도 묶음 하나.
const bagPool = (grade) => Object.entries(BAG_PIECES).filter(([, b]) => b.grade === grade).map(([id]) => id);

const pick = (rng, list) => list[rng.int(list.length)];

function rollGrade(rng, round) {
  const row = GRADE_ODDS.find((r) => round <= r[0]);
  let x = rng.next() * 100;
  for (let i = 0; i < GRADES.length; i++) if ((x -= row[i + 1]) < 0) return i;
  return 0;
}

// 내 포켓몬이 약점인 타입 (반감 열매 맞춤)
const weaknesses = (types) => TYPE_LIST.filter((a) => types.reduce((f, d) => f * (TYPE_CHART[a]?.[d] ?? 1), 1) > 1);

// 묶음에서 하나 고르기: TYPE_MATCH_CHANCE 확률로 내게 맞는 것 중에서
function fromGroup(rng, group, info) {
  const ids = Object.entries(ITEM_RULES).filter(([, r]) => r.kind === group).map(([id]) => id);
  const match = group === 'typeBoost' ? ids.filter((id) => info.moveTypes.has(ITEM_RULES[id].type))
    : group === 'resistBerry' ? ids.filter((id) => info.weak.includes(ITEM_RULES[id].type)) : [];
  return `item:${pick(rng, match.length && rng.chance(TYPE_MATCH_CHANCE) ? match : ids)}`;
}

function typeBag(rng, info) {
  const match = TYPE_LIST.filter((t) => info.moveTypes.has(t));
  return `bag_type_${pick(rng, match.length && rng.chance(TYPE_MATCH_CHANCE) ? match : TYPE_LIST)}`;
}

// 한 칸 뽑기. 그 등급에 후보가 없으면 한 단계 아래 등급 (§12.3). 기술 후보가 아예 없으면 도구로.
// kind 'attack'은 공격기만 (초반 보장 칸, §18.6)
function rollSlot(rng, kind, info) {
  for (let g = rollGrade(rng, info.round); g >= 0; g--) {
    const grade = GRADES[g];
    if (kind === 'move' || kind === 'attack') {
      const moves = info.moves.filter((k) => MOVES[k].grade === grade && !info.taken.has(`move:${k}`)
        && (kind === 'move' || MOVES[k].class !== 'status'));
      if (moves.length) return `move:${pick(rng, moves)}`;
    } else if (kind === 'item') {
      const pool = itemPool(grade, info.evoUnlocked);
      if (pool.length) {
        const e = pick(rng, pool);
        return e.startsWith('group:') ? fromGroup(rng, e.slice(6), info) : e;
      }
    } else {
      const pool = bagPool(grade);
      if (pool.length) {
        const id = pick(rng, pool);
        return id === 'bag_type' ? typeBag(rng, info) : id;
      }
    }
  }
  if (kind === 'attack') return rollSlot(rng, 'move', info);
  return kind === 'move' ? rollSlot(rng, 'item', info) : null;
}

function rollKind(rng, lowSpace) {
  let w = KIND_WEIGHTS;
  if (lowSpace) {
    const scale = (100 - LOW_SPACE_BAG_WEIGHT) / (w.move + w.item);
    w = { move: w.move * scale, item: w.item * scale, bag: LOW_SPACE_BAG_WEIGHT };
  }
  let x = rng.next() * (w.move + w.item + w.bag);
  for (const k of ['move', 'item', 'bag']) if ((x -= w[k]) < 0) return k;
  return 'bag';
}

// ---------- 상점 ----------

export const createShop = () => ({ slots: Array(SHOP_SLOTS).fill(null), refreshes: 0 });

// 찜하지 않은 칸을 새로 채운다
export function rollShop(shop, ctx) {
  const { rng, round, species, board } = ctx;
  const owned = ownedIds(board);
  const slots = shop.slots.map((s) => (s?.locked ? s : null));
  const info = {
    round,
    evoUnlocked: !!ctx.evoUnlocked,
    // 현재 진화형 자신이 배울 수 있는 기술만 (§5.1). 가진 기술, 이미 상점에 있는 기술은 제외
    moves: LEARNSETS[species].map((id) => MOVE_KEY[id]).filter((k) => !MOVES[k].excluded && !owned.includes(`move:${k}`)),
    taken: new Set(slots.filter(Boolean).map((s) => s.id)),
    moveTypes: new Set(owned.filter((id) => id.startsWith('move:')).map((id) => MOVES[id.slice(5)].type)),
    weak: weaknesses(POKEMON[species].types),
  };

  // 진화 도구: 종류 비율과 별개로 비어 있는 마지막 칸에 (§2.3)
  const evo = ctx.evoItem;
  if (evo && !slots.some((s) => s?.id === evo.id) && (shop.refreshes === 0 || rng.chance(EVO_REFRESH_CHANCE))) {
    const i = slots.lastIndexOf(null);
    if (i >= 0) slots[i] = { id: evo.id, price: evo.price, locked: false, evo: true };
  }

  // 종류 정하기 + 기술 칸 보장 (§12.2)
  const open = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
  const kinds = {};
  for (const i of open) kinds[i] = rollKind(rng, freeBagCells(board) <= LOW_SPACE_CELLS);
  const need = round <= EARLY_MOVE_ROUNDS ? EARLY_MOVE_SLOTS : activeMoves(board).length < MAX_MOVES ? 1 : 0;
  let have = slots.filter((s) => s?.id.startsWith('move:')).length + open.filter((i) => kinds[i] === 'move').length;
  for (const i of open) {
    if (have >= need) break;
    if (kinds[i] !== 'move') { kinds[i] = 'move'; have++; }
  }
  // 라운드 1~2: 찜한 칸에 공격기가 없으면 기술 칸 하나는 공격기로 (변화기만 나와 시작 기술 하나로 싸우는 일 방지)
  const isAttack = (s) => s?.id.startsWith('move:') && MOVES[s.id.slice(5)].class !== 'status';
  const firstMove = open.find((i) => kinds[i] === 'move');
  if (round <= EARLY_MOVE_ROUNDS && !slots.some(isAttack) && firstMove !== undefined) kinds[firstMove] = 'attack';

  for (const i of open) {
    const id = rollSlot(rng, kinds[i], info);
    if (!id) continue;
    info.taken.add(id);
    slots[i] = { id, price: priceOf(id), locked: false };
  }
  return { ...shop, slots };
}

// 라운드 시작: 새로고침 횟수 초기화, 찜한 칸은 남기고 새로 채움
export const newRound = (shop, ctx) => rollShop({ ...shop, refreshes: 0 }, ctx);

export function refresh(shop, gold, ctx) {
  const cost = refreshCost(shop.refreshes);
  if (gold < cost) return { ok: false, error: '골드가 부족해요' };
  return { ok: true, gold: gold - cost, shop: rollShop({ ...shop, refreshes: shop.refreshes + 1 }, ctx) };
}

export function toggleLock(shop, i) {
  if (!shop.slots[i]) return shop;
  const slots = shop.slots.map((s, j) => (j === i ? { ...s, locked: !s.locked } : s));
  return { ...shop, slots };
}

// 산다: 골드 확인 후 칸을 비운다. 배치는 bag.js의 add로 (호출하는 쪽에서)
export function buy(shop, i, gold) {
  const slot = shop.slots[i];
  if (!slot) return { ok: false, error: '빈 칸이에요' };
  if (gold < slot.price) return { ok: false, error: '골드가 부족해요' };
  const slots = shop.slots.map((s, j) => (j === i ? null : s));
  return { ok: true, id: slot.id, price: slot.price, gold: gold - slot.price, shop: { ...shop, slots } };
}
