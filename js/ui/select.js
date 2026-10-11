// 포켓몬 선택 화면 (DESIGN §2.2, §16): 후보 4장 → 상세 → 특성 선택 → 상점
import { h } from './dom.js';
import { portrait } from './sprites.js';
import { TYPE_COLOR, typeName, pokemonName, abilityName, abilityDesc, thingName, josa } from './labels.js';
import { POKEMON } from '../data/pokemon.js';
import { ABILITIES } from '../rules/abilities.js';
import { choosePokemon, chooseAbility, abilityChoices, evolutions, bossOf } from '../game/run.js';
import { loadRecords } from './records.js';
import { STARTER_POOL } from '../config.js';
import { lineGold } from '../game/shop.js';

export const typeChips = (types) => h('span', { class: 'types' },
  types.map((t) => h('span', { class: 'type-chip', style: { background: TYPE_COLOR[t] } }, typeName(t))));

// 진화 계통: 파이리 → 리자드 (3라운드) → 리자몽 (6라운드)
function evoLine(species) {
  const parts = [pokemonName(species)];
  for (let s = species, e; (e = evolutions(s)[0]); s = e.to) parts.push(`${pokemonName(e.to)} (${e.unlock}라운드)`);
  return parts.join(' → ');
}

function stats(species) {
  const st = POKEMON[species].stats;
  const rows = [['HP', st.hp], ['공격', st.atk], ['특공', st.spa], ['방어', Math.round((st.def + st.spd) / 2)], ['스피드', st.spe]];
  return h('div', { class: 'stats' }, rows.map(([k, v]) => h('div', { class: 'stat' },
    h('span', {}, k), h('span', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, v / 1.5)}%` } })), h('b', {}, v))));
}

function details(species, shiny) {
  const mon = POKEMON[species];
  const all = mon.abilities;
  return h('div', { class: 'details' },
    h('div', { class: 'detail-head' }, portrait(species, { shiny }), h('div', {}, h('h2', {}, mon.name, shiny ? h('span', { class: 'shiny' }, ' ✦ 이로치') : ''), typeChips(mon.types))),
    stats(species),
    h('p', {}, h('b', {}, '진화 '), evoLine(species)),
    h('p', {}, h('b', {}, '시작 기술 '), thingName(`move:${mon.startMove}`)),
    lineGold(species) ? h('p', {}, h('b', {}, '골드 보정 '), `라운드마다 ${lineGold(species) > 0 ? '+' : ''}${lineGold(species)}골드`) : null,
    h('div', {}, h('b', {}, '특성'), h('ul', { class: 'ability-list' }, all.map((a) => h('li', { class: ABILITIES[a.id] ? '' : 'disabled' },
      h('b', {}, abilityName(a.id)), a.hidden ? ' (숨겨진 특성)' : '', ' — ', ABILITIES[a.id] ? abilityDesc(a.id) : '미구현 (고를 수 없음)')))));
}

export function render(root, app) {
  let run = app.run;
  let picked = run.species ?? null;

  const pickAbility = () => {
    root.replaceChildren(h('div', { class: 'select-screen' },
      h('h2', {}, `${pokemonName(run.species)}의 특성을 고르세요`),
      h('div', { class: 'ability-choices' }, abilityChoices(run.species).map((a) => h('button', {
        class: 'ability-choice',
        onclick: () => {
          app.setRun(chooseAbility(run, a.id).run);
          app.go('shop');
        },
      }, h('b', {}, abilityName(a.id)), h('span', {}, abilityDesc(a.id)))))));
  };

  const start = () => {
    const r = choosePokemon(run, picked);
    if (!r.ok) return;
    run = r.run;
    app.setRun(run);
    if (run.phase === 'ability') pickAbility();
    else app.go('shop');
  };

  const records = loadRecords();
  const shinyOf = (s) => !!run.shinies?.[run.candidates.indexOf(s)];
  // 기록 배지: 클리어 N회 > 최고 N승 > 없음
  const badge = (s) => {
    const r = records[s];
    if (!r) return null;
    return h('div', { class: `record-badge${r.clears ? ' cleared' : ''}` }, `${r.clears ? `클리어 ${r.clears}회` : `최고 ${r.best}승`}${r.shiny ? ' ✦' : ''}`);
  };
  const clearedLines = STARTER_POOL.filter((s) => records[s]?.clears).length;
  const boss = bossOf(run.seed);

  const draw = () => {
    root.replaceChildren(h('div', { class: 'select-screen' },
      h('h2', {}, '함께할 포켓몬을 고르세요'),
      h('div', { class: 'boss-notice' }, portrait(boss, { className: 'boss-portrait' }),
        h('div', {}, h('div', {}, '이번 런의 보스: ', h('b', {}, pokemonName(boss))), typeChips(POKEMON[boss].types),
          h('small', {}, ` 9승 뒤 마지막 전투`))),
      h('div', { class: 'cards' }, run.candidates.map((s) => h('button', {
        class: `card${s === picked ? ' picked' : ''}${shinyOf(s) ? ' shiny-card' : ''}`,
        onclick: () => { picked = s; draw(); },
      }, portrait(s, { shiny: shinyOf(s) }), h('div', { class: 'card-name' }, pokemonName(s), shinyOf(s) ? h('span', { class: 'shiny' }, ' ✦') : ''),
      typeChips(POKEMON[s].types), badge(s)))),
      h('p', { class: 'record-summary' }, `클리어한 계통 ${clearedLines}/${STARTER_POOL.length}`),
      picked && details(picked, shinyOf(picked)),
      picked && h('button', { class: 'primary wide', onclick: start }, `${josa(pokemonName(picked), '으로', '로')} 시작`)));
  };

  if (run.phase === 'ability') pickAbility();
  else draw();
}
