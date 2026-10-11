// 특성 규칙 (DESIGN §13). 수치는 config.js의 ABILITY.
// status: ok(원작 그대로) / changed(밸런스 때문에 바꿈) / economy(전투 효과 없음, 상점 효과) / 없으면 todo(선택 불가)
// economy: 'freeRefresh'(매 라운드 새로고침 1회 무료) | 'gold'(매 라운드 +1골드, 픽업)
// desc: 화면에 보일 효과 설명. 효과 구현은 js/sim/ (특성 id로 확인), economy 효과는 js/game/run.js.
// 빌드 요약이 이 파일을 정규식으로 읽어 todo 수를 센다: 키는 따옴표로, `'id': { status: '...'` 형식을 지킨다.

export const ABILITIES = {
  // HP 1/3 이하에서 그 타입 기술 피해 ×1.5
  'blaze': { status: 'ok', pinchType: 'fire', desc: 'HP 1/3 이하에서 불꽃 기술 피해 ×1.5' },
  'torrent': { status: 'ok', pinchType: 'water', desc: 'HP 1/3 이하에서 물 기술 피해 ×1.5' },
  'overgrow': { status: 'ok', pinchType: 'grass', desc: 'HP 1/3 이하에서 풀 기술 피해 ×1.5' },
  'swarm': { status: 'ok', pinchType: 'bug', desc: 'HP 1/3 이하에서 벌레 기술 피해 ×1.5' },
  'solar-power': { status: 'ok', desc: '쾌청일 때 특수 피해 ×1.5, 대신 1초마다 최대 HP 1% 잃음' },
  'rain-dish': { status: 'ok', desc: '비가 올 때 1초마다 최대 HP 1% 회복' },
  'chlorophyll': { status: 'ok', desc: '쾌청일 때 충전 속도 +50%' },
  'static': { status: 'changed', desc: '접촉 공격을 받을 때마다 상대에게 마비 3중첩' },
  'lightning-rod': { status: 'ok', desc: '전기 기술을 받지 않고, 맞으면 특공 +1단계' },
  'levitate': { status: 'ok', desc: '땅 기술을 받지 않음' },
  'cursed-body': { status: 'changed', desc: '공격을 받을 때마다 그 기술의 충전량 −10%p' },
  'guts': { status: 'ok', desc: '상태이상이 있으면 물리 피해 ×1.35, 화상의 물리 감소 무시' },
  'no-guard': { status: 'changed', desc: '내 기술이 반드시 명중' },
  'steadfast': { status: 'ok', desc: '풀죽음을 받을 때마다 스피드 +1단계' },
  'rock-head': { status: 'ok', desc: '반동기의 반동을 받지 않음' },
  'sturdy': { status: 'ok', desc: 'HP 가득일 때 쓰러질 피해를 받으면 1 남김 (전투당 1번)' },
  'sand-veil': { status: 'ok', desc: '모래바람일 때 상대 명중률 −20%p, 모래바람 피해 무효' },
  'shed-skin': { status: 'changed', desc: '2초마다 가장 많이 쌓인 상태이상 −2중첩' },
  'marvel-scale': { status: 'ok', desc: '상태이상이 있으면 받는 물리 피해 ×0.67' },
  'inner-focus': { status: 'ok', desc: '풀죽음과 위협을 받지 않음' },
  'multiscale': { status: 'ok', desc: 'HP 가득일 때 받는 피해 −50%' },
  'natural-cure': { status: 'changed', desc: 'HP 50% 이하가 처음 됐을 때 모든 상태이상 제거 (1번)' },
  'serene-grace': { status: 'ok', desc: '추가 효과의 상태이상 중첩 ×2, 능력 변화 확률 ×2' },
  'clear-body': { status: 'ok', desc: '상대가 거는 능력 하락을 받지 않음' },
  // M6 계통 확장 (20마리)
  'keen-eye': { status: 'ok', desc: '명중률이 떨어지지 않고, 상대의 회피 상승을 무시' },
  'big-pecks': { status: 'ok', desc: '상대가 거는 방어 하락을 받지 않음' },
  'synchronize': { status: 'ok', desc: '상대에게 독·화상·마비를 받으면 같은 중첩을 상대에게도' },
  'magic-guard': { status: 'ok', desc: '공격 외의 피해(상태이상, 날씨, 반동, 생명의구슬 등)를 받지 않음. 피로는 받음' },
  'hustle': { status: 'ok', desc: '물리 피해 ×1.5, 대신 물리 기술 명중률 ×0.8' },
  'super-luck': { status: 'ok', desc: '급소 단계 +1' },
  'speed-boost': { status: 'changed', desc: '10초마다 스피드 +1단계 (시간이 지나도 사라지지 않음, 최대 2)' },
  'shell-armor': { status: 'ok', desc: '급소에 맞지 않음' },
  'thick-fat': { status: 'ok', desc: '불꽃·얼음 기술 받는 피해 ×0.5' },
  'ice-body': { status: 'ok', desc: '설경일 때 1초마다 최대 HP 1% 회복' },
  'oblivious': { status: 'ok', desc: '도발을 받지 않음' },
  'sand-stream': { status: 'changed', desc: '전투 시작 시 모래바람 (12초)' },
  'poison-point': { status: 'changed', desc: '접촉 공격을 받을 때마다 상대에게 독 3중첩' },
  'damp': { status: 'economy', economy: 'freeRefresh', desc: '전투 효과 없음. 매 라운드 상점 새로고침 1번 무료' },
  'telepathy': { status: 'economy', economy: 'freeRefresh', desc: '전투 효과 없음. 매 라운드 상점 새로고침 1번 무료' },
  'healer': { status: 'economy', economy: 'freeRefresh', desc: '전투 효과 없음. 매 라운드 상점 새로고침 1번 무료' },
  'light-metal': { status: 'economy', economy: 'freeRefresh', desc: '전투 효과 없음. 매 라운드 상점 새로고침 1번 무료' },
  'friend-guard': { status: 'economy', economy: 'freeRefresh', desc: '전투 효과 없음. 매 라운드 상점 새로고침 1번 무료' },
};

// 고를 수 있는 특성인지 (todo는 선택 불가, §2.2)
export const selectable = (id) => !!ABILITIES[id];

// 전투에서 효과가 있는 특성인지 (todo, economy는 전투 효과 없음)
export const battleAbility = (id) => (['ok', 'changed'].includes(ABILITIES[id]?.status) ? id : null);
