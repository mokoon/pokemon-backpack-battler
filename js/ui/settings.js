// 정보/설정 화면 (DESIGN §16): 효과음 음량, 난이도, 크레딧. 설정은 localStorage에 저장
import { h } from './dom.js';
import { setVolume, sfx } from './audio.js';
import { pokemonName } from './labels.js';
import { CREDITS } from '../data/credits.js';

const KEY = 'pbb-settings-v1';
const DEFAULTS = { volume: 0.5, difficulty: 'normal' };
const DIFFICULTY = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장소를 못 쓰면 이번 실행에만 적용 */ }
}

const join = (list) => list.join(', ');

export function render(root, app) {
  const s = loadSettings();
  const update = (patch) => { Object.assign(s, patch); saveSettings(s); };

  const volume = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volume * 100) });
  const volumeText = h('span', {}, `${Math.round(s.volume * 100)}%`);
  volume.addEventListener('input', () => {
    update({ volume: volume.value / 100 });
    setVolume(s.volume);
    volumeText.textContent = `${volume.value}%`;
  });
  volume.addEventListener('change', () => sfx('hit'));

  const difficulty = h('div', { class: 'segmented' }, Object.entries(DIFFICULTY).map(([k, label]) => h('button', {
    class: s.difficulty === k ? 'primary' : '',
    onclick: (ev) => {
      update({ difficulty: k });
      for (const b of difficulty.children) b.className = '';
      ev.currentTarget.className = 'primary';
    },
  }, label)));

  root.append(h('div', { class: 'settings-screen' },
    h('h2', {}, '정보 / 설정'),
    h('section', {}, h('h3', {}, '효과음 음량'), h('div', { class: 'row' }, volume, volumeText)),
    h('section', {}, h('h3', {}, '난이도'), difficulty,
      h('p', { class: 'muted' }, '상대 봇이 쓰는 골드: 쉬움 ×0.8, 보통 ×1.0, 어려움 ×1.15')),
    h('section', { class: 'credits' },
      h('h3', {}, '크레딧'),
      h('p', {}, '비공식 팬 게임입니다. 상업적으로 이용하지 않습니다.'),
      h('p', {}, 'Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.'),
      h('p', {}, '게임 데이터: PokeAPI. 도구 아이콘: PokeAPI/sprites, Pokémon Showdown 아이콘(은밀망토, 요정의깃털). 효과음은 직접 합성. 글꼴: 갈무리(Galmuri, 이민서, SIL OFL 1.1).'),
      h('p', {}, '포켓몬 스프라이트와 초상화: PMD SpriteCollab 제작자들 (CC BY-NC 4.0). 이 게임에 나오는 포켓몬의 제작자:'),
      h('ul', { class: 'credit-list' }, Object.entries(CREDITS).map(([dex, c]) => h('li', {},
        h('b', {}, pokemonName(Number(dex))), ' — 스프라이트 ', join(c.sprite), ' · 초상화 ', join(c.portrait),
        c.shiny.length ? ` · 이로치 ${join(c.shiny)}` : '')))),
    h('button', { class: 'wide', onclick: () => app.go('title') }, '돌아가기')));
}
