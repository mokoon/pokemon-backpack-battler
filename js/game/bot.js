// 싱글 플레이 상대 봇 (DESIGN §14, §15.2). run.js API로 플레이어와 같은 상점·경제 규칙을 따른다.
// 구매 판단은 가치 / 가격 탐욕법, 배치는 인접 점수가 가장 높은 곳. 전략(strategy)은 가치에 배율을 준다.
import { STARTER_POOL, BOSS_DIFFICULTY, UPGRADE, BOARD_W, BOARD_H, MAX_MOVES, BOT_GOLD_MULT, BOT_MAX_REFRESH, BOT_REFRESH_RESERVE, BOT_SAME_TYPE_MULT, BOT_NORMAL_MULT, ITEM_STACK_WEIGHTS } from '../config.js';
import { MOVES } from '../data/moves.js';
import { POKEMON } from '../data/pokemon.js';
import { TYPE_CHART } from '../data/typechart.js';
import { ITEM_RULES } from '../rules/items.js';
import { createRng, hashSeed } from '../sim/rng.js';
import { cellsOf, key } from '../sim/snapshot.js';
import * as bag from './bag.js';
import * as runLib from './run.js';
import { roundGold, refreshCost } from './shop.js';

// 전략 봇 (§15.2). 'normal'은 일반 봇
export const STRATEGIES = ['normal', 'noEvolveMid', 'noEvolveBase', 'stacking', 'stall', 'oneShot', 'spam', 'status', 'speed'];

const SPLIT = (id) => id.split(':');
const moveOf = (id) => MOVES[SPLIT(id)[1]];
const ruleOf = (id) => ITEM_RULES[SPLIT(id)[1]];

// ---------- 가치 (단위: 대략 "초당 위력") ----------

function attackPS(move, species) {
  if (move.class === 'status') return 0;
  return move.perSec * (POKEMON[species].types.includes(move.type) ? 1.25 : 1);
}

const STATUS_FAMILY_VALUE = {   // 전체 공격 초당 위력에 곱하는 비율, 또는 고정값(fixed)
  boost1: 0.15, boost2: 0.3, lower: 0.1, ailment: 0.25, sleep: 0.25, confuse: 0.2,
  heal: { fixed: 6 }, protect: { fixed: 4 }, screen: { fixed: 5 }, 'aurora-veil': { fixed: 0 }, weather: { fixed: 2 },
  substitute: { fixed: 3 }, 'leech-seed': { fixed: 5 }, taunt: { fixed: 2 }, haze: { fixed: 2 },
};
// 날씨가 있어야 효과가 나는 특성 → 그 날씨를 부르는 기술
const ABILITY_WEATHER = {
  'sand-veil': [MOVES.sandstorm], chlorophyll: [MOVES['sunny-day']], 'solar-power': [MOVES['sunny-day']], 'rain-dish': [MOVES['rain-dance']],
};
const STRATEGY_FAMILY = {
  stacking: ['boost1', 'boost2'], stall: ['heal', 'protect', 'screen', 'substitute', 'leech-seed', 'lower'],
  status: ['ailment', 'sleep', 'confuse', 'leech-seed'],
};

function moveValue(move, ctx) {
  const { species, strategy, totalPS } = ctx;
  let v;
  if (move.class === 'status') {
    const f = STATUS_FAMILY_VALUE[move.family];
    v = typeof f === 'number' ? f * Math.max(totalPS, 10) : f.fixed;
    if (STRATEGY_FAMILY[strategy]?.includes(move.family)) v *= 3;
    if (ABILITY_WEATHER[ctx.ability]?.includes(move)) v *= 4;   // 내 특성을 살리는 날씨
  } else {
    v = attackPS(move, species);
    // 같은 타입 공격기가 이미 있으면 덜 쳐준다 (상성 하나에 막히지 않게)
    if (ctx.moves.some((m) => m !== move && m.class !== 'status' && m.type === move.type)) v *= BOT_SAME_TYPE_MULT;
    if (move.type === 'normal' && !POKEMON[species].types.includes('normal')) v *= BOT_NORMAL_MULT;
    if (move.accuracy && ctx.ability !== 'no-guard') v *= move.accuracy / 100;   // 노가드면 반드시 맞음
    if (strategy === 'status' && move.meta?.ailmentChance > 0) v *= 1.5;
    if (strategy === 'speed' && move.cool <= 3.2) v *= 1.5;
    if (strategy === 'oneShot' && move.tiles >= 4) v *= 1.3;
  }
  return v;
}

const DEFENSIVE = {   // 전체 효과·방어 도구의 고정 가치
  leftovers: 5, shellBell: 2, focusSash: 4, assaultVest: 4, rockyHelmet: 3, hpBerry: 3, lumBerry: 2, pinchBerry: 2,
  whiteHerb: 1, covertCloak: 2,
};
const STALL_ITEMS = ['leftovers', 'blackSludge', 'shellBell', 'hpBerry', 'assaultVest', 'rockyHelmet', 'lightClay', 'eviolite'];

function itemValue(id, ctx) {
  const { moves, species, strategy, board } = ctx;
  const rule = ruleOf(id);
  const attacks = moves.filter((m) => m.class !== 'status');
  const best = (pred) => Math.max(0, ...attacks.filter(pred).map((m) => attackPS(m, species)));
  const total = attacks.reduce((s, m) => s + attackPS(m, species), 0);
  const copies = bag.activeItems(board).filter((it) => it.id === id).length;
  const weight = strategy === 'spam' ? 1 : ITEM_STACK_WEIGHTS[Math.min(copies, ITEM_STACK_WEIGHTS.length - 1)];
  const canEvolve = runLib.evolutions(species).length > 0;
  let v;
  switch (rule.kind) {
    case 'typeBoost': v = 0.2 * best((m) => m.type === rule.type) * (strategy === 'oneShot' ? 2 : 1); break;
    case 'choice': v = 0.4 * best((m) => m.class === rule.cls) - 0.05 * total; break;
    case 'scarf': v = 0.3 * best(() => true) - 0.03 * total; break;
    case 'wideLens': v = 0.1 * best((m) => m.accuracy && m.accuracy < 100); break;
    case 'scopeLens': v = 0.08 * best(() => true); break;
    case 'quickClaw': v = 0.05 * best(() => true); break;
    case 'lifeOrb': v = 0.14 * total * weight; break;
    case 'expertBelt': v = 0.06 * total * weight; break;
    case 'blackSludge': v = POKEMON[species].types.includes('poison') ? 6 * weight : -5; break;
    case 'lightClay': v = moves.some((m) => m.family === 'screen') ? 3 : 0; break;
    case 'vitamin': {   // 주로 쓰는 공격 능력치면 높게, 나머지는 조금 (§10.4)
      const phys = attacks.filter((m) => m.class === 'physical').reduce((s, m) => s + attackPS(m, species), 0);
      const spec = total - phys;
      v = { atk: 0.15 * phys, spa: 0.15 * spec, hp: 3, def: 1.5, spd: 1.5, spe: 0.08 * total }[rule.stat];
      break;
    }
    case 'eviolite': v = canEvolve ? 10 * weight * (strategy.startsWith('noEvolve') ? 2 : 1) : 0; break;
    case 'resistBerry': {   // 내 약점일 때만 (4배면 더)
      const f = POKEMON[species].types.reduce((x, t) => x * (TYPE_CHART[rule.type]?.[t] ?? 1), 1);
      v = (f >= 4 ? 6 : f >= 2 ? 3 : 0) * weight;
      break;
    }
    case 'everstone': v = strategy.startsWith('noEvolve') && canEvolve ? 8 : -10; break;
    default: v = (DEFENSIVE[rule.kind] ?? 0) * weight;
  }
  if (strategy === 'stall' && STALL_ITEMS.includes(rule.kind)) v *= 2.5;
  if (strategy === 'speed' && ['scarf', 'quickClaw'].includes(rule.kind)) v *= 2;
  return v;
}

function bagValue(id, ctx) {
  const cells = cellsOf(id, 0, 0).length;
  const free = bag.freeBagCells(ctx.board);
  let v = cells * (free <= 3 ? 3 : free <= 6 ? 1 : 0.3);
  if (id.startsWith('bag_type_')) v += 0.1 * ctx.moves.filter((m) => m.type === id.slice(9)).reduce((s, m) => s + attackPS(m, ctx.species), 0);
  if (id === 'bag_berry') v += ctx.moves.length ? 0 : -1;
  return v;
}

// ---------- 배치 (보드 복제 없이 빠르게) ----------

// 인접했을 때의 시너지 점수: item 하나와 기술 하나
function synergy(itemId, move, species) {
  const rule = ruleOf(itemId);
  const ps = attackPS(move, species);
  switch (rule.kind) {
    case 'typeBoost': return move.type === rule.type ? ps : 0;
    case 'choice': return move.class === rule.cls ? 2 * ps : 0;
    case 'scarf': return 1.5 * Math.max(ps, 5);
    case 'scopeLens': case 'quickClaw': return 0.5 * ps;
    case 'wideLens': return move.accuracy && move.accuracy < 100 ? ps : 0;
    default: return 0;
  }
}

// id를 놓을 가장 좋은 자리 (없으면 null). 물건은 모든 칸이 가방 위여야 한다.
export function bestSpot(board, id, species) {
  const isBag = id.startsWith('bag_');
  const bagCells = new Set(board.bags.flatMap((b) => cellsOf(b.id, b.x, b.y, b.rot).map(key)));
  const owner = new Map();
  for (const it of board.items) for (const c of cellsOf(it.id, it.x, it.y, it.rot)) owner.set(key(c), it);
  const isMove = id.startsWith('move:');
  if (isMove) {
    const act = bag.activeMoves(board);
    if (act.length >= MAX_MOVES || act.some((m) => m.id === id)) return null;
  }
  let best = null;
  for (let rot = 0; rot < (isBag || cellsOf(id, 0, 0).length > 1 ? 4 : 1); rot++) {
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const cells = cellsOf(id, x, y, rot);
        if (!cells.every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < BOARD_W && cy < BOARD_H)) continue;
        let score = 0;
        if (isBag) {
          if (cells.some((c) => bagCells.has(key(c)))) continue;
          // 다른 가방에 붙을수록, 보드 가운데일수록
          for (const [cx, cy] of cells) {
            for (const n of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) if (bagCells.has(key(n))) score++;
            score -= 0.01 * (Math.abs(cx - 4) + Math.abs(cy - 3));
          }
        } else {
          if (!cells.every((c) => bagCells.has(key(c)) && !owner.has(key(c)))) continue;
          const neighbors = new Set();
          for (const [cx, cy] of cells) {
            for (const n of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
              const o = owner.get(key(n));
              if (o && bagCells.has(key(n))) neighbors.add(o);
            }
          }
          for (const o of neighbors) {
            if (isMove && o.id.startsWith('item:')) score += synergy(o.id, moveOf(id), species);
            if (!isMove && o.id.startsWith('move:')) score += synergy(id, moveOf(o.id), species);
          }
          // 효과가 인접과 무관한 도구는 기술 둘레를 비워 두도록 기술에서 멀리
          if (!isMove && score === 0) score -= 0.1 * [...neighbors].filter((o) => o.id.startsWith('move:')).length;
        }
        if (!best || score > best.score) best = { score, target: { to: 'board', x, y, rot } };
      }
    }
  }
  return best?.target ?? null;
}

// ---------- 한 라운드 쇼핑 ----------

const evalCtx = (run, strategy) => {
  const moves = bag.activeMoves(run.board).map((m) => moveOf(m.id));
  return {
    species: run.species, ability: run.ability, strategy, board: run.board, moves,
    totalPS: moves.reduce((s, m) => s + attackPS(m, run.species), 0),
  };
};

const ok = (r, fallback) => (r.ok ? r.run : fallback);

// 진화 도구가 있으면 진화 (미진화 전략은 안 함, noEvolveMid는 중간 단계까지)
function tryEvolve(run, strategy) {
  if (strategy === 'noEvolveBase') return run;
  if (strategy === 'noEvolveMid' && POKEMON[run.species].evolvesFrom && !POKEMON[run.species].baby) return run;
  const i = run.shop.slots.findIndex((s) => s?.evo);
  if (i < 0 || run.shop.slots[i].price > run.gold) return run;
  let next = ok(runLib.buy(run, i, { to: 'evolve' }), run);
  if (next.phase === 'ability') next = ok(runLib.chooseAbility(next, runLib.abilityChoices(next.species)[0].id), next);
  return next;
}

// 산 뒤의 run을 돌려준다. 못 사면 null
function tryBuy(run, i, strategy) {
  const slot = run.shop.slots[i];
  const id = slot.id;
  if ((id.startsWith('move:') && bag.moveLevel(run.board, id) !== null) || ruleOf(id)?.kind === 'vitamin') {   // 강화, 영양제
    const r = runLib.buy(run, i, { to: 'use' });
    return r.ok ? r.run : null;
  }
  let board = run.board;
  let soldGold = 0;
  // 기술이 4개 찼으면 가장 약한 기술을 빼고 넣는다 (§14)
  if (id.startsWith('move:') && bag.activeMoves(board).length >= MAX_MOVES) {
    const ctx = evalCtx(run, strategy);
    const weakest = bag.activeMoves(board).reduce((a, m) => (moveValue(moveOf(m.id), ctx) < moveValue(moveOf(a.id), ctx) ? m : a));
    if (moveValue(moveOf(id), ctx) <= moveValue(moveOf(weakest.id), ctx)) return null;
    const sold = runLib.sell(run, weakest.uid);
    if (!sold.ok) return null;
    soldGold = sold.run.gold - run.gold;
    board = sold.run.board;
  }
  const target = bestSpot(board, id, run.species);
  if (!target) return null;
  const r = runLib.buy({ ...run, board, gold: run.gold + soldGold }, i, target);
  return r.ok ? r.run : null;
}

// 보관함의 가방 조각(진화 보상 등)을 보드에 놓는다
function placeStoredBags(run) {
  for (const t of run.board.storage) {
    if (!t?.id.startsWith('bag_')) continue;
    const target = bestSpot(run.board, t.id, run.species);
    if (target) run = ok(runLib.move(run, t.uid, target), run);
  }
  return run;
}

function shopRound(run, strategy) {
  for (let refreshes = 0; ; refreshes++) {
    run = placeStoredBags(tryEvolve(run, strategy));
    for (;;) {
      const ctx = evalCtx(run, strategy);
      const ranked = run.shop.slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s && !s.evo && s.price <= run.gold)
        .map(({ s, i }) => {
          const id = s.id;
          let v;
          if (id.startsWith('move:') && bag.moveLevel(run.board, id) !== null) {
            v = moveValue(moveOf(id), ctx) * UPGRADE.movePower * 1.5;   // 가진 기술 강화 (§10.3)
          } else if (id.startsWith('move:')) {
            const m = moveOf(id);
            v = moveValue(m, ctx);
            if (ctx.moves.length >= MAX_MOVES) v -= Math.min(...ctx.moves.map((x) => moveValue(x, ctx)));
          } else if (id.startsWith('item:')) v = itemValue(id, ctx);
          else v = bagValue(id, ctx);
          return { i, score: v / s.price };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score || a.i - b.i);
      let bought = null;
      for (const c of ranked) if ((bought = tryBuy(run, c.i, strategy))) break;
      if (!bought) break;
      run = bought;
    }
    if (refreshes >= BOT_MAX_REFRESH || run.gold < refreshCost(run.shop.refreshes) + BOT_REFRESH_RESERVE) return run;
    run = ok(runLib.refresh(run), run);
  }
}

// ---------- 봇 만들기 ----------

// 봇 run 시작: 포켓몬은 시작 후보 풀에서 무작위 (4마리 고르기 없음, §2.2), 특성은 고를 수 있는 첫 번째 (ability로 지정 가능)
export function startBot(seed, species = null, ability = null) {
  const pick = species ?? STARTER_POOL[createRng(hashSeed(seed, 4)).int(STARTER_POOL.length)];
  let run = { ...runLib.createRun(seed), candidates: [pick] };
  run = runLib.choosePokemon(run, pick).run;
  if (run.phase === 'ability') run = runLib.chooseAbility(run, ability ?? runLib.abilityChoices(pick)[0].id).run;
  return run;
}

// 이번 라운드 봇 쇼핑. 난이도는 라운드 골드 배율 (§14)
export function botShop(run, { strategy = 'normal', difficulty = 'normal' } = {}) {
  const extra = Math.round(roundGold(run.round, run.species) * (BOT_GOLD_MULT[difficulty] - 1));
  return shopRound({ ...run, gold: Math.max(0, run.gold + extra) }, strategy);
}

// 라운드 r 상대 봇: 시드 hash(runSeed, r)로 라운드 1부터 r까지 쇼핑을 흉내낸 스냅샷 (§14)
export function generateBot(runSeed, round, opts = {}) {
  let run = startBot(hashSeed(runSeed, round, 5), opts.species, opts.ability);
  for (;;) {
    run = botShop(run, opts);
    if (run.round >= round) return { snapshot: runLib.toSnapshot(run), run };
    run = runLib.recordBattle(run, 'draw').run;   // 무승부로 넘김 (승패가 쇼핑에 영향 없음)
  }
}

// 플레이어 run의 이번 라운드 상대. 9승 상태면 보스 (§2.5): 전설 포켓몬, 첫 번째 특성, 어려움 가방, 종족값 보정(boss)
export function generateOpponent(run, difficulty = 'normal') {
  if (!runLib.isBossRound(run)) return generateBot(run.seed, run.round, { difficulty }).snapshot;
  const species = runLib.bossOf(run.seed);
  const { snapshot } = generateBot(run.seed, run.round, { species, difficulty: BOSS_DIFFICULTY });
  return { ...snapshot, ability: POKEMON[species].abilities[0].id, boss: true };
}
