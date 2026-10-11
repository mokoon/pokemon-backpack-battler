// 가방 보드 (DESIGN §4): 가방 조각과 물건 배치, 회전, 겹침, 보관함, 기술 4가지 제한, 스냅샷 변환.
// 순수 함수. 상태를 바꾸는 함수는 새 상태를 돌려준다: { ok: true, board } 또는 { ok: false, error }.
//
// board = {
//   bags:    [{ uid, id: 'bag_base', x, y, rot }],            보드 위 가방 조각
//   items:   [{ uid, id: 'move:ember' | 'item:charcoal', x, y, rot }],  보드 위 물건 (가방 밖이면 전투에 안 나감)
//   storage: [{ uid, id, rot } | null] × STORAGE_SLOTS,          보관함 (가방 조각도 둘 수 있음)
//   nextUid,
// }
import { BOARD_W, BOARD_H, MAX_MOVES, STORAGE_SLOTS } from '../config.js';
import { cellsOf, key } from '../sim/snapshot.js';

export const MSG_MOVE_LIMIT = `기술은 ${MAX_MOVES}개까지예요. 하나를 빼거나 팔아 주세요`;
export const MSG_SAME_MOVE = '같은 기술은 하나만 넣을 수 있어요';

const isBagId = (id) => id.startsWith('bag_');
const onBoard = ([x, y]) => x >= 0 && y >= 0 && x < BOARD_W && y < BOARD_H;
const cellsOfThing = (t) => cellsOf(t.id, t.x, t.y, t.rot);

// 시작 보드: 3×3 기본 가방 하나를 가운데에
export function createBoard() {
  return {
    bags: [{ uid: 1, id: 'bag_base', x: 3, y: 2, rot: 0 }],
    items: [],
    storage: Array(STORAGE_SLOTS).fill(null),
    nextUid: 2,
  };
}

function bagCellSet(board) {
  return new Set(board.bags.flatMap((b) => cellsOfThing(b).map(key)));
}

// 모든 칸이 가방 위에 있으면 전투에 참여한다
export function isActive(board, item, bagCells = bagCellSet(board)) {
  return cellsOfThing(item).every((c) => bagCells.has(key(c)));
}

export function activeItems(board) {
  const bagCells = bagCellSet(board);
  return board.items.filter((it) => isActive(board, it, bagCells));
}

export const activeMoves = (board) => activeItems(board).filter((it) => it.id.startsWith('move:'));

// 물건이 없는 가방 칸 수 (상점 가방 조각 비율, §12.2)
export function freeBagCells(board) {
  const used = new Set(board.items.flatMap((it) => cellsOfThing(it).map(key)));
  return [...bagCellSet(board)].filter((k) => !used.has(k)).length;
}

// 가방 안팎, 보관함 어디든 가진 물건 id 목록 (상점에서 이미 가진 기술을 빼는 데 쓴다)
export function ownedIds(board) {
  return [...board.bags, ...board.items, ...board.storage.filter(Boolean)].map((t) => t.id);
}

function find(board, uid) {
  for (const list of ['bags', 'items']) {
    const i = board[list].findIndex((t) => t.uid === uid);
    if (i >= 0) return { list, i, thing: board[list][i] };
  }
  const i = board.storage.findIndex((t) => t?.uid === uid);
  return i >= 0 ? { list: 'storage', i, thing: board.storage[i] } : null;
}

function detach(board, uid) {
  const loc = find(board, uid);
  if (loc.list === 'storage') board.storage[loc.i] = null;
  else board[loc.list].splice(loc.i, 1);
  return loc;
}

// 보드 전체 검사: 겹침, 보드 밖, 기술 4가지 제한
function check(board) {
  const used = new Set();
  for (const b of board.bags) {
    const cells = cellsOfThing(b);
    if (!cells.every(onBoard)) return '보드 밖에는 놓을 수 없어요';
    for (const c of cells) {
      if (used.has(key(c))) return '가방끼리 겹쳐요';
      used.add(key(c));
    }
  }
  used.clear();
  for (const it of board.items) {
    const cells = cellsOfThing(it);
    if (!cells.every(onBoard)) return '보드 밖에는 놓을 수 없어요';
    for (const c of cells) {
      if (used.has(key(c))) return '다른 물건과 겹쳐요';
      used.add(key(c));
    }
  }
  const moves = activeMoves(board).map((m) => m.id);
  if (new Set(moves).size !== moves.length) return MSG_SAME_MOVE;
  if (moves.length > MAX_MOVES) return MSG_MOVE_LIMIT;
  return null;
}

// 새 물건(상점에서 산 것 등)을 놓는다. target: { to: 'board', x, y, rot } | { to: 'storage', slot }
// 진화 도구처럼 가방에 놓을 수 없는 물건은 보관함에만. extra: 물건에 같이 저장할 값 (예: { price })
export function add(board, id, target, extra = {}) {
  if (target.to === 'board' && !isBagId(id) && !cellsOf(id, 0, 0)) return { ok: false, error: '가방에 놓을 수 없는 물건이에요' };
  const next = structuredClone(board);
  const uid = next.nextUid++;
  const r = put(next, { ...extra, uid, id, rot: 0 }, null, target);
  return r.ok ? { ...r, uid } : r;
}

// 가진 물건을 옮기거나 돌린다
export function place(board, uid, target) {
  const next = structuredClone(board);
  if (!find(next, uid)) return { ok: false, error: '없는 물건이에요' };
  const { list, thing } = detach(next, uid);
  return put(next, thing, list, target);
}

// thing을 target에 놓고 전체 검사. from: 원래 있던 목록 ('bags'면 보드 위 가방을 옮기는 것)
// 가방 조각을 옮기면 그 위에 (모든 칸이) 올라간 물건도 같이 옮겨진다.
function put(next, thing, from, target) {
  const bag = isBagId(thing.id);
  if (target.to === 'storage') {
    const slot = target.slot;
    if (!(slot >= 0 && slot < STORAGE_SLOTS) || next.storage[slot]) return { ok: false, error: '보관함 칸이 비어 있지 않아요' };
    const { x, y, ...rest } = thing;
    next.storage[slot] = rest;
    // 가방 조각을 보관함에 넣으면 위의 물건은 보드에 남는다 (가방 밖 = 전투 불참)
  } else {
    if (!isBagId(thing.id) && !cellsOf(thing.id, 0, 0)) return { ok: false, error: '가방에 놓을 수 없는 물건이에요' };
    const moved = { ...thing, x: target.x, y: target.y, rot: target.rot ?? thing.rot };
    if (bag && from === 'bags') {
      const old = new Set(cellsOfThing(thing).map(key));
      const carried = next.items.filter((it) => cellsOfThing(it).every((c) => old.has(key(c))));
      if (carried.length && moved.rot !== thing.rot) return { ok: false, error: '물건이 올라간 가방은 돌릴 수 없어요. 물건을 먼저 빼 주세요' };
      for (const it of carried) {
        it.x += moved.x - thing.x;
        it.y += moved.y - thing.y;
      }
    }
    next[bag ? 'bags' : 'items'].push(moved);
  }
  const error = check(next);
  return error ? { ok: false, error } : { ok: true, board: next };
}

// id를 놓을 수 있는 첫 자리 (위→아래, 왼→오른쪽, 회전 0~3). 없으면 null
export function findSpot(board, id) {
  for (let rot = 0; rot < 4; rot++) {
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const target = { to: 'board', x, y, rot };
        if (add(board, id, target).ok) return target;
      }
    }
  }
  return null;
}

// 판매 등으로 없앤다
export function remove(board, uid) {
  const next = structuredClone(board);
  if (!find(next, uid)) return { ok: false, error: '없는 물건이에요' };
  detach(next, uid);
  return { ok: true, board: next };
}

// 전투 입력 스냅샷 (§11.4): 가방 조각 전부 + 가방 위 물건만
export function toSnapshot(board, { species, ability, round }) {
  const strip = ({ id, x, y, rot }) => ({ id, x, y, rot });
  return { v: 1, species, ability, round, bags: board.bags.map(strip), items: activeItems(board).map(strip) };
}
