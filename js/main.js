// 진입점: 화면 전환과 앱 상태
import * as title from './ui/title.js';
import * as select from './ui/select.js';
import * as shop from './ui/shop.js';
import * as battle from './ui/battle.js';
import * as result from './ui/result.js';
import * as settings from './ui/settings.js';
import { setVolume } from './ui/audio.js';
import { loadSave, writeSave } from './ui/save.js';

const screens = { title, select, shop, battle, result, settings };
setVolume(settings.loadSettings().volume);
const root = document.getElementById('app');
let cleanup = null;

// 모든 화면이 공유하는 앱 객체
const app = {
  run: loadSave(),
  // 화면 전환. 각 화면 모듈의 render(root, app, params)는 정리 함수를 돌려줄 수 있다
  go(name, params = {}) {
    cleanup?.();
    root.replaceChildren();
    root.dataset.screen = name;
    window.scrollTo(0, 0);
    cleanup = screens[name].render(root, app, params) ?? null;
  },
  // run을 바꾸고 상점 단계면 자동 저장
  setRun(run) {
    app.run = run;
    writeSave(run);
  },
};

app.go('title');
