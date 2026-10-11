// 화면에 보일 이름, 색, 설명
import { MOVES } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { POKEMON } from '../data/pokemon.js';
import { TYPES } from '../data/typechart.js';
import { ABILITIES as ABILITY_DATA } from '../data/abilities.js';
import { ABILITIES } from '../rules/abilities.js';
import { ITEM_RULES } from '../rules/items.js';
import { ITEM, STATUS_MOVE_STACKS, AILMENT_MAP, AILMENT_CHANCE_DIV, EVERSTONE_GOLD } from '../config.js';
import { priceOf } from '../game/shop.js';
import { evolutions } from '../game/run.js';

export const TYPE_COLOR = {
  normal: '#9a9a7a', fire: '#e8742e', water: '#4f86e0', electric: '#e3c21c', grass: '#5ba844', ice: '#7ccfcf',
  fighting: '#b8332c', poison: '#9346a0', ground: '#cfa851', flying: '#8f86e6', psychic: '#e4517d', bug: '#97ad1f',
  rock: '#ad9637', ghost: '#665696', dragon: '#6436ee', dark: '#655246', steel: '#9f9fbd', fairy: '#e090c8',
};
export const GRADE = {
  common: { name: '일반', color: '#a8b0bd' }, uncommon: { name: '고급', color: '#5fc46b' },
  rare: { name: '희귀', color: '#4f9cf0' }, epic: { name: '영웅', color: '#b46ef0' }, legendary: { name: '전설', color: '#f0a63c' },
};
export const STATUS_NAME = { poison: '독', burn: '화상', paralysis: '마비', chill: '냉기', drowsy: '졸음', confusion: '혼란' };
export const STATUS_COLOR = { poison: '#9346a0', burn: '#e8742e', paralysis: '#e3c21c', chill: '#7ccfcf', drowsy: '#8f86e6', confusion: '#e4517d' };
export const STAT_NAME = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드', accuracy: '명중', evasion: '회피' };
export const WEATHER_NAME = { sun: '쾌청', rain: '비', sand: '모래바람', snow: '설경' };
const CLASS_NAME = { physical: '물리', special: '특수', status: '변화' };
const BAG_NAME = { bag_base: '기본 가방', bag_evo: '진화 가방', bag_pouch: '작은 주머니', bag_2x2: '가방', bag_2x3: '큰 가방', bag_berry: '나무열매 바구니' };

// 조사: 마지막 글자 받침에 따라 (은/는, 이/가, 을/를, 으로/로)
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withFinal}(${withoutFinal})`;
  const final = code % 28;
  if (withFinal === '으로') return word + (final === 0 || final === 8 ? '로' : '으로');   // ㄹ 받침은 '로'
  return word + (final ? withFinal : withoutFinal);
}

export const typeName = (t) => TYPES[t]?.name ?? t;
export const pokemonName = (dex) => POKEMON[dex]?.name ?? String(dex);
export const abilityName = (id) => (id ? ABILITY_DATA[id]?.name ?? id : '미구현 특성');
export const abilityDesc = (id) => ABILITIES[id]?.desc ?? '효과 없음';
export const moveName = (key) => (key === 'struggle' ? '발버둥' : MOVES[key]?.name ?? key);

// 'move:ember' | 'item:charcoal' | 'bag_2x2' → 이름
export function thingName(id) {
  if (id.startsWith('bag_type_')) return `${typeName(id.slice(9))} 타입 가방`;
  if (id.startsWith('bag_')) return BAG_NAME[id] ?? id;
  const [kind, name] = id.split(':');
  return kind === 'move' ? moveName(name) : ITEMS[name]?.name ?? name;
}

export function thingGrade(id) {
  const [kind, name] = id.split(':');
  if (kind === 'move') return MOVES[name].grade;
  if (kind === 'item') return ITEM_RULES[name].grade ?? null;
  return { bag_pouch: 'common', bag_2x2: 'uncommon', bag_2x3: 'rare', bag_berry: 'epic' }[id] ?? (id.startsWith('bag_type_') ? 'rare' : null);
}

export const thingColor = (id) => {
  if (id.startsWith('move:')) return TYPE_COLOR[MOVES[id.slice(5)].type] ?? '#888';
  if (id.startsWith('bag_type_')) return TYPE_COLOR[id.slice(9)];
  return null;
};

const pct = (x) => `${Math.round(x * 100)}%`;

// 도구 효과 설명
function itemDesc(name) {
  const r = ITEM_RULES[name];
  switch (r.kind) {
    case 'typeBoost': return `인접한 ${typeName(r.type)} 기술 피해 +${pct(ITEM.typeBoost)}`;
    case 'choice': return `인접한 ${CLASS_NAME[r.cls]} 기술 피해 +${pct(ITEM.choiceBoost)}. 인접하지 않은 공격기 충전 속도 −${pct(ITEM.choicePenalty)}`;
    case 'scarf': return `인접한 기술 충전 속도 +${pct(ITEM.scarfCharge)}. 인접하지 않은 기술 피해 −${pct(ITEM.scarfPenalty)}`;
    case 'lifeOrb': return `모든 공격기 피해 +${pct(ITEM.lifeOrb)}, 공격기 사용마다 최대 HP ${pct(ITEM.lifeOrbCost)} 잃음`;
    case 'leftovers': return `1초마다 최대 HP ${(ITEM.leftovers * 100).toFixed(1)}% 회복`;
    case 'blackSludge': return `독 타입이면 1초마다 ${pct(ITEM.sludgeHeal)} 회복, 아니면 ${(ITEM.sludgeDamage * 100).toFixed(1)}% 피해`;
    case 'shellBell': return `준 피해의 ${pct(ITEM.shellBell)} 회복`;
    case 'focusSash': return `HP ${pct(ITEM.sashMinHp)} 이상에서 쓰러질 피해를 받으면 1 남김 (전투당 1번)`;
    case 'assaultVest': return `받는 특수 피해 −${pct(ITEM.vestSpecial)}. 변화기 쿨타임 +${pct(ITEM.vestStatusCool)}`;
    case 'rockyHelmet': return `접촉 기술에 맞으면 그 피해의 ${pct(ITEM.helmet)} 반사`;
    case 'expertBelt': return `효과가 굉장한 공격 피해 +${pct(ITEM.expertBelt)}`;
    case 'wideLens': return `인접한 기술 명중률 +${ITEM.wideLens}%p`;
    case 'scopeLens': return '인접한 기술 급소 확률 +1단계';
    case 'quickClaw': return `인접한 기술 시작 충전량 +${pct(ITEM.quickClaw)}`;
    case 'lightClay': return `벽 지속 시간 +${pct(ITEM.lightClay)}`;
    case 'eviolite': return `더 진화할 수 있으면 받는 피해 −${pct(ITEM.eviolite)} (진화가 2단계 남았으면 −${pct(ITEM.evioliteBase)})`;
    case 'everstone': return `가방에 있는 동안 진화할 수 없음. 대신 매 라운드 +${EVERSTONE_GOLD}골드`;
    case 'whiteHerb': return '능력 하락이 걸리면 즉시 모두 제거 (1번)';
    case 'covertCloak': return '상대 공격기의 추가 효과(상태이상, 능력 하락, 풀죽음)를 받지 않음';
    case 'hpBerry': return `HP ${pct(ITEM.hpBerryAt)} 이하가 되면 최대 HP ${pct(name === 'sitrus-berry' ? ITEM.sitrus : ITEM.oran)} 회복 (1번). HP 열매를 여러 개 먹을수록 회복량이 줄어듦`;
    case 'lumBerry': return `아무 상태이상이 ${ITEM.lumStacks}중첩 이상 되면 모두 제거 (1번)`;
    case 'pinchBerry': return `HP ${pct(ITEM.pinchAt)} 이하에서 ${STAT_NAME[r.stat]} +1단계 (1번)`;
    case 'resistBerry': return `${typeName(r.type)} 공격${r.type === 'normal' ? '' : '이 효과가 굉장할 때'} ${ITEM.resistBerryUses}번까지 피해 −${pct(ITEM.resistBerry)}`;
    default: return r.placeable === false ? '살 때 바로 진화하거나, 보관함에 두었다가 눌러서 진화' : '';
  }
}

const FAMILY_DESC = {
  boost1: '자기 능력 상승', boost2: '자기 능력 상승', lower: '상대 능력 하락', heal: '최대 HP 20% 회복 (쓸수록 줄어듦)',
  protect: '2초 안에 받는 다음 공격 피해 −80%', screen: '6초간 받는 피해 −33%', 'aurora-veil': '설경일 때 6초간 모든 피해 −33%',
  weather: '날씨 12초', substitute: '최대 HP 15%로 보호막', 'leech-seed': '10초간 상대 HP 흡수', taunt: '3초간 상대 변화기 충전 정지',
  haze: '양쪽 능력 변화 제거',
};

// 기술 효과 설명 (한 줄씩)
function moveEffects(key) {
  const m = MOVES[key];
  const out = [];
  if (m.family) out.push(FAMILY_DESC[m.family] ?? '');
  for (const [st, n] of Object.entries(STATUS_MOVE_STACKS[key] ?? {})) if (st !== 'toxic') out.push(`${STATUS_NAME[st]} ${n}중첩${STATUS_MOVE_STACKS[key].toxic ? ' + 맹독' : ''}`);
  if (m.statChanges.length) out.push(m.statChanges.map((c) => `${STAT_NAME[c.stat]} ${c.change > 0 ? '+' : ''}${c.change}`).join(', ') + (m.meta?.statChance ? ` (${m.meta.statChance}%)` : ''));
  const st = AILMENT_MAP[m.meta?.ailment];
  if (m.class !== 'status' && st && m.meta.ailmentChance > 0) out.push(`명중마다 ${STATUS_NAME[st]} ${Math.max(1, Math.round(m.meta.ailmentChance / AILMENT_CHANCE_DIV))}중첩`);
  if (m.meta?.flinchChance) out.push(`풀죽음: 상대 충전 −${m.meta.flinchChance / 2}%p`);
  if (m.meta?.minHits) out.push(`${m.meta.minHits}~${m.meta.maxHits}회 공격`);
  if (m.meta?.drain > 0) out.push(`준 피해의 ${m.meta.drain}% 회복`);
  if (m.meta?.drain < 0) out.push(`준 피해의 ${-m.meta.drain}% 반동`);
  if (m.flags.includes('recharge')) out.push('사용 후 1.5초 충전 정지');
  if (m.priority > 0) out.push(`우선도 +${m.priority}: 충전이 미리 차 있음`);
  if (m.priority < 0) out.push(`우선도 ${m.priority}`);
  if (m.flags.includes('contact')) out.push('접촉');
  return out.filter(Boolean);
}

// 진화 도구가 지금 포켓몬을 무엇으로 진화시키는지 (없으면 null)
export const evoTarget = (id, species) => (species ? evolutions(species).find((e) => e.item === id)?.to ?? null : null);

// 내 포켓몬에게 맞는 기술인지: 자속, 쓰는 능력치
export const isStab = (m, species) => !!m.type && POKEMON[species].types.includes(m.type);
function moveFit(m, species) {
  const st = POKEMON[species].stats;
  const stat = m.class === 'physical' ? `공격 ${st.atk}` : `특공 ${st.spa}`;
  return `${pokemonName(species)}의 ${stat} 사용${isStab(m, species) ? ' · 자속 ×1.25' : ''}`;
}

// 툴팁: 제목과 줄 목록
// species를 주면 기술에 "자속", "쓰는 능력치"를 덧붙인다
export function describe(id, species = null) {
  const price = priceOf(id);
  const grade = thingGrade(id);
  const head = [grade && GRADE[grade].name, price && `${price}골드`].filter(Boolean).join(' · ');
  if (id.startsWith('move:')) {
    const key = id.slice(5);
    const m = MOVES[key];
    const lines = [`${typeName(m.type)} · ${CLASS_NAME[m.class]} · ${m.tiles}칸 · ${head}`];
    if (m.class !== 'status') lines.push(`1회 위력 ${m.power1} (원작 ${m.power}) · 쿨타임 ${m.cool}초 · 명중 ${m.accuracy ?? '-'}`);
    else lines.push(`쿨타임 ${m.cool}초 · 명중 ${m.accuracy ?? '-'}`);
    const fit = species && m.class !== 'status' ? moveFit(m, species) : null;
    return { title: m.name, lines: [...lines, fit, ...moveEffects(key)].filter(Boolean) };
  }
  if (id.startsWith('item:')) {
    const name = id.slice(5);
    const size = ITEM_RULES[name].size ? `${ITEM_RULES[name].size}칸` : '진화 도구';
    const to = evoTarget(id, species);
    const evoLine = to && `${pokemonName(species)} → ${josa(pokemonName(to), '으로', '로')} 진화`;
    return { title: thingName(id), lines: [[size, head].filter(Boolean).join(' · '), evoLine, itemDesc(name)].filter(Boolean) };
  }
  const bagLine = id.startsWith('bag_type_') ? `모든 칸이 이 가방 위인 ${typeName(id.slice(9))} 기술 충전 속도 +10%`
    : id === 'bag_berry' ? '안에 있는 열매의 발동 횟수 +1' : id === 'bag_base' || id === 'bag_evo' ? '팔 수 없음' : '물건을 놓을 칸';
  return { title: thingName(id), lines: [head, bagLine].filter(Boolean) };
}
