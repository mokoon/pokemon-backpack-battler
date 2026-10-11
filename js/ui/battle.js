// 전투 화면 (DESIGN §16): 전투는 simulate가 한 번에 계산하고, 화면은 이벤트 로그를 재생만 한다 (§11.1).
import { h } from './dom.js';
import { loadSprite, SpritePlayer } from './sprites.js';
import { sfx } from './audio.js';
import { loadSettings } from './settings.js';
import { eventText } from './log.js';
import { STATUS_NAME, STATUS_COLOR, STAT_NAME, WEATHER_NAME, TYPE_COLOR, pokemonName, moveName, abilityName, abilityDesc, thingColor, lvTag } from './labels.js';
import { portrait } from './sprites.js';
import { typeChips } from './select.js';
import { thingIcon } from './shop.js';
import { recordRun } from './records.js';
import { simulate, makeFighter } from '../sim/battle.js';
import { generateOpponent } from '../game/bot.js';
import { toSnapshot, battleSeed, recordBattle } from '../game/run.js';
import { MOVES } from '../data/moves.js';
import { POKEMON } from '../data/pokemon.js';
import { BOARD_W, BOARD_H, PREVIEW_MS } from '../config.js';
import { cellsOf, key } from '../sim/snapshot.js';

const SPEEDS = [1, 2, 4];

// 기술별 충전 게이지: 사용 시각 사이를 선형으로 잇는다 (화면 표시용 어림)
function chargeTracks(fighter, events, side) {
  return fighter.moves.map((m) => {
    const uses = events.filter((e) => e.type === 'use' && e.side === side && e.move === m.id).map((e) => e.t);
    const period = m.coolMs / fighter.speedRate;
    return { id: m.id, lv: m.lv ?? 0, init: Math.min(1, m.charge), uses, period };
  });
}
function chargeAt(track, t) {
  let prev = null, next = null;
  for (const u of track.uses) { if (u <= t) prev = u; else { next = u; break; } }
  if (prev === null) {
    const end = next ?? (1 - track.init) * track.period;
    return Math.min(1, track.init + (1 - track.init) * (t / Math.max(1, end)));
  }
  const end = next ?? prev + track.period;
  return Math.min(1, (t - prev) / Math.max(1, end - prev));
}

// 상대 가방 축소판 (미리보기용, 조작 없음)
function miniBoard(snap, cell = 26) {
  const pos = (x, y) => ({ left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px` });
  const grid = [];
  for (let y = 0; y < BOARD_H; y++) for (let x = 0; x < BOARD_W; x++) grid.push(h('div', { class: 'grid-cell', style: pos(x, y) }));
  const bags = snap.bags.flatMap((b) => cellsOf(b.id, b.x, b.y, b.rot).map(([x, y]) => h('div', { class: `bag-cell ${b.id}`, style: pos(x, y) })));
  const things = snap.items.flatMap((it) => {
    const cells = cellsOf(it.id, it.x, it.y, it.rot);
    const own = new Set(cells.map(key));
    const edge = (x, y) => (own.has(key([x, y])) ? '0' : '2px');
    const anchor = cells.reduce((a, c) => (c[1] < a[1] || (c[1] === a[1] && c[0] < a[0]) ? c : a));
    return cells.map(([x, y]) => h('div', {
      class: `thing-cell ${it.id.startsWith('move:') ? 'is-move' : 'is-item'}`,
      style: { ...pos(x, y), background: thingColor(it.id) ?? '', borderWidth: `${edge(x, y - 1)} ${edge(x + 1, y)} ${edge(x, y + 1)} ${edge(x - 1, y)}` },
    }, x === anchor[0] && y === anchor[1] ? [thingIcon(it.id), it.lv ? h('span', { class: 'lv-badge' }, lvTag(it.id, it.lv)) : null] : null));
  });
  return h('div', { class: 'board mini-board', style: { width: `${BOARD_W * cell}px`, height: `${BOARD_H * cell}px` } }, grid, bags, things);
}

export function render(root, app) {
  const run = app.run;
  const mine = toSnapshot(run);
  const opp = generateOpponent(run, loadSettings().difficulty);
  const result = simulate(mine, opp, battleSeed(run));
  const events = result.events;
  const fighters = { A: makeFighter('A', mine), B: makeFighter('B', opp) };
  const tracks = { A: chargeTracks(fighters.A, events, 'A'), B: chargeTracks(fighters.B, events, 'B') };
  const who = { A: pokemonName(mine.species), B: `${opp.boss ? '보스' : '상대'} ${pokemonName(opp.species)}` };
  const maxHp = events[0].maxHp;

  // 재생 상태
  const state = {
    hp: { ...events[0].hp }, status: { A: {}, B: {} }, stages: { A: {}, B: {} }, weather: null,
    t: 0, next: 1, speed: Number(sessionStorage.getItem('pbb-speed')) || 1, done: false, preview: true,
  };

  // ---------- 화면 ----------
  const canvases = { A: h('canvas', { width: 192, height: 160, class: 'sprite' }), B: h('canvas', { width: 192, height: 160, class: 'sprite' }) };
  const players = { A: new SpritePlayer(canvases.A, 'right'), B: new SpritePlayer(canvases.B, 'left') };
  loadSprite(mine.species, run.shiny).then((s) => s && players.A.set(s));
  loadSprite(opp.species).then((s) => s && players.B.set(s));

  const hpFill = { A: h('i'), B: h('i') };
  const hpText = { A: h('span'), B: h('span') };
  const statusBox = { A: h('div', { class: 'status-row' }), B: h('div', { class: 'status-row' }) };
  const gauges = { A: [], B: [] };
  const weatherEl = h('div', { class: 'weather' });
  const logEl = h('div', { class: 'battle-log' });
  const stageEl = h('div', { class: 'stage' });
  const speedBtn = h('button', { onclick: () => { state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length]; sessionStorage.setItem('pbb-speed', state.speed); speedBtn.textContent = `×${state.speed}`; } }, `×${state.speed}`);
  const skipBtn = h('button', { onclick: () => finish(true) }, '건너뛰기');
  const endBox = h('div', { class: 'battle-end' });

  const side = (s) => {
    return h('div', { class: `fighter fighter-${s}` },
      h('div', { class: 'fighter-name' }, h('b', {}, who[s]), h('small', {}, ` 특성 ${abilityName((s === 'A' ? mine : opp).ability)}`)),   // 경제 특성도 이름은 보이게
      h('div', { class: 'hp' }, hpFill[s], hpText[s]),
      statusBox[s],
      h('div', { class: 'gauges' }, tracks[s].map((tr) => {
        const bar = h('i', { style: { background: TYPE_COLOR[MOVES[tr.id]?.type] ?? '#aaa' } });
        gauges[s].push({ tr, bar });
        return h('div', { class: 'gauge' }, h('span', {}, moveName(tr.id) + lvTag(`move:${tr.id}`, tr.lv)), h('span', { class: 'gauge-bar' }, bar));
      })));
  };

  stageEl.append(h('div', { class: 'stage-slot' }, canvases.A), h('div', { class: 'stage-slot' }, canvases.B));
  root.append(h('div', { class: 'battle-screen' },
    h('div', { class: 'battle-top' }, h('span', {}, `${run.round}라운드`), weatherEl, h('span', { class: 'controls' }, speedBtn, skipBtn)),
    stageEl,
    h('div', { class: 'fighters' }, side('A'), side('B')),
    endBox,
    logEl));

  // ---------- 전투 전 상대 미리보기 (§16): PREVIEW_MS 동안 보여 주고 재생 시작, 눌러서 건너뛰기 ----------
  const mon = POKEMON[opp.species];
  const preview = h('div', { class: 'overlay preview', onclick: () => closePreview() },
    h('div', { class: 'dialog' },
      h('h3', {}, opp.boss ? '최종 보스!' : `${run.round}라운드 상대`),
      h('div', { class: 'detail-head' }, portrait(opp.species),
        h('div', {}, h('h2', {}, `${opp.boss ? '보스 ' : ''}${pokemonName(opp.species)}`), typeChips(mon.types),
          h('div', { title: abilityDesc(opp.ability) }, `특성 ${abilityName(opp.ability)}`))),
      miniBoard(opp),
      h('p', {}, '기술: ', fighters.B.moves.map((m) => moveName(m.id)).join(', ')),
      h('div', { class: 'preview-bar' }, h('i', { style: { animationDuration: `${PREVIEW_MS}ms` } })),
      h('small', {}, '누르면 바로 시작')));
  root.append(preview);
  const previewTimer = setTimeout(() => closePreview(), PREVIEW_MS);
  function closePreview() {
    if (!state.preview) return;
    state.preview = false;
    clearTimeout(previewTimer);
    preview.remove();
    last = performance.now();
  }

  const floatText = (s, text, cls) => {
    const el = h('div', { class: `float ${cls} float-${s}` }, text);
    stageEl.append(el);
    setTimeout(() => el.remove(), 900);
  };

  const drawBars = () => {
    for (const s of ['A', 'B']) {
      const r = Math.max(0, state.hp[s]) / maxHp[s];
      hpFill[s].style.width = `${r * 100}%`;
      hpFill[s].className = r > 0.5 ? '' : r > 0.25 ? 'mid' : 'low';
      hpText[s].textContent = `${Math.max(0, state.hp[s])} / ${maxHp[s]}`;
      for (const g of gauges[s]) g.bar.style.width = `${chargeAt(g.tr, state.t) * 100}%`;
    }
  };
  const drawStatus = (s) => {
    const chips = [];
    for (const [k, n] of Object.entries(state.status[s])) if (n > 0) chips.push(h('span', { class: 'chip', style: { background: STATUS_COLOR[k] } }, `${STATUS_NAME[k]} ${n}`));
    for (const [k, n] of Object.entries(state.stages[s])) if (n) chips.push(h('span', { class: 'chip stage-chip' }, `${STAT_NAME[k]} ${n > 0 ? '+' : ''}${n}`));
    statusBox[s].replaceChildren(...chips);
  };

  // 이벤트 하나 반영 (animate: 애니메이션과 글자 효과까지)
  const apply = (e, animate) => {
    const text = eventText(e, who, maxHp);
    if (text) logEl.append(h('div', { class: e.type === 'use' ? 'log-use' : '' }, `${(e.t / 1000).toFixed(1)}  ${text}`));
    if ('hp' in e && e.side && typeof e.hp === 'number') {
      const target = e.type === 'hit' ? (e.side === 'A' ? 'B' : 'A') : e.side;
      state.hp[target] = e.hp;
    }
    switch (e.type) {
      case 'use': {
        const cls = MOVES[e.move]?.class ?? 'physical';
        if (animate) { players[e.side].play(cls === 'physical' ? 'Attack' : cls === 'special' ? 'SpAttack' : 'Charge'); sfx('use'); }
        break;
      }
      case 'hit': {
        const target = e.side === 'A' ? 'B' : 'A';
        if (animate) {
          players[target].play('Hurt');
          sfx(e.crit ? 'crit' : e.eff > 1 ? 'super' : e.eff < 1 ? 'weak' : 'hit');
          floatText(target, e.eff === 0 ? '무효' : `-${e.damage}${e.crit ? '!' : ''}`, e.eff > 1 ? 'super' : e.eff === 0 ? 'immune' : 'dmg');
        }
        break;
      }
      case 'miss': if (animate) { floatText(e.side === 'A' ? 'B' : 'A', '빗나감', 'immune'); sfx('miss'); } break;
      case 'heal': if (animate) { floatText(e.side, `+${e.amount}`, 'heal'); sfx('heal'); } break;
      case 'dot': case 'recoil': case 'confused': if (animate) floatText(e.side, `-${e.damage}`, 'dmg'); break;
      case 'status':
        if (animate && e.stacks > (state.status[e.side][e.status] ?? 0)) sfx('status');
        state.status[e.side][e.status] = e.stacks;
        drawStatus(e.side);
        break;
      case 'stage': if (animate && e.change) sfx('stage'); state.stages[e.side][e.stat] = e.stage; drawStatus(e.side); break;
      case 'item': case 'ability': if (animate) sfx('item'); break;
      case 'weather': state.weather = e.weather; weatherEl.textContent = e.weather ? `날씨: ${WEATHER_NAME[e.weather]}` : ''; break;
      case 'end': break;
    }
  };

  let finished = false;
  function finish(skip) {
    if (finished) return;
    closePreview();
    if (skip) {
      while (state.next < events.length) apply(events[state.next++], false);
      state.t = result.durationMs;
    }
    finished = true;
    const end = events.at(-1);
    const outcome = end.winner === 'A' ? 'win' : end.winner === 'B' ? 'loss' : 'draw';
    for (const s of ['A', 'B']) if (state.hp[s] <= 0) players[s].play('Faint');
    sfx(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'faint');
    drawBars();
    skipBtn.disabled = true;
    // 결과 화면용 통계 (UI가 run에 덧붙이는 값)
    const stats = structuredClone(run.stats ?? { damage: {}, stacks: 0, battles: 0 });
    const prev = {};
    for (const e of events) {
      if (e.type === 'hit' && e.side === 'A') stats.damage[e.move] = (stats.damage[e.move] ?? 0) + e.damage;
      if (e.type === 'status' && e.side === 'B') {   // 상대에게 쌓은 상태이상 중첩 (늘어난 만큼)
        stats.stacks += Math.max(0, e.stacks - (prev[e.status] ?? 0));
        prev[e.status] = e.stacks;
      }
    }
    stats.battles += 1;
    const label = { win: '승리!', loss: '패배…', draw: '무승부' }[outcome];
    endBox.replaceChildren(
      h('div', { class: `banner ${outcome}` }, label, h('small', {}, ` ${(result.durationMs / 1000).toFixed(1)}초${end.reason === 'time' ? ' (시간 제한)' : ''}`)),
      h('button', {
        class: 'primary wide',
        onclick: () => {
          const next = recordBattle({ ...run, stats }, outcome).run;
          if (next.phase === 'over' || next.phase === 'cleared') recordRun(next);
          app.setRun(next);
          app.go(next.phase === 'shop' || next.phase === 'ability' ? 'shop' : 'result');
        },
      }, '계속'));
    endBox.scrollIntoView({ block: 'nearest' });
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- 재생 루프 ----------
  let last = performance.now();
  let raf = 0;
  const frame = (now) => {
    const dt = Math.min(100, now - last);
    last = now;
    if (!finished && !state.preview) {
      state.t = Math.min(result.durationMs, state.t + dt * state.speed);
      let any = false;
      while (state.next < events.length && events[state.next].t <= state.t) { apply(events[state.next++], true); any = true; }
      if (any) logEl.scrollTop = logEl.scrollHeight;
      if (state.next >= events.length) finish(false);
    }
    for (const s of ['A', 'B']) { players[s].advance((dt / 1000) * 60 * (finished ? 1 : state.speed)); players[s].draw(); }
    drawBars();
    raf = requestAnimationFrame(frame);
  };
  drawStatus('A');
  drawStatus('B');
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); clearTimeout(previewTimer); };
}
