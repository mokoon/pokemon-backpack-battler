// 계통별 기록 (DESIGN §16): localStorage에 플레이 수, 클리어 수, 최고 승수, 이로치로 플레이했는지
import { POKEMON } from '../data/pokemon.js';

const KEY = 'pbb-records-v1';

// 계통의 첫 단계 (아기 포켓몬이 있으면 아기)
export const lineOf = (species) => (POKEMON[species].evolvesFrom ? lineOf(POKEMON[species].evolvesFrom) : species);

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

// 끝난 런 하나를 기록한다
export function recordRun(run) {
  const all = loadRecords();
  const line = lineOf(run.species);
  const r = all[line] ?? { plays: 0, clears: 0, best: 0, shiny: false };
  all[line] = {
    plays: r.plays + 1,
    clears: r.clears + (run.phase === 'cleared'),
    best: Math.max(r.best, run.wins),
    shiny: r.shiny || !!run.shiny,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 저장소를 못 쓰면 기록만 안 남는다
  }
}
