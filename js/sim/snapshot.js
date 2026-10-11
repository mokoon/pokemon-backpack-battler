// 전투 입력 스냅샷 (DESIGN §11.4): 검사, 배치 계산, 인접, 발버둥(§4.4)
import { BOARD_W, BOARD_H, MAX_MOVES, STRUGGLE, BOSS_BST } from '../config.js';
import { MOVES } from '../data/moves.js';
import { POKEMON } from '../data/pokemon.js';
import { LEARNSETS } from '../data/learnsets.js';
import { TYPES } from '../data/typechart.js';
import { ITEM_RULES } from '../rules/items.js';

// §5.6 모양 (회전 0 기준 칸 좌표 [x, y])
export const SHAPES = {
  '1': [[0, 0]],
  I2: [[0, 0], [1, 0]],
  I3: [[0, 0], [1, 0], [2, 0]],
  L3: [[0, 0], [0, 1], [1, 1]],
  L4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  O4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  L5: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
  P5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  R6: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
};

// §4.3 가방 조각 크기 [가로, 세로]
const BAG_SIZES = {
  bag_base: [3, 3], bag_evo: [2, 3], bag_pouch: [1, 2], bag_2x2: [2, 2], bag_2x3: [2, 3], bag_berry: [1, 3],
};

export function bagSize(id) {
  if (BAG_SIZES[id]) return BAG_SIZES[id];
  const type = id.startsWith('bag_type_') && id.slice(9);
  return type && TYPES[type] ? [2, 2] : null;
}

const rect = (w, h) => Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]);

// 90°씩 시계 방향 회전 후 왼쪽 위를 (x, y)에 맞춘 칸 좌표
export function placeCells(shape, x, y, rot = 0) {
  let cells = shape;
  for (let r = 0; r < ((rot % 4) + 4) % 4; r++) cells = cells.map(([cx, cy]) => [-cy, cx]);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([cx, cy]) => [cx - minX + x, cy - minY + y]);
}

// 스냅샷 id('bag_2x2', 'move:ember', 'item:charcoal')의 칸 좌표. 알 수 없거나 가방에 놓을 수 없으면 null
export function cellsOf(id, x, y, rot = 0) {
  const size = bagSize(id);
  if (size) return placeCells(rect(...size), x, y, rot);
  const [kind, name] = String(id).split(':');
  if (kind === 'move' && MOVES[name]) return placeCells(SHAPES[MOVES[name].shape], x, y, rot);
  if (kind === 'item' && ITEM_RULES[name]?.size) return placeCells(rect(ITEM_RULES[name].size, 1), x, y, rot);
  return null;
}

export const key = ([x, y]) => `${x},${y}`;

// 진화 전 형태가 배울 수 있던 기술도 허용 (§5.1)
export function learnableMoveIds(species) {
  const ids = new Set();
  for (let s = species; s; s = POKEMON[s].evolvesFrom) for (const id of LEARNSETS[s] ?? []) ids.add(id);
  return ids;
}

// 스냅샷의 가방과 물건을 칸 좌표로 풀어 낸다. 알 수 없는 id는 errors에 넣고 건너뛴다.
function place(snap, errors) {
  const bags = [];
  for (const b of snap.bags ?? []) {
    if (!bagSize(b.id)) { errors.push(`알 수 없는 가방: ${b.id}`); continue; }
    bags.push({ id: b.id, cells: cellsOf(b.id, b.x, b.y, b.rot) });
  }
  const things = [];
  for (const it of snap.items ?? []) {
    const [kind, id] = String(it.id).split(':');
    const cells = kind === 'move' || kind === 'item' ? cellsOf(it.id, it.x, it.y, it.rot) : null;
    if (!cells) {
      errors.push(kind === 'item' && ITEM_RULES[id] ? `가방에 놓을 수 없는 도구: ${id}` : `알 수 없는 물건: ${it.id}`);
      continue;
    }
    things.push({ kind, id, cells });
  }
  return { bags, things };
}

// 오류 목록을 돌려준다 (빈 배열이면 유효). 전투 전에 항상 검사한다.
export function validateSnapshot(snap) {
  const errors = [];
  if (snap?.v !== 1) return ['스냅샷 버전이 1이 아님'];
  const mon = POKEMON[snap.species];
  if (!mon) return [`알 수 없는 포켓몬: ${snap.species}`];
  if (!Number.isInteger(snap.round) || snap.round < 1) errors.push(`잘못된 라운드: ${snap.round}`);
  if (snap.boss !== undefined && typeof snap.boss !== 'boolean') errors.push(`잘못된 보스 표시: ${snap.boss}`);
  if (snap.ability != null && !mon.abilities.some((a) => a.id === snap.ability)) {
    errors.push(`이 포켓몬의 특성이 아님: ${snap.ability}`);
  }

  const { bags, things } = place(snap, errors);
  const onBoard = ([x, y]) => x >= 0 && y >= 0 && x < BOARD_W && y < BOARD_H;

  const bagCells = new Set();
  for (const b of bags) {
    if (!b.cells.every(onBoard)) errors.push(`보드 밖 가방: ${b.id}`);
    for (const c of b.cells) {
      if (bagCells.has(key(c))) errors.push(`가방끼리 겹침: ${b.id}`);
      bagCells.add(key(c));
    }
  }

  const used = new Set();
  const learnable = learnableMoveIds(snap.species);
  const moveIds = [];
  for (const t of things) {
    if (!t.cells.every((c) => bagCells.has(key(c)))) errors.push(`가방 밖 배치: ${t.id}`);
    for (const c of t.cells) {
      if (used.has(key(c))) errors.push(`물건끼리 겹침: ${t.id}`);
      used.add(key(c));
    }
    if (t.kind === 'move') {
      const m = MOVES[t.id];
      if (m.excluded) errors.push(`쓸 수 없는 기술: ${t.id}`);
      if (!learnable.has(m.id)) errors.push(`배울 수 없는 기술: ${t.id}`);
      if (moveIds.includes(t.id)) errors.push(`중복 기술: ${t.id}`);
      moveIds.push(t.id);
    }
  }
  if (moveIds.length > MAX_MOVES) errors.push(`기술이 ${MAX_MOVES}개를 넘음: ${moveIds.length}개`);
  return errors;
}

// 유효한 스냅샷 → 전투용 구성. 기술은 가방 읽기 순서(가장 왼쪽 위 칸 기준, 위→아래, 왼→오른쪽)로 정렬.
// 각 물건의 adj: 변을 공유하는 다른 물건의 번호 (물건 단위 1회), onBags: 칸이 모두 올라간 가방 id 목록.
export function resolveBuild(snap) {
  const { bags, things } = place(snap, []);
  for (const b of bags) b.keys = new Set(b.cells.map(key));
  const anchor = (t) => t.cells.reduce((a, c) => (c[1] < a[1] || (c[1] === a[1] && c[0] < a[0]) ? c : a));
  things.sort((a, b) => {
    const pa = anchor(a), pb = anchor(b);
    return pa[1] - pb[1] || pa[0] - pb[0];
  });

  const owner = new Map();
  things.forEach((t, i) => t.cells.forEach((c) => owner.set(key(c), i)));
  const entries = things.map((t, i) => {
    const adj = new Set();
    for (const [x, y] of t.cells) {
      for (const n of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = owner.get(key(n));
        if (j !== undefined && j !== i) adj.add(j);
      }
    }
    const onBags = bags.filter((b) => t.cells.every((c) => b.keys.has(key(c)))).map((b) => b.id);
    return { index: i, kind: t.kind, id: t.id, cells: t.cells, adj: [...adj].sort((a, b) => a - b), onBags };
  });

  const moves = entries.filter((e) => e.kind === 'move').map((e) => ({ ...e, move: MOVES[e.id] }));
  if (moves.length === 0) moves.push({ index: -1, kind: 'move', id: 'struggle', cells: [], adj: [], onBags: [], move: struggleMove() });

  return {
    species: snap.species,
    pokemon: snap.boss ? bossPokemon(POKEMON[snap.species]) : POKEMON[snap.species],
    ability: snap.ability ?? null,
    round: snap.round,
    entries,
    moves,
    items: entries.filter((e) => e.kind === 'item'),
  };
}

// §2.5 보스: 종족값 합이 BOSS_BST가 되도록 각 종족값에 같은 비율을 곱한다
function bossPokemon(mon) {
  const k = BOSS_BST / mon.bst;
  const stats = Object.fromEntries(Object.entries(mon.stats).map(([s, v]) => [s, Math.round(v * k)]));
  return { ...mon, stats, bst: BOSS_BST };
}

// §4.4 발버둥: 무속성 물리, 상성 계산 없음, 사용할 때마다 최대 HP 반동
function struggleMove() {
  return {
    id: 0, name: '발버둥', type: null, class: 'physical', power: STRUGGLE.power, pp: null, accuracy: null,
    priority: 0, target: 'selected-pokemon', flags: ['contact'], meta: null, statChanges: [],
    tiles: 0, cool: STRUGGLE.cool, power1: Math.round(STRUGGLE.power * STRUGGLE.cool / 4),
    recoil: STRUGGLE.recoil, struggle: true,
  };
}
