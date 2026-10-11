// 조정 가능한 모든 상수. DESIGN.md의 (초기값)들을 여기에만 둔다.

// 시작 포켓몬 후보 (도감 번호, DESIGN §2.2 개발 초기 풀)
export const STARTER_POOL = [4, 7, 1, 172, 92, 66, 74, 147, 440, 374];
// 최종 보스 후보 (§2.5): 뮤츠, 루기아, 레쿠쟈, 디아루가
export const BOSS_POOL = [150, 249, 384, 483];
export const BOSS_BST = 600;            // 보스 종족값 합을 이 값으로 맞춘다
export const BOSS_DIFFICULTY = 'hard';  // 보스 가방은 이 난이도로 만든다

// 보드와 가방 (§4)
export const BOARD_W = 9;
export const BOARD_H = 7;
export const MAX_MOVES = 4;
export const STORAGE_SLOTS = 6;            // 보관함 (§4.1)

// 발버둥 (§4.4): 가방에 기술이 없을 때
export const STRUGGLE = { power: 50, cool: 4.0, recoil: 0.25 };

// 능력치 (§3): 최대 HP = (HP_MUL × 종족HP + HP_BASE_ADD) × HP_SCALE(r)
export const HP_MUL = 1;
export const HP_BASE_ADD = 150;
export const hpScale = (round) => 3.4 * (1 + 0.18 * (Math.min(round, 14) - 1));
// 충전 속도 (§5.2): sqrt((스피드 + SPEED_ADD) / SPEED_DIV)
export const SPEED_ADD = 100;
export const SPEED_DIV = 180;
// 우선도 → 시작 충전량 (§5.2)
export const PRIORITY_START_CHARGE = { 1: 0.35, 2: 0.55, 3: 0.70 };

// 피해 (§6)
export const DMG_K = 1.2;
export const STAT_ADD = 50;          // (A + 50) / (D + 50)
export const STAB = 1.25;
export const CRIT_MULT = 1.5;
export const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2];   // 급소 단계 0, 1, 2+
// 2~5회 연속기 타수 확률 (§5.7)
export const MULTI_HIT_2_5 = [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]];

// 특수한 공격기 (§5.7)
export const RECHARGE_HALT_MS = 1500;      // 반동으로 쉬는 기술: 자기 모든 충전 정지
export const CHARGE_COOL_MUL = 1.3;        // 2턴 기술 쿨 배율. 데이터의 cool에 이미 곱해져 있음 (tools/build_data.py와 같은 값). 쾌청이면 솔라빔은 없앰

// 능력 변화 (§7)
export const STAGE_STEP = 0.25;            // +n → × (1 + 0.25n)
export const STAGE_MAX = 6;
export const STAGE_MS = 8000;              // 단계마다 독립 타이머
export const STAGE_ACC_STEP = 8;           // 명중/회피 1단계당 %p

// 상태이상 (§8.2). dot: 1초마다 최대 HP 비율(중첩당), decayMs: 자연 감소 간격, immune: 면역 타입
export const STATUS = {
  poison: { max: 20, dot: 0.002, decayMs: 0, immune: ['poison', 'steel'] },
  burn: { max: 10, dot: 0.004, decayMs: 2000, immune: ['fire'] },
  paralysis: { max: 10, slow: 0.04, decayMs: 2000, immune: ['electric'] },
  chill: { max: 10, slow: 0.02, decayMs: 2000, immune: ['ice'] },
  drowsy: { max: 10, decayMs: 2000, immune: [] },
  confusion: { max: 10, decayMs: 1000, immune: [] },
};
export const TOXIC_ADD_MS = 2000;          // 맹독: 2초마다 독 +1
export const BURN_PHYS_MULT = 0.8;         // 화상 1중첩 이상: 물리 피해 −20%
export const FREEZE_MS = 1000;             // 냉기 10중첩 → 동결
export const FREEZE_IMMUNE_MS = 5000;
export const SLEEP_MS = 1500;              // 졸음 10중첩 → 잠듦
export const SLEEP_IMMUNE_MS = 6000;
export const CONFUSION_CHANCE = 0.04;      // 중첩당 자해 확률
export const CONFUSION_POWER = 40;
export const AILMENT_CHANCE_DIV = 5;       // 공격기 추가 효과: 중첩 = max(1, round(확률 / 5))
export const FLINCH_DIV = 2;               // 풀죽음: 충전량 −(확률 / 2)%p
// 원작 meta ailment → 게임 상태이상
export const AILMENT_MAP = { poison: 'poison', burn: 'burn', paralysis: 'paralysis', freeze: 'chill', sleep: 'drowsy', confusion: 'confusion' };
// 변화기 중첩 (§8.3 표)
export const STATUS_MOVE_STACKS = {
  'poison-powder': { poison: 4 }, 'poison-gas': { poison: 4 }, toxic: { poison: 6, toxic: true },
  'will-o-wisp': { burn: 5 },
  'thunder-wave': { paralysis: 6 }, glare: { paralysis: 6 }, 'stun-spore': { paralysis: 6 },
  hypnosis: { drowsy: 5 }, sing: { drowsy: 5 }, 'lovely-kiss': { drowsy: 5 },
  'sleep-powder': { drowsy: 7 }, spore: { drowsy: 10 },
  'confuse-ray': { confusion: 6 }, supersonic: { confusion: 6 }, swagger: { confusion: 6 },
};

// 날씨 (§9)
export const WEATHER_MS = 12000;
export const WEATHER_MOVES = { 'sunny-day': 'sun', 'rain-dance': 'rain', sandstorm: 'sand', snowscape: 'snow' };
export const WEATHER_BOOST = 1.3;
export const WEATHER_WEAKEN = 0.7;
export const SAND_DOT = 0.005;
export const WEATHER_DEF_MULT = 0.8;       // 모래바람 바위 특수 / 설경 얼음 물리

// 변화기 계열 (§5.8)
export const HEAL_SEQUENCE = [0.20, 0.15, 0.10, 0.05];   // 쓸 때마다, 마지막 값 반복
export const PROTECT_MS = 2000;
export const PROTECT_MULT = 0.2;           // 다음 공격 1회 피해 −80%
export const SCREEN_MS = 6000;
export const SCREEN_MULT = 0.67;           // −33%
export const SUBSTITUTE_COST = 0.15;
export const LEECH_SEED_MS = 10000;
export const LEECH_SEED_DOT = 0.008;
export const TAUNT_MS = 3000;

// 도구 (§10.2, §4.3)
export const ITEM_STACK_WEIGHTS = [1, 0.8, 0.6, 0.4];   // 전체 효과 도구: n개째 효과 비율, 마지막 값 반복
export const ITEM = {
  typeBoost: 0.20,          // 인접한 그 타입 기술 피해
  choiceBoost: 0.40,        // 구애머리띠/안경: 인접한 물리/특수 기술 피해
  choicePenalty: 0.20,      // 인접하지 않은 공격기 충전 속도
  scarfCharge: 0.30,        // 구애스카프: 인접한 기술 충전 속도
  scarfPenalty: 0.10,       // 인접하지 않은 기술 피해
  lifeOrb: 0.20, lifeOrbCost: 0.02,
  leftovers: 0.007,         // 최대 HP / 초
  sludgeHeal: 0.010, sludgeDamage: 0.007,
  shellBell: 0.08,          // 준 피해 비율 회복
  sashMinHp: 0.5,           // 기합의띠: 이 HP 비율 이상에서 쓰러질 피해 → 1 남김, 전투당 1번
  vestSpecial: 0.20,        // 돌격조끼: 받는 특수 피해 감소
  vestStatusCool: 0.50,     // 돌격조끼: 변화기 쿨타임 증가
  helmet: 0.15,             // 울퉁불퉁멧: 접촉 기술 피해 반사
  expertBelt: 0.20,
  wideLens: 10,             // %p
  scopeLens: 1,             // 급소 단계
  quickClaw: 0.30,          // 시작 충전량
  lightClay: 0.50,          // 벽 지속 시간
  eviolite: 0.33,
  evioliteBase: 0.45,       // 진화가 2단계 남았을 때
  sitrus: 0.25, oran: 0.10, hpBerryAt: 0.5,
  pinchAt: 0.25,
  lumStacks: 3,
  resistBerry: 0.5,
  resistBerryUses: 3,       // 반감 열매 하나가 막는 효과 굉장 공격 횟수
  typeBag: 0.10,            // 타입 가방 위 그 타입 기술 충전 속도
  basketUses: 1,            // 나무열매 바구니 안 열매 발동 횟수 +
};

// 특성 (§13.3, §13.4)
export const ABILITY = {
  pinchAt: 1 / 3, pinchMult: 1.5,          // 맹화, 급류, 심록
  solarPower: 1.5, solarPowerCost: 0.01,
  rainDish: 0.01,
  chlorophyll: 0.5,
  staticStacks: 3,
  gutsMult: 1.35,
  sandVeilAcc: 20,
  shedSkinMs: 2000, shedSkinStacks: 2,
  marvelScale: 0.67,
  multiscale: 0.5,
  cursedBody: 0.10,
  sereneGrace: 2,
  naturalCureAt: 0.5,
};

// 상점과 경제 (§12, §5.9, §4.3)
export const GRADES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const GRADE_PRICE = { common: 3, uncommon: 5, rare: 7, epic: 10, legendary: 13 };   // 기술, 도구
export const BAG_PIECES = {                                   // 상점에 나오는 가방 조각
  bag_pouch: { grade: 'common', price: 2 },
  bag_2x2: { grade: 'uncommon', price: 4 },
  bag_2x3: { grade: 'rare', price: 6 },
  bag_type: { grade: 'rare', price: 6 },                      // bag_type_<타입> 18종
  bag_berry: { grade: 'epic', price: 8 },
};
export const UNSELLABLE_BAGS = ['bag_base', 'bag_evo'];
export const SELL_RATIO = 0.5;                                // 판매: 산 가격의 절반 (내림)
export const START_MOVE_SELL = 1;                             // 시작 기술 판매가
export const ROUND_GOLD = [12, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15];   // 라운드 1~14, 그 뒤는 마지막 값
export const weakBonusGold = (finalBst) => Math.max(0, Math.min(3, Math.floor((500 - finalBst) / 30)));   // §2.4
// §2.4 계통 보정 골드 (밸런스 보고서로 맞춘 값, 계통 첫 단계 도감 번호 → 라운드마다 더할 골드). 표에 있으면 위 식 대신 쓴다
export const LINE_GOLD = { 172: 4, 440: 2, 74: 5, 92: -3, 374: -2, 1: -1 };
export const SHOP_SLOTS = 5;
export const REFRESH_COST = 1;
export const REFRESH_STEP = 4;                                // 한 라운드에 4번 새로고침할 때마다 비용 +1
export const KIND_WEIGHTS = { move: 35, item: 45, bag: 20 };
export const LOW_SPACE_CELLS = 3;                             // 빈 가방 칸이 이 이하이면
export const LOW_SPACE_BAG_WEIGHT = 35;                       //   가방 조각 비율을 이 값으로
export const EARLY_MOVE_ROUNDS = 2;                           // 라운드 1~2: 기술 최소 2칸
export const EARLY_MOVE_SLOTS = 2;
export const TYPE_MATCH_CHANCE = 0.5;                         // 타입 강화 도구/타입 가방: 내 기술 타입, 반감 열매: 내 약점 타입
// 등급 출현 확률 (§12.3): [이 라운드까지, 일반, 고급, 희귀, 영웅, 전설]
export const GRADE_ODDS = [
  [2, 75, 25, 0, 0, 0],
  [4, 55, 35, 10, 0, 0],
  [6, 40, 35, 20, 5, 0],
  [9, 30, 30, 28, 10, 2],
  [Infinity, 20, 28, 32, 15, 5],
];

// 런 (§2.1, §2.2)
export const WIN_TARGET = 10;
export const MAX_LOSSES = 5;
export const STARTER_CHOICES = 4;
export const SHINY_CHANCE = 1 / 64;     // 시작 후보 카드마다 이로치 확률 (§16)
export const PREVIEW_MS = 3000;         // 전투 전 상대 미리보기 시간 (§16)
export const LEFTOVER_GOLD_WARN = 10;   // 전투 시작 때 이만큼 이상 남았으면 확인 창 (§18)

// 진화 (§2.3)
export const evoUnlockByLevel = (level) => Math.min(10, Math.max(3, Math.ceil(level / 6)));
export const EVO_UNLOCK_OTHER = [4, 7];                     // 레벨 외 진화: 1차, 2차
export const EVO_UNLOCK_BABY = 1;                           // 아기 포켓몬 → 다음 단계
export const EVO_PRICE = { baby: 4, mid: 6, final: 9 };     // 아기 → / 최종 진화가 아닌 단계로 / 최종 진화로
export const EVO_REFRESH_CHANCE = 0.2;                      // 해금 뒤 새로고침할 때 진화 도구가 나올 확률 (첫 상점은 보장)
export const EVERSTONE_GOLD = 3;
export const ECONOMY_GOLD = 1;                              // 픽업 등 'gold' 경제 특성

// 봇 (§14)
export const BOT_GOLD_MULT = { easy: 0.8, normal: 1.0, hard: 1.15 };
export const BOT_MAX_REFRESH = 2;              // 라운드당 새로고침 최대 횟수
export const BOT_REFRESH_RESERVE = 3;          // 새로고침 후에도 이만큼 골드가 남을 때만
export const BOT_SAME_TYPE_MULT = 0.7;         // 이미 같은 타입 공격기가 있으면 그 기술 가치에 곱함 (타입 다양화)
export const BOT_NORMAL_MULT = 0.6;            // 자속이 아닌 노말 공격기 가치에 곱함 (효과 굉장이 없고 고스트에 막힘)

// 전투 진행 (§11)
export const TICK_MS = 100;
export const TIME_LIMIT_MS = 90000;
// 피로 (§11.3): 30초부터 매 1초 양쪽에 최대 HP × 1% × (경과초 − 30), 상성·감소 무시. 회복량 절반
export const FATIGUE_START_MS = 30000;
export const FATIGUE_RATE = 0.01;
export const FATIGUE_HEAL_MULT = 0.5;
