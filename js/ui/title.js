// 타이틀 화면
import { h, dialog, toast } from './dom.js';
import { createRun } from '../game/run.js';
import { exportRun, importRun } from './save.js';
import { pokemonName } from './labels.js';

export function render(root, app) {
  const run = app.run;
  const resume = run && run.phase !== 'over' && run.phase !== 'cleared' && run.started;

  const newGame = () => {
    app.setRun(createRun(Math.floor(Math.random() * 2 ** 31)));
    app.go('select');
  };
  const cont = () => app.go(app.run.started ? 'shop' : 'select');

  const exportSave = async () => {
    const box = h('textarea', { class: 'save-text', readonly: true }, exportRun(app.run));
    setTimeout(() => box.select(), 0);
    await dialog('세이브 내보내기', h('div', {}, h('p', {}, '아래 글자를 복사해 두면 나중에 불러올 수 있어요.'), box), [{ label: '닫기', value: 0 }]);
  };
  const importSave = async () => {
    const box = h('textarea', { class: 'save-text', placeholder: '내보낸 세이브 글자를 붙여 넣으세요' });
    const okPressed = await dialog('세이브 불러오기', box, [{ label: '취소', value: false }, { label: '불러오기', value: true, primary: true }]);
    if (!okPressed) return;
    const loaded = importRun(box.value.trim());
    if (!loaded) return toast('세이브 글자가 올바르지 않아요');
    app.setRun(loaded);
    app.go('title');
  };

  root.append(
    h('div', { class: 'title-screen' },
      h('h1', {}, '포켓몬 백팩 배틀러'),
      h('p', { class: 'subtitle' }, '기술과 도구를 가방에 채워 자동 전투! 10승을 노려 보세요'),
      h('div', { class: 'menu' },
        resume && h('button', { class: 'primary', onclick: cont },
          `이어하기 — ${pokemonName(run.species)} · ${run.round}라운드 · ${run.wins}승 ${run.losses}패`),
        h('button', { class: resume ? '' : 'primary', onclick: newGame }, '새 게임'),
        resume && h('button', { onclick: exportSave }, '세이브 내보내기'),
        h('button', { onclick: importSave }, '세이브 불러오기'),
        h('button', { onclick: () => app.go('settings') }, '정보 / 설정'))));
}
