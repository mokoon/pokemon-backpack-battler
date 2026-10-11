// 세이브: localStorage (상점 단계마다 자동), 내보내기/불러오기 (DESIGN §1, §16)
import { MOVES } from '../data/moves.js';
import { GRADE_PRICE } from '../config.js';

const KEY = 'pbb-save-v1';

// 업데이트로 쓸 수 없게 된 기술(제외 기술)이 세이브에 있으면 빼고 일반 등급 값을 돌려준다 (제외 기술은 등급이 없음)
function migrate(run) {
  if (!run?.board) return run;
  const bad = (t) => t?.id.startsWith('move:') && (!MOVES[t.id.slice(5)] || MOVES[t.id.slice(5)].excluded);
  const removed = [...run.board.items, ...run.board.storage].filter(bad);
  if (!removed.length) return run;
  const refund = removed.length * GRADE_PRICE.common;
  return {
    ...run,
    gold: run.gold + refund,
    board: { ...run.board, items: run.board.items.filter((t) => !bad(t)), storage: run.board.storage.map((t) => (bad(t) ? null : t)) },
    shop: { ...run.shop, slots: run.shop.slots.map((s) => (bad(s) ? null : s)) },
  };
}

export function loadSave() {
  try {
    const run = JSON.parse(localStorage.getItem(KEY));
    return run && run.phase ? migrate(run) : null;
  } catch {
    return null;
  }
}

// 진행 중인 런만 저장한다. 끝난 런(over, cleared)은 지운다
export function writeSave(run) {
  try {
    if (!run || run.phase === 'over' || run.phase === 'cleared') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 게임은 계속된다
  }
}

// 내보내기: 런 JSON 문자열
export const exportRun = (run) => JSON.stringify(run);

// 불러오기: 문자열 → run (형식이 이상하면 null)
export function importRun(text) {
  try {
    const run = JSON.parse(text);
    return run && run.seed !== undefined && run.board && run.shop && run.phase ? migrate(run) : null;
  } catch {
    return null;
  }
}
