// 도구 규칙 (DESIGN §10.2). 수치는 config.js의 ITEM.
// size: 칸 수 (1×n 일자 모양, 회전 가능). grade: 등급 (가격은 config.js의 GRADE_PRICE). placeable: false면 가방에 놓지 않는 도구 (진화 도구, §2.3)
// kind: 효과 종류. 인접 효과(typeBoost, choice, scarf, wideLens, scopeLens, quickClaw)는 겹쳐도 그대로 더하고,
// 그 외 전체 효과는 같은 이름이 겹칠수록 덜 오른다 (ITEM_STACK_WEIGHTS). once: 1회성 (차례로 발동)

const TYPE_BOOSTERS = {
  charcoal: 'fire', 'mystic-water': 'water', magnet: 'electric', 'miracle-seed': 'grass',
  'never-melt-ice': 'ice', 'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground',
  'sharp-beak': 'flying', 'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock',
  'spell-tag': 'ghost', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel',
  'silk-scarf': 'normal', 'fairy-feather': 'fairy',
};
const RESIST_BERRIES = {
  'occa-berry': 'fire', 'passho-berry': 'water', 'wacan-berry': 'electric', 'rindo-berry': 'grass',
  'yache-berry': 'ice', 'chople-berry': 'fighting', 'kebia-berry': 'poison', 'shuca-berry': 'ground',
  'coba-berry': 'flying', 'payapa-berry': 'psychic', 'tanga-berry': 'bug', 'charti-berry': 'rock',
  'kasib-berry': 'ghost', 'haban-berry': 'dragon', 'colbur-berry': 'dark', 'babiri-berry': 'steel',
  'roseli-berry': 'fairy', 'chilan-berry': 'normal',
};
const PINCH_BERRIES = {
  'liechi-berry': 'atk', 'ganlon-berry': 'def', 'salac-berry': 'spe', 'petaya-berry': 'spa', 'apicot-berry': 'spd',
};
const VITAMINS = { 'hp-up': 'hp', protein: 'atk', iron: 'def', calcium: 'spa', zinc: 'spd', carbos: 'spe' };
const map = (obj, f) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [id, f(v)]));

export const ITEM_RULES = {
  ...map(TYPE_BOOSTERS, (type) => ({ size: 1, grade: 'common', kind: 'typeBoost', type })),
  ...map(RESIST_BERRIES, (type) => ({ size: 1, grade: 'common', kind: 'resistBerry', type, berry: true, once: true })),
  ...map(PINCH_BERRIES, (stat) => ({ size: 1, grade: 'uncommon', kind: 'pinchBerry', stat, berry: true, once: true })),
  'life-orb': { size: 2, grade: 'epic', kind: 'lifeOrb' },
  'choice-band': { size: 2, grade: 'rare', kind: 'choice', cls: 'physical' },
  'choice-specs': { size: 2, grade: 'rare', kind: 'choice', cls: 'special' },
  'choice-scarf': { size: 2, grade: 'rare', kind: 'scarf' },
  'leftovers': { size: 2, grade: 'uncommon', kind: 'leftovers' },
  'black-sludge': { size: 2, grade: 'uncommon', kind: 'blackSludge' },
  'shell-bell': { size: 1, grade: 'uncommon', kind: 'shellBell' },
  'focus-sash': { size: 1, grade: 'rare', kind: 'focusSash' },
  'assault-vest': { size: 3, grade: 'rare', kind: 'assaultVest' },
  'rocky-helmet': { size: 2, grade: 'uncommon', kind: 'rockyHelmet' },
  'expert-belt': { size: 1, grade: 'uncommon', kind: 'expertBelt' },
  'wide-lens': { size: 1, grade: 'common', kind: 'wideLens' },
  'scope-lens': { size: 1, grade: 'uncommon', kind: 'scopeLens' },
  'quick-claw': { size: 1, grade: 'uncommon', kind: 'quickClaw' },
  'light-clay': { size: 1, grade: 'uncommon', kind: 'lightClay' },
  'eviolite': { size: 2, grade: 'rare', kind: 'eviolite', evoOnly: true },       // evoOnly: 진화 해금 라운드부터 상점에 나옴
  'everstone': { size: 1, grade: 'uncommon', kind: 'everstone', evoOnly: true },  // 전투 효과 없음 (상점: 진화 불가, +EVERSTONE_GOLD골드)
  'white-herb': { size: 1, grade: 'uncommon', kind: 'whiteHerb', once: true },
  'covert-cloak': { size: 1, grade: 'uncommon', kind: 'covertCloak' },
  'sitrus-berry': { size: 1, grade: 'common', kind: 'hpBerry', berry: true, once: true },
  'oran-berry': { size: 1, grade: 'common', kind: 'hpBerry', berry: true, once: true },
  'lum-berry': { size: 1, grade: 'uncommon', kind: 'lumBerry', berry: true, once: true },
  'rare-candy': { placeable: false },
  'thunder-stone': { placeable: false },
  'linking-cord': { placeable: false },
  'soothe-bell': { placeable: false },
  'oval-stone': { placeable: false },
  'shiny-stone': { placeable: false },
  'dawn-stone': { placeable: false },
  // 영양제 (§10.4): 가방에 놓지 않고 사면 바로 쓴다. stat: 올리는 종족값
  ...map(VITAMINS, (stat) => ({ grade: 'uncommon', kind: 'vitamin', stat, consumable: true })),
};
