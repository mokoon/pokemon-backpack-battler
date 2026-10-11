// 런 진행 (DESIGN §2): 포켓몬 선택, 특성, 시작 기술, 라운드와 골드, 상점 조작, 진화, 승/패/무, 종료.
// 순수 함수. 상태를 바꾸는 함수는 { ok: true, run } 또는 { ok: false, error }를 돌려준다.
//
// run = {
//   seed, phase: 'select' | 'ability' | 'shop' | 'over' | 'cleared', started(첫 라운드를 시작했는지),
//   candidates: [도감 번호 × 4], shinies: [이로치 여부 × 4], shiny, species, ability, abilitySlot, startMove, evoUnlockRound,
//   round, gold, wins, losses, draws, history: ['win' | 'loss' | 'draw'],
//   board, shop, rolls(이번 라운드 상점 뽑기 횟수, 난수용), freeRefresh(이번 라운드 남은 무료 새로고침),
// }
import {
  STARTER_POOL, STARTER_CHOICES, BOSS_POOL, SHINY_CHANCE, WIN_TARGET, MAX_LOSSES, evoUnlockByLevel, EVO_UNLOCK_OTHER, EVO_UNLOCK_BABY,
  EVO_PRICE, EVERSTONE_GOLD, ECONOMY_GOLD,
} from '../config.js';
import { POKEMON } from '../data/pokemon.js';
import { createRng, hashSeed } from '../sim/rng.js';
import { ABILITIES, selectable } from '../rules/abilities.js';
import * as bag from './bag.js';
import * as shopLib from './shop.js';

// ---------- 진화 정보 (§2.3) ----------

const children = (species) => Object.keys(POKEMON).map(Number).filter((s) => POKEMON[s].evolvesFrom === species);
const depth = (species) => (POKEMON[species].evolvesFrom ? 1 + depth(POKEMON[species].evolvesFrom) : 0);

// species의 다음 진화들: [{ to, item: 'item:…', unlock, price }]. 진화 도구가 정해지지 않은 진화는 뺀다.
export function evolutions(species) {
  const from = POKEMON[species];
  const prevUnlock = from.evolvesFrom ? Math.min(...evolutions(from.evolvesFrom).filter((e) => e.to === species).map((e) => e.unlock)) : 0;
  return children(species).filter((to) => POKEMON[to].evo?.item).map((to) => {
    const evo = POKEMON[to].evo;
    const final = children(to).length === 0;
    let unlock, price;
    if (from.baby) {
      unlock = EVO_UNLOCK_BABY;
      price = EVO_PRICE.baby;
    } else {
      unlock = evo.item === 'rare-candy' && evo.level ? evoUnlockByLevel(evo.level) : EVO_UNLOCK_OTHER[Math.min(depth(to), 2) - 1];
      price = final ? EVO_PRICE.final : EVO_PRICE.mid;
    }
    return { to, item: `item:${evo.item}`, unlock: Math.max(unlock, prevUnlock + 1), price };
  });
}

// 그 계통에서 가장 이른 해금 라운드 (진화의휘석/변함없는돌이 상점에 나오기 시작하는 라운드)
function firstUnlock(species) {
  const all = [];
  const walk = (s) => evolutions(s).forEach((e) => { all.push(e.unlock); walk(e.to); });
  walk(species);
  return all.length ? Math.min(...all) : Infinity;
}

export const abilityChoices = (species) => POKEMON[species].abilities.filter((a) => selectable(a.id));

const everstoneActive = (board) => bag.activeItems(board).some((it) => it.id === 'item:everstone');

// 지금 상점에 나올 수 있는 진화 도구 (이미 가지고 있으면 안 나옴)
function evoItem(run) {
  const owned = bag.ownedIds(run.board);
  const e = evolutions(run.species).find((x) => x.unlock <= run.round && !owned.includes(x.item));
  return e ? { id: e.item, price: e.price } : null;
}

// ---------- 시작 ----------

export function createRun(seed) {
  const rng = createRng(hashSeed(seed, 0));
  const pool = [...STARTER_POOL];
  const candidates = [];
  while (candidates.length < STARTER_CHOICES && pool.length) candidates.push(pool.splice(rng.int(pool.length), 1)[0]);
  const shinies = candidates.map((_, i) => createRng(hashSeed(seed, i, 7)).chance(SHINY_CHANCE));
  return {
    seed, phase: 'select', started: false, candidates, shinies, shiny: false, species: null, ability: null, abilitySlot: null, startMove: null,
    evoUnlockRound: Infinity, round: 1, gold: 0, wins: 0, losses: 0, draws: 0, history: [],
    board: bag.createBoard(), shop: shopLib.createShop(), rolls: 0, freeRefresh: 0,
  };
}

export function choosePokemon(run, species) {
  if (run.phase !== 'select' || !run.candidates.includes(species)) return { ok: false, error: '고를 수 없는 포켓몬이에요' };
  const startMove = POKEMON[species].startMove;
  const r = bag.add(run.board, `move:${startMove}`, { to: 'board', x: run.board.bags[0].x, y: run.board.bags[0].y, rot: 0 });
  if (!r.ok) return r;
  const shiny = run.shinies?.[run.candidates.indexOf(species)] ?? false;
  let next = { ...run, species, shiny, startMove, board: r.board, evoUnlockRound: firstUnlock(species), phase: 'ability' };
  // 고를 특성이 없으면 "미구현 특성"(효과 없음)으로 바로 시작 (§2.2)
  if (abilityChoices(species).length === 0) next = startRound({ ...next, ability: null, abilitySlot: null });
  return { ok: true, run: next };
}

// 처음 고를 때와 진화 뒤 다시 고를 때 같이 쓴다
export function chooseAbility(run, id) {
  const choice = abilityChoices(run.species).find((a) => a.id === id);
  if (run.phase !== 'ability' || !choice) return { ok: false, error: '고를 수 없는 특성이에요' };
  const next = { ...run, ability: id, abilitySlot: choice.slot };
  return { ok: true, run: next.started ? { ...next, phase: 'shop' } : startRound(next) };
}

// ---------- 라운드 ----------

const shopCtx = (run, rolls) => ({
  rng: createRng(hashSeed(run.seed, run.round, rolls, 1)),
  round: run.round, species: run.species, board: run.board,
  // 진화의휘석/변함없는돌은 아직 진화할 수 있을 때만 (최종 진화 뒤에는 쓸모없음)
  evoUnlocked: run.round >= run.evoUnlockRound && evolutions(run.species).length > 0, evoItem: evoItem(run),
});

function startRound(run) {
  const economy = ABILITIES[run.ability]?.economy;
  let gold = run.gold + shopLib.roundGold(run.round, run.species);
  if (everstoneActive(run.board)) gold += EVERSTONE_GOLD;
  if (economy === 'gold') gold += ECONOMY_GOLD;
  const next = { ...run, phase: 'shop', started: true, gold, rolls: 0, freeRefresh: economy === 'freeRefresh' ? 1 : 0 };
  return { ...next, shop: shopLib.newRound(run.shop, shopCtx(next, 0)) };
}

// 이번 런의 보스 (§2.5): 런 시드로 정한다. 9승 상태의 전투가 보스전
export const bossOf = (seed) => BOSS_POOL[createRng(hashSeed(seed, 6)).int(BOSS_POOL.length)];
export const isBossRound = (run) => run.wins === WIN_TARGET - 1;

export const battleSeed = (run) => hashSeed(run.seed, run.round, 2);

export const toSnapshot = (run) => bag.toSnapshot(run.board, { species: run.species, ability: run.ability, round: run.round });

// 전투 결과 기록 → 다음 라운드 또는 종료
export function recordBattle(run, result) {
  if (run.phase !== 'shop') return { ok: false, error: '상점 단계가 아니에요' };
  const next = {
    ...run,
    wins: run.wins + (result === 'win'),
    losses: run.losses + (result === 'loss'),
    draws: run.draws + (result === 'draw'),
    history: [...run.history, result],
  };
  if (next.wins >= WIN_TARGET) return { ok: true, run: { ...next, phase: 'cleared' } };
  if (next.losses >= MAX_LOSSES) return { ok: true, run: { ...next, phase: 'over' } };
  return { ok: true, run: startRound({ ...next, round: run.round + 1 }) };
}

// ---------- 상점 조작 ----------

const inShop = (run) => (run.phase === 'shop' ? null : { ok: false, error: '상점 단계가 아니에요' });

export function refresh(run) {
  const err = inShop(run);
  if (err) return err;
  const rolls = run.rolls + 1;
  if (run.freeRefresh > 0) {
    const shop = shopLib.rollShop(run.shop, shopCtx(run, rolls));
    return { ok: true, run: { ...run, shop, rolls, freeRefresh: run.freeRefresh - 1 } };
  }
  const r = shopLib.refresh(run.shop, run.gold, shopCtx(run, rolls));
  return r.ok ? { ok: true, run: { ...run, shop: r.shop, gold: r.gold, rolls } } : r;
}

export function toggleLock(run, i) {
  return inShop(run) ?? { ok: true, run: { ...run, shop: shopLib.toggleLock(run.shop, i) } };
}

// 사서 target에 놓는다. 진화 도구는 { to: 'evolve' }(지금 진화) 또는 { to: 'storage', slot }(나중에)
export function buy(run, i, target) {
  const err = inShop(run);
  if (err) return err;
  const r = shopLib.buy(run.shop, i, run.gold);
  if (!r.ok) return r;
  const next = { ...run, shop: r.shop, gold: r.gold };
  if (run.shop.slots[i].evo && target.to === 'evolve') return evolveWith(next, r.id);
  const placed = bag.add(run.board, r.id, target, run.shop.slots[i].evo ? { price: r.price } : {});
  return placed.ok ? { ok: true, run: { ...next, board: placed.board } } : placed;
}

export function move(run, uid, target) {
  const err = inShop(run);
  if (err) return err;
  const r = bag.place(run.board, uid, target);
  return r.ok ? { ok: true, run: { ...run, board: r.board } } : r;
}

// 기술 교체: 가방 안 기술(oldUid)을 보관함 빈 칸으로 옮기고 place(run)으로 새 기술을 놓는다.
// place는 buy/move를 부르는 함수. 둘 중 하나라도 실패하면 아무것도 바뀌지 않는다.
export function replaceMove(run, oldUid, place) {
  const slot = run.board.storage.indexOf(null);
  if (slot < 0) return { ok: false, error: '보관함이 가득 차서 기술을 바꿀 수 없어요' };
  const stashed = move(run, oldUid, { to: 'storage', slot });
  if (!stashed.ok) return stashed;
  return place(stashed.run);
}

export function sell(run, uid) {
  const err = inShop(run);
  if (err) return err;
  const thing = [...run.board.bags, ...run.board.items, ...run.board.storage.filter(Boolean)].find((t) => t.uid === uid);
  if (!thing) return { ok: false, error: '없는 물건이에요' };
  const price = shopLib.sellPrice(thing.id, run.startMove, thing.price);
  if (price === null) return { ok: false, error: '팔 수 없는 가방이에요' };
  const r = bag.remove(run.board, uid);
  return { ok: true, run: { ...run, board: r.board, gold: run.gold + price } };
}

// ---------- 진화 ----------

// 보관함의 진화 도구를 쓴다
export function useEvolution(run, uid) {
  const err = inShop(run);
  if (err) return err;
  const tool = run.board.storage.find((t) => t?.uid === uid);
  if (!tool) return { ok: false, error: '보관함에 없는 도구예요' };
  return evolveWith({ ...run, board: bag.remove(run.board, uid).board }, tool.id);   // 도구를 먼저 빼서 그 칸에 진화 가방
}

function evolveWith(run, itemId) {
  if (everstoneActive(run.board)) return { ok: false, error: '변함없는돌이 가방에 있어서 진화할 수 없어요' };
  const e = evolutions(run.species).find((x) => x.item === itemId && x.unlock <= run.round);
  if (!e) return { ok: false, error: '지금 쓸 수 없는 진화 도구예요' };
  // 진화 보상: 진화 가방 2×3 (보관함 빈 칸, 없으면 보드 빈 곳)
  const slot = run.board.storage.indexOf(null);
  let reward = slot >= 0 ? bag.add(run.board, 'bag_evo', { to: 'storage', slot }) : null;
  if (!reward?.ok) {
    const spot = bag.findSpot(run.board, 'bag_evo');
    reward = spot ? bag.add(run.board, 'bag_evo', spot) : { board: run.board };
  }
  // 특성: 같은 슬롯의 특성이 그대로면 유지, 아니면 다시 고른다 (§2.3)
  const same = POKEMON[e.to].abilities.find((a) => a.slot === run.abilitySlot);
  const keep = same && same.id === run.ability;
  const next = { ...run, species: e.to, board: reward.board };
  if (keep || abilityChoices(e.to).length === 0) {
    return { ok: true, run: keep ? next : { ...next, ability: null, abilitySlot: null } };
  }
  return { ok: true, run: { ...next, phase: 'ability' } };
}
