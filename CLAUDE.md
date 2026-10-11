# 포켓몬 백팩 배틀러 (비공식 팬 게임)

포켓몬 1마리를 고르고, 상점에서 산 **기술·도구·가방 조각**을 격자 가방에 배치해 자동 전투를 하는 브라우저 게임. 장르는 백팩 배틀러. 비상업 팬 게임.

## 세션 시작 시 반드시
1. `docs/PROGRESS.md`를 읽는다. 현재 단계와 다음 할 일이 있다.
2. 필요한 규칙은 `docs/DESIGN.md`에서 해당 절(§)만 찾아 읽는다. **게임 규칙의 기준은 DESIGN.md다.**
3. 작업 단위를 끝낼 때마다 `docs/PROGRESS.md`를 갱신한다 (체크박스, 현재 상태, 다음 할 일, 결정 로그). 세션이 끊겨도 다음 세션이 이 파일만 보고 이어갈 수 있어야 한다.

## 작업 규칙
- **단순하게.** 요청과 설계에 없는 기능, 추상화, 설정을 만들지 않는다. 같은 일을 더 짧게 할 수 있으면 짧게.
- **필요한 곳만 고친다.** 관련 없는 코드, 주석, 형식을 "개선"하지 않는다. 내 변경으로 안 쓰게 된 코드만 지운다.
- **검증 후 체크.** PROGRESS.md의 각 항목에 적힌 검증 기준을 실제로 통과해야 `[x]`로 바꾼다.
- **모호하면 멈추고 묻는다.** DESIGN.md에 없는 규칙이 필요하면 임의로 정하지 말고 사용자에게 선택지를 제시한다. 정해지면 DESIGN.md와 결정 로그에 함께 기록한다.
- **조정 가능한 숫자는 `js/config.js`에만.** 코드 곳곳에 상수를 흩어 놓지 않는다.
- **전투 시뮬레이터는 결정적이어야 한다.** `js/sim/` 안에서 `Math.random`, `Date.now`, DOM 사용 금지. 시드 난수만 쓴다.
- 자동 생성 파일(`js/data/`)은 손으로 고치지 않는다. 고칠 일이 있으면 `tools/build_data.py`나 `js/rules/`를 고친다.
- 주석과 UI 문구는 한국어.
- 수익화 요소(광고, 결제) 금지. 원작 음악/타일 파일을 저장소에 넣지 않는다.

## 기술 스택
- 순수 HTML/CSS/JS (ES 모듈), 번들러 없음. GitHub Pages 배포.
- 테스트: Node 18 이상, `node --test` (Node 22+는 폴더 인자를 받지 않음)
- 데이터 빌드: Python 3, `python tools/build_data.py`

## 실행
```bash
python -m http.server 8765        # http://localhost:8765
node --test                       # 단위 테스트 (tests/*.test.mjs)
python tools/build_data.py        # PokeAPI → js/data/ 재생성
node tools/fight.mjs a.json b.json --seed 1   # 전투 1회 로그 (M1-7 이후)
node tools/balance.mjs            # 밸런스 보고서 (M2-5 이후)
```

## 파일 지도 (목표 구조)
```
index.html
css/style.css
js/
  config.js          조정 가능한 모든 상수 (DESIGN의 (초기값)들)
  main.js            진입점, 화면 전환
  data/              [자동 생성] pokemon, moves, learnsets, abilities, items, typechart
  rules/             [손으로 작성] abilities.js, items.js, statusMoves.js (효과 구현 규칙)
  sim/               [순수, DOM 없음] rng.js, battle.js(simulate), effects.js
  game/              [순수] bag.js, shop.js, run.js, bot.js
  ui/                화면: select.js, shop.js, battle.js, result.js, sprites.js, audio.js
tools/
  build_data.py      PokeAPI CSV → js/data/
  fight.mjs          명령줄 전투
  balance.mjs        봇 대량 시뮬 보고서
  .cache/            CSV 캐시 (git 제외)
tests/               *.test.mjs
assets/
  items/             [빌드 때 받음] 도구 아이콘 (원작 그림, 지울 수 있게 분리)
docs/
  DESIGN.md          게임 규칙 (기준 문서)
  PROGRESS.md        진행 상황, 결정 로그
```

## 외부 리소스 주소
- 스프라이트: `https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@master/sprite/{dex 4자리}/AnimData.xml` (실패 시 `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/...`)
- 초상화: `.../portrait/{dex 4자리}/Normal.png`
- 도구 아이콘: 빌드 때 받아서 `assets/items/`에 저장 (출처와 예외 3개는 DESIGN §1.1). 실행 중 외부에서 불러오지 않음
- 데이터: `https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/{name}.csv` (한국어 = `local_language_id` 3)

## 참고한 사이트
https://pmd-fan-web.github.io/ — 같은 방식(GitHub Pages + SpriteCollab + PokeAPI 빌드 스크립트 + Firebase 무료 요금제)으로 만든 포켓몬 팬 게임. 스프라이트 로더(`AnimData.xml` 파싱)와 배포 방식을 참고했다. 코드를 복사하지는 않는다 (그 저장소는 AGPL-3.0).
