// 결과 화면 (DESIGN §16): 런 통계
import { h } from './dom.js';
import { portrait } from './sprites.js';
import { pokemonName, abilityName, moveName } from './labels.js';
import { createRun } from '../game/run.js';

export function render(root, app) {
  const run = app.run;
  const stats = run.stats ?? { damage: {}, stacks: 0, battles: 0 };
  const damage = Object.entries(stats.damage).sort((a, b) => b[1] - a[1]);
  const total = damage.reduce((s, [, d]) => s + d, 0);
  const cleared = run.phase === 'cleared';

  root.append(h('div', { class: 'result-screen' },
    h('h1', { class: cleared ? 'win' : 'loss' }, cleared ? '클리어!' : '런 종료'),
    h('div', { class: 'result-mon' }, portrait(run.species, { shiny: run.shiny }),
      h('div', {}, h('h2', {}, pokemonName(run.species)), h('div', {}, `특성 ${abilityName(run.ability)}`))),
    h('div', { class: 'result-numbers' },
      h('div', {}, h('b', {}, run.wins), '승'), h('div', {}, h('b', {}, run.losses), '패'), h('div', {}, h('b', {}, run.draws), '무'),
      h('div', {}, h('b', {}, run.round), '라운드')),
    h('h3', {}, '기술별 총 피해'),
    damage.length
      ? h('ul', { class: 'damage-list' }, damage.map(([m, d], i) => h('li', {},
        h('span', {}, `${i === 0 ? '★ ' : ''}${moveName(m)}`),
        h('span', { class: 'bar' }, h('i', { style: { width: `${(d / damage[0][1]) * 100}%` } })),
        h('b', {}, d))))
      : h('p', {}, '피해 기록이 없어요'),
    h('p', {}, `총 피해 ${total} · 상대에게 쌓은 상태이상 중첩 ${stats.stacks} · 전투 ${stats.battles}번`),
    h('div', { class: 'menu' },
      h('button', { class: 'primary', onclick: () => { app.setRun(createRun(Math.floor(Math.random() * 2 ** 31))); app.go('select'); } }, '새 게임'),
      h('button', { onclick: () => app.go('title') }, '타이틀로'))));
}
