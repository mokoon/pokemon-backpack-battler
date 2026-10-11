// 시드 난수 (mulberry32). 시뮬레이터 안에서는 이것만 쓴다.
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),     // 0 ~ n-1
    chance: (p) => next() < p,              // p: 0~1
  };
}

// 여러 정수를 섞어 시드 하나로 (런 시드 + 라운드 등). 같은 입력이면 같은 값
export function hashSeed(...nums) {
  let h = 2166136261;
  for (const n of nums) {
    h = Math.imul(h ^ (n >>> 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
