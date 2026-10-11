// 상점/가방 화면 (DESIGN §16): 위쪽 가방 보드 9×7, 아래쪽 보관함과 상점 5칸.
// 조작: 드래그(마우스·터치), 회전(R키·우클릭·회전 버튼), 판매(상점 영역으로 드래그 또는 판매 버튼), 누르면 상세 정보.
import { h, dialog, toast } from './dom.js';
import { portrait } from './sprites.js';
import { typeChips } from './select.js';
import {
  GRADE, isStab, evoTarget, josa, thingName, thingGrade, thingColor, describe, pokemonName, abilityName, abilityDesc,
} from './labels.js';
import { BOARD_W, BOARD_H, MAX_MOVES, MAX_LOSSES, WIN_TARGET, LEFTOVER_GOLD_WARN } from '../config.js';
import { cellsOf, key } from '../sim/snapshot.js';
import { POKEMON } from '../data/pokemon.js';
import { ITEM_RULES } from '../rules/items.js';
import { MOVES } from '../data/moves.js';
import { LEARNSETS } from '../data/learnsets.js';
import { activeMoves, isActive } from '../game/bag.js';
import { refreshCost, sellPrice } from '../game/shop.js';
import * as runLib from '../game/run.js';

// 아이콘: 도구는 그림(없으면 글자), 기술과 가방은 글자
export function thingIcon(id) {
  if (id.startsWith('item:')) {
    const name = id.slice(5);
    const img = h('img', { class: 'item-icon', src: `assets/items/${name}.png`, alt: '', draggable: 'false' });
    img.onerror = () => img.replaceWith(h('span', { class: 'letter-icon', style: { borderColor: GRADE[thingGrade(id)]?.color } }, thingName(id)[0]));
    return img;
  }
  return h('span', { class: 'tile-label' }, thingName(id));
}

// 마우스를 올리면 보일 설명 (PC)
const tip = (id, species) => { const d = describe(id, species); return [d.title, ...d.lines].join('\n'); };

// 상점·보관함 칸: 도구는 그림, 기술과 가방은 모양 미리보기
function slotIcon(id) {
  if (id.startsWith('item:')) return thingIcon(id);
  const cells = cellsOf(id, 0, 0, 0);
  const size = 9;
  const w = Math.max(...cells.map((c) => c[0])) + 1, hh = Math.max(...cells.map((c) => c[1])) + 1;
  const color = thingColor(id) ?? (id.startsWith('bag_') ? '#7a5a3a' : '#888');
  return h('span', { class: 'shape-preview', style: { width: `${w * size}px`, height: `${hh * size}px` } },
    cells.map(([x, y]) => h('i', { style: { left: `${x * size}px`, top: `${y * size}px`, background: color } })));
}

// 진화 미리보기 (§2.3): 능력치 전/후, 타입, 배울 수 있는 공격기 수, 진화 가방, 특성 유지 여부
const MOVE_BY_ID = Object.fromEntries(Object.values(MOVES).map((m) => [m.id, m]));
const attackCount = (species) => (LEARNSETS[species] ?? []).filter((id) => {
  const m = MOVE_BY_ID[id];
  return m && !m.excluded && m.class !== 'status';
}).length;

function evoPreview(run, itemId) {
  const e = runLib.evolutions(run.species).find((x) => x.item === itemId);
  if (!e) return h('p', {}, '지금 포켓몬에게는 쓸 수 없는 진화 도구예요.');
  const a = POKEMON[run.species], b = POKEMON[e.to];
  const stat = (p) => ({ HP: p.stats.hp, 공격: p.stats.atk, 특공: p.stats.spa, 방어: Math.round((p.stats.def + p.stats.spd) / 2), 스피드: p.stats.spe });
  const sa = stat(a), sb = stat(b);
  const same = b.abilities.find((x) => x.slot === run.abilitySlot)?.id === run.ability;
  const typesChanged = a.types.join() !== b.types.join();
  return h('div', { class: 'evo-preview' },
    h('div', { class: 'evo-head' }, portrait(run.species, { className: 'evo-portrait', shiny: run.shiny }), h('span', {}, '→'), portrait(e.to, { className: 'evo-portrait', shiny: run.shiny }),
      h('b', {}, `${a.name} → ${b.name}`)),
    typesChanged && h('div', {}, '타입 ', typeChips(a.types), ' → ', typeChips(b.types)),
    h('table', { class: 'evo-stats' }, Object.keys(sa).map((k) => h('tr', {},
      h('td', {}, k), h('td', {}, sa[k]), h('td', {}, '→'), h('td', {}, sb[k]),
      h('td', { class: sb[k] > sa[k] ? 'up' : sb[k] < sa[k] ? 'down' : '' }, sb[k] === sa[k] ? '' : `${sb[k] > sa[k] ? '+' : ''}${sb[k] - sa[k]}`)))),
    h('div', {}, `상점에 나올 수 있는 공격기 ${attackCount(run.species)} → ${attackCount(e.to)}개 (지금 가진 기술은 그대로)`),
    h('div', {}, '진화 가방 2×3을 받아요'),
    h('div', {}, same ? `특성 ${abilityName(run.ability)} 유지` : '진화하면 특성을 다시 골라요'));
}

// 인접 효과가 이어진 물건 uid 목록 (기술과 그 기술을 강화하는 도구)
function linkedUids(board) {
  const active = board.items.filter((it) => isActive(board, it));
  const cellOwner = new Map();
  for (const it of active) for (const c of cellsOf(it.id, it.x, it.y, it.rot)) cellOwner.set(key(c), it);
  const linked = new Set();
  for (const it of active) {
    const rule = ITEM_RULES[it.id.slice(5)];
    if (!it.id.startsWith('item:') || !rule) continue;
    for (const [x, y] of cellsOf(it.id, it.x, it.y, it.rot)) {
      for (const n of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const o = cellOwner.get(key(n));
        if (!o?.id.startsWith('move:')) continue;
        const m = MOVES[o.id.slice(5)];
        const ok = (rule.kind === 'typeBoost' && m.type === rule.type) || (rule.kind === 'choice' && m.class === rule.cls)
          || ['scarf', 'scopeLens', 'quickClaw'].includes(rule.kind) || (rule.kind === 'wideLens' && m.accuracy && m.accuracy < 100);
        if (ok) { linked.add(it.uid); linked.add(o.uid); }
      }
    }
  }
  return linked;
}

export function render(root, app) {
  let run = app.run;
  let selected = null;          // { kind: 'own', uid } | { kind: 'shop', i }
  let drag = null;              // 드래그 상태
  let cell = 36;

  const update = (r, msg) => {
    if (!r.ok) { toast(r.error); return false; }
    run = r.run;
    app.setRun(run);
    if (msg) toast(msg);
    return true;
  };

  // 진화 도구는 "이상한사탕 → 리자드"
  const slotName = (id) => {
    const to = evoTarget(id, run.species);
    return to ? `${thingName(id)} → ${pokemonName(to)}` : thingName(id);
  };
  const owned = () => [...run.board.bags, ...run.board.items, ...run.board.storage.filter(Boolean)];
  const findOwned = (uid) => owned().find((t) => t.uid === uid);
  const selectedId = () => (selected?.kind === 'own' ? findOwned(selected.uid)?.id : selected?.kind === 'shop' ? run.shop.slots[selected.i]?.id : null);

  // ---------- 행동 ----------

  const rotate = () => {
    if (selected?.kind === 'own') {
      const t = run.board.bags.find((b) => b.uid === selected.uid) ?? run.board.items.find((b) => b.uid === selected.uid);
      if (t) update(runLib.move(run, t.uid, { to: 'board', x: t.x, y: t.y, rot: (t.rot + 1) % 4 })) && draw();
    }
  };
  const sell = (uid) => {
    const t = findOwned(uid);
    const price = t && sellPrice(t.id, run.startMove, t.price);
    if (update(runLib.sell(run, uid), price !== null && t ? `${thingName(t.id)} 판매 +${price}골드` : null)) { selected = null; draw(); }
  };
  const toStorage = (uid) => {
    const slot = run.board.storage.indexOf(null);
    if (slot < 0) return toast('보관함이 가득 찼어요');
    update(runLib.move(run, uid, { to: 'storage', slot })) && draw();
  };
  const buyEvolution = async (i) => {
    const slot = run.shop.slots[i];
    const choice = await dialog(`${thingName(slot.id)} (${slot.price}골드)`,
      h('div', {}, evoPreview(run, slot.id), h('p', { class: 'muted' }, '지금 진화할까요? 나중에를 고르면 보관함에 들어가요.')),
      [{ label: '취소', value: null }, { label: '나중에', value: 'later' }, { label: '지금 진화', value: 'now', primary: true }]);
    if (!choice) return;
    const target = choice === 'now' ? { to: 'evolve' } : { to: 'storage', slot: run.board.storage.indexOf(null) };
    if (choice === 'later' && target.slot < 0) return toast('보관함이 가득 찼어요');
    if (update(runLib.buy(run, i, target), choice === 'now' ? '진화했어요! 진화 가방을 받았어요' : null)) { selected = null; draw(); }
  };
  const useEvolution = async (uid) => {
    const tool = run.board.storage.find((t) => t?.uid === uid);
    const go = await dialog(thingName(tool.id), evoPreview(run, tool.id), [{ label: '취소', value: false }, { label: '진화', value: true, primary: true }]);
    if (go && update(runLib.useEvolution(run, uid), '진화했어요! 진화 가방을 받았어요')) { selected = null; draw(); }
  };
  const refresh = () => update(runLib.refresh(run)) && draw();
  const lock = (i) => update(runLib.toggleLock(run, i)) && draw();
  const startBattle = async () => {
    if (activeMoves(run.board).length === 0) {
      const go = await dialog('기술이 없어요', h('p', {}, '가방에 기술이 없으면 발버둥만 써요. 그래도 싸울까요?'),
        [{ label: '취소', value: false }, { label: '싸운다', value: true, primary: true }]);
      if (!go) return;
    } else if (run.gold >= LEFTOVER_GOLD_WARN) {
      const go = await dialog('골드가 남았어요', h('p', {}, `골드가 ${run.gold} 남았어요. 그래도 싸울까요?`),
        [{ label: '취소', value: false }, { label: '싸운다', value: true, primary: true }]);
      if (!go) return;
    }
    app.go('battle');
  };

  // ---------- 드래그 ----------

  // 원본: { from: 'own', uid } | { from: 'shop', i }. 잡은 칸의 물건 기준 위치 (dx, dy)
  const beginPointer = (ev, source, id, rot, grab) => {
    if (ev.button === 2) return;
    ev.preventDefault();
    drag = { source, id, rot, grab, startX: ev.clientX, startY: ev.clientY, moved: false, ghost: null };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const ghostFor = (id, rot) => {
    const cells = cellsOf(id, 0, 0, rot);
    const w = Math.max(...cells.map((c) => c[0])) + 1, hh = Math.max(...cells.map((c) => c[1])) + 1;
    const g = h('div', { class: `ghost ${id.startsWith('bag_') ? 'is-bag' : ''}`, style: { width: `${w * cell}px`, height: `${hh * cell}px` } },
      cells.map(([x, y]) => h('div', { class: 'ghost-cell', style: { left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px`, background: thingColor(id) ?? '' } })),
      h('div', { class: 'ghost-label' }, thingName(id)));
    document.body.append(g);
    return g;
  };

  const placeGhost = (ev) => {
    drag.ghost.style.left = `${ev.clientX - (drag.grab[0] + 0.5) * cell}px`;
    drag.ghost.style.top = `${ev.clientY - (drag.grab[1] + 0.5) * cell}px`;
  };

  const onMove = (ev) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = ghostFor(drag.id, drag.rot);
      root.classList.add('dragging');
    }
    drag.last = ev;
    placeGhost(ev);
  };

  const rotateDrag = () => {
    if (!drag?.moved) return;
    drag.rot = (drag.rot + 1) % 4;
    drag.grab = [0, 0];
    drag.ghost.remove();
    drag.ghost = ghostFor(drag.id, drag.rot);
    if (drag.last) placeGhost(drag.last);
  };

  const dropTarget = (ev, d) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = el?.closest('[data-storage]');
    if (slot) return { to: 'storage', slot: Number(slot.dataset.storage) };
    if (el?.closest('.shop-area')) return { to: 'sell' };
    const boardEl = root.querySelector('.board');
    const r = boardEl.getBoundingClientRect();
    const cx = Math.floor((ev.clientX - r.left) / cell), cy = Math.floor((ev.clientY - r.top) / cell);
    if (cx < -2 || cy < -2 || cx > BOARD_W + 1 || cy > BOARD_H + 1) return null;
    return { to: 'board', x: cx - d.grab[0], y: cy - d.grab[1], rot: d.rot, cell: [cx, cy] };
  };

  // 놓은 칸에 있는 가방 안 기술 (기술 교체 대상)
  const moveAt = ([cx, cy], exceptUid) => run.board.items.find((it) => it.uid !== exceptUid && it.id.startsWith('move:')
    && isActive(run.board, it) && cellsOf(it.id, it.x, it.y, it.rot).some(([x, y]) => x === cx && y === cy));

  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    const d = drag;
    drag = null;
    root.classList.remove('dragging');
    d.ghost?.remove();
    if (!d.moved) {   // 누름 = 선택
      selected = d.source.from === 'own' ? { kind: 'own', uid: d.source.uid } : { kind: 'shop', i: d.source.i };
      if (d.source.from === 'shop' && run.shop.slots[d.source.i]?.evo) return buyEvolution(d.source.i);
      return draw();
    }
    const target = dropTarget(ev, d);
    if (!target) return draw();
    if (d.source.from === 'shop' && run.shop.slots[d.source.i]?.evo) return buyEvolution(d.source.i);
    if (target.to === 'sell') return d.source.from === 'shop' ? draw() : sell(d.source.uid);
    const place = (r) => (d.source.from === 'shop' ? runLib.buy(r, d.source.i, target) : runLib.move(r, d.source.uid, target));
    let result = place(run);
    // 기술을 가방 안 다른 기술 위에 놓으면 교체: 원래 기술은 보관함으로 (P3)
    const old = !result.ok && d.id.startsWith('move:') && target.to === 'board' && moveAt(target.cell, d.source.uid);
    if (old) {
      const swapped = runLib.replaceMove(run, old.uid, place);
      if (swapped.ok) result = { ...swapped, swapped: old };
      else if (swapped.error.startsWith('보관함')) result = swapped;
    }
    if (update(result, result.swapped ? `${josa(thingName(old.id), '은', '는')} 보관함으로 옮겼어요` : null) && d.source.from === 'shop') selected = null;
    draw();
  };

  const onKey = (ev) => {
    if (ev.key === 'r' || ev.key === 'R') { if (drag?.moved) rotateDrag(); else rotate(); }
    if (ev.key === 'Escape') { selected = null; draw(); }
  };
  const onContext = (ev) => {
    if (drag?.moved || ev.target.closest('.board, .storage')) { ev.preventDefault(); if (drag?.moved) rotateDrag(); else if (selected) rotate(); }
  };
  window.addEventListener('keydown', onKey);
  root.addEventListener('contextmenu', onContext);

  // ---------- 그리기 ----------

  const header = () => {
    const mon = POKEMON[run.species];
    const moves = activeMoves(run.board).length;
    return h('div', { class: 'hud' },
      h('div', { class: 'hud-mon' }, portrait(run.species, { className: 'hud-portrait', shiny: run.shiny }),
        h('div', {}, h('b', {}, mon.name), ' ', typeChips(mon.types),
          h('div', { class: 'hud-ability', title: abilityDesc(run.ability) }, `특성 ${abilityName(run.ability)}`))),
      h('div', { class: 'hud-stats' },
        h('span', {}, `${run.round}라운드`),
        h('span', { class: 'gold' }, `${run.gold}골드`),
        h('span', { class: 'wins' }, `${run.wins}/${WIN_TARGET}승`),
        h('span', { class: 'hearts' }, '♥'.repeat(Math.max(0, MAX_LOSSES - run.losses)) + '♡'.repeat(Math.min(MAX_LOSSES, run.losses))),
        h('span', { class: moves >= MAX_MOVES ? 'moves full' : 'moves' }, `기술 ${moves}/${MAX_MOVES}`)),
      runLib.isBossRound(run) && h('div', { class: 'boss-next' }, `다음 전투는 보스전: ${pokemonName(runLib.bossOf(run.seed))}`));
  };

  const boardView = (linked) => {
    const bagCells = new Set();
    const cellEls = [];
    for (const b of run.board.bags) {
      for (const [x, y] of cellsOf(b.id, b.x, b.y, b.rot)) {
        bagCells.add(key([x, y]));
        const tint = b.id.startsWith('bag_type_') ? thingColor(b.id) : null;
        cellEls.push(h('div', {
          class: `bag-cell ${b.id}${selected?.uid === b.uid ? ' selected' : ''}`,
          style: { left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px`, boxShadow: tint ? `inset 0 0 0 3px ${tint}` : '' },
          onpointerdown: (ev) => beginPointer(ev, { from: 'own', uid: b.uid }, b.id, b.rot, [x - b.x, y - b.y]),
        }));
      }
    }
    const things = run.board.items.map((it) => {
      const cells = cellsOf(it.id, it.x, it.y, it.rot);
      const active = cells.every((c) => bagCells.has(key(c)));
      const anchor = cells.reduce((a, c) => (c[1] < a[1] || (c[1] === a[1] && c[0] < a[0]) ? c : a));
      const color = thingColor(it.id);
      // 물건 하나의 바깥 테두리만 그린다 (같은 색 기술이 붙어 있어도 구분되게)
      const own = new Set(cells.map(key));
      const edge = (nx, ny) => (own.has(key([nx, ny])) ? '0' : '2px');
      return cells.map(([x, y]) => h('div', {
        class: `thing-cell ${it.id.startsWith('move:') ? 'is-move' : 'is-item'}${active ? '' : ' inactive'}${selected?.uid === it.uid ? ' selected' : ''}${linked.has(it.uid) ? ' linked' : ''}`,
        style: {
          left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px`, background: color ?? '',
          borderWidth: `${edge(x, y - 1)} ${edge(x + 1, y)} ${edge(x, y + 1)} ${edge(x - 1, y)}`,
        },
        title: tip(it.id, run.species),
        onpointerdown: (ev) => beginPointer(ev, { from: 'own', uid: it.uid }, it.id, it.rot, [x - it.x, y - it.y]),
      }, x === anchor[0] && y === anchor[1] ? thingIcon(it.id) : null));
    });
    const grid = [];
    for (let y = 0; y < BOARD_H; y++) for (let x = 0; x < BOARD_W; x++) {
      grid.push(h('div', { class: 'grid-cell', style: { left: `${x * cell}px`, top: `${y * cell}px`, width: `${cell}px`, height: `${cell}px` } }));
    }
    return h('div', { class: 'board', style: { width: `${BOARD_W * cell}px`, height: `${BOARD_H * cell}px` } }, grid, cellEls, things);
  };

  const storageView = () => h('div', { class: 'storage' },
    h('div', { class: 'label' }, '보관함'),
    h('div', { class: 'slots' }, run.board.storage.map((t, i) => h('div', {
      class: `slot${t && selected?.uid === t.uid ? ' selected' : ''}`,
      'data-storage': i,
      title: t ? tip(t.id, run.species) : null,
      onpointerdown: t ? (ev) => beginPointer(ev, { from: 'own', uid: t.uid }, t.id, 0, [0, 0]) : null,
    }, t ? [slotIcon(t.id), h('small', {}, slotName(t.id))] : null))));

  const shopView = () => h('div', { class: 'shop-area' },
    h('div', { class: 'label' }, '상점 ', h('small', {}, '(여기로 끌어오면 판매)')),
    h('div', { class: 'slots' }, run.shop.slots.map((s, i) => s
      ? h('div', {
        class: `shop-slot${selected?.kind === 'shop' && selected.i === i ? ' selected' : ''}${s.evo ? ' evo' : ''}${s.price > run.gold ? ' expensive' : ''}`,
        style: { borderColor: GRADE[thingGrade(s.id)]?.color ?? '#f0d060', background: thingColor(s.id) ? `linear-gradient(${thingColor(s.id)}55, transparent)` : '' },
        title: tip(s.id, run.species),
        onpointerdown: (ev) => beginPointer(ev, { from: 'shop', i }, s.id, 0, [0, 0]),
      },
      slotIcon(s.id),
      h('small', { class: 'slot-name' }, slotName(s.id)),
      h('span', { class: 'price' }, `${s.price}G`),
      s.id.startsWith('move:') && isStab(MOVES[s.id.slice(5)], run.species) && h('span', { class: 'stab' }, '자속'),
      !s.evo && h('button', { class: `lock${s.locked ? ' on' : ''}`, title: '찜', onpointerdown: (ev) => ev.stopPropagation(), onclick: () => lock(i) }, s.locked ? '🔒' : '🔓'))
      : h('div', { class: 'shop-slot empty' }))));

  const infoView = () => {
    const id = selectedId();
    if (!id) return h('div', { class: 'info muted' }, '물건을 누르면 자세한 정보가 보여요. 끌어서 놓고, R키·우클릭·회전 버튼으로 돌려요. 기술을 다른 기술 위에 놓으면 바꿔 끼워요.');
    const d = describe(id, run.species);
    const own = selected.kind === 'own' ? findOwned(selected.uid) : null;
    const inStorage = own && run.board.storage.some((t) => t?.uid === own.uid);
    const isEvoTool = id.startsWith('item:') && ITEM_RULES[id.slice(5)]?.placeable === false;
    const sp = own ? sellPrice(own.id, run.startMove, own.price) : null;
    return h('div', { class: 'info' },
      h('b', {}, d.title), d.lines.map((l) => h('div', {}, l)),
      h('div', { class: 'info-buttons' },
        own && !inStorage && h('button', { onclick: rotate }, '회전'),
        own && !inStorage && h('button', { onclick: () => toStorage(own.uid) }, '보관함으로'),
        own && isEvoTool && h('button', { class: 'primary', onclick: () => useEvolution(own.uid) }, '진화'),
        own && sp !== null && h('button', { onclick: () => sell(own.uid) }, `판매 +${sp}골드`),
        selected.kind === 'shop' && !run.shop.slots[selected.i]?.evo && h('button', { onclick: () => lock(selected.i) }, run.shop.slots[selected.i]?.locked ? '찜 풀기' : '찜')));
  };

  const abilityModal = () => h('div', { class: 'overlay' }, h('div', { class: 'dialog' },
    h('h3', {}, `${josa(pokemonName(run.species), '으로', '로')} 진화! 특성을 다시 고르세요`),
    h('div', { class: 'ability-choices' }, runLib.abilityChoices(run.species).map((a) => h('button', {
      class: 'ability-choice',
      onclick: () => update(runLib.chooseAbility(run, a.id)) && draw(),
    }, h('b', {}, abilityName(a.id)), h('span', {}, abilityDesc(a.id)))))));

  function draw() {
    const width = Math.min(root.clientWidth || window.innerWidth, 560);
    cell = Math.max(30, Math.min(48, Math.floor((width - 8) / BOARD_W)));
    root.style.setProperty('--cell', `${cell}px`);
    const linked = linkedUids(run.board);
    const free = run.freeRefresh > 0;
    root.replaceChildren(h('div', { class: 'shop-screen' },
      header(),
      boardView(linked),
      infoView(),
      storageView(),
      shopView(),
      h('div', { class: 'actions' },
        h('button', { onclick: refresh }, free ? '새로고침 (무료)' : `새로고침 ${refreshCost(run.shop.refreshes)}골드`),
        h('button', { class: 'primary', onclick: startBattle }, '전투 시작')),
      run.phase === 'ability' && abilityModal()));
  }

  const onResize = () => { if (!drag) draw(); };
  window.addEventListener('resize', onResize);
  draw();

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    drag?.ghost?.remove();
  };
}
