# 포켓몬 백팩 배틀러 (비공식 팬 게임)

포켓몬 1마리를 고르고, 상점에서 산 **기술·도구·가방 조각**을 격자 가방에 배치해 자동 전투를 하는 브라우저 게임입니다. 10승을 하면 클리어, 5번 지면 끝납니다. 9승 뒤에는 전설 포켓몬 보스와 싸웁니다.

> **비공식 팬 게임**입니다. Pokémon © Nintendo / Creatures / GAME FREAK. 이 게임은 닌텐도, 크리처스, 게임프리크, 포켓몬 컴퍼니와 관계가 없습니다.
> 스프라이트 © SpriteCollab 제작자들 (CC BY-NC 4.0). 광고·결제 등 수익화 요소는 없습니다.

## 플레이 방법
1. 후보 4마리 중 1마리와 특성을 고릅니다.
2. 상점에서 기술·도구·가방 조각을 사서 가방(9×7 격자)에 끌어다 놓습니다. R키(또는 우클릭, 회전 버튼)로 돌릴 수 있습니다.
   - 가방 안 기술은 최대 4개. 도구는 붙어 있는 기술을 강화합니다.
   - 진화 도구가 상점에 나오면 사서 진화할 수 있습니다.
3. "전투 시작"을 누르면 상대를 3초 보여 준 뒤 자동 전투가 진행됩니다.

진행은 브라우저(localStorage)에 자동 저장되며, 타이틀 화면에서 세이브를 내보내고 불러올 수 있습니다.

## 로컬 실행
```bash
python -m http.server 8765        # http://localhost:8765
```
번들러가 없는 순수 HTML/CSS/JS(ES 모듈)라 위 명령만 있으면 됩니다.

## 개발
```bash
node --test                                   # 단위 테스트 (Node 18 이상)
python tools/build_data.py                    # PokeAPI CSV → js/data/ 재생성
node tools/fight.mjs a.json b.json --seed 1   # 전투 1회 로그
node tools/balance.mjs                        # 밸런스 보고서 (약 2분)
```
- 게임 규칙: [docs/DESIGN.md](docs/DESIGN.md)
- 진행 상황과 결정 로그: [docs/PROGRESS.md](docs/PROGRESS.md)
- `js/data/`는 자동 생성 파일이라 손으로 고치지 않습니다.

## 출처
- 게임 데이터: [PokeAPI](https://github.com/PokeAPI/pokeapi) CSV (빌드할 때만 사용)
- 포켓몬 스프라이트·초상화: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (CC BY-NC 4.0). 실행 중 jsDelivr로 불러옵니다. 제작자 목록은 게임의 "정보 / 설정" 화면에 있습니다.
- 도구 아이콘(`assets/items/`): [PokeAPI/sprites](https://github.com/PokeAPI/sprites), 일부는 Pokémon Showdown 아이콘 시트에서 잘라 씀. 원작 그림이므로 권리자 요청이 있으면 지웁니다 (지워도 글자 아이콘으로 동작).
- 글꼴: [갈무리(Galmuri)](https://github.com/quiple/galmuri) (SIL OFL 1.1). 실행 중 jsDelivr로 불러옵니다.
- 효과음은 Web Audio로 합성하며, 원작 음악은 쓰지 않습니다.
