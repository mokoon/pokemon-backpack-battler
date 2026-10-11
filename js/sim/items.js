// 도구 효과 준비 (DESIGN §10): 전투 시작 때 기술별 보너스와 전체 효과 값을 계산한다.
// 발동형 효과(열매, 기합의띠 등)는 effects.js / battle.js에서 처리한다.
import { ITEM, ITEM_STACK_WEIGHTS } from '../config.js';
import { ITEM_RULES } from '../rules/items.js';
import { POKEMON } from '../data/pokemon.js';

// n번째(0부터) 같은 이름 도구의 효과 비율
const weight = (i) => ITEM_STACK_WEIGHTS[Math.min(i, ITEM_STACK_WEIGHTS.length - 1)];
// 더하는 효과: 비율 합 (1 + 0.8 + 0.6 + ...)
const stackSum = (n) => Array.from({ length: n }, (_, i) => weight(i)).reduce((a, b) => a + b, 0);
// 받는 피해 감소: 개마다 곱한다 (0이 되지 않게)
const stackReduce = (n, base) => Array.from({ length: n }, (_, i) => 1 - base * weight(i)).reduce((a, b) => a * b, 1);

const children = (species) => Object.keys(POKEMON).map(Number).filter((s) => POKEMON[s].evolvesFrom === species);
// 남은 진화 단계 수 (0이면 최종 진화)
const stagesLeft = (species) => Math.max(0, ...children(species).map((c) => 1 + stagesLeft(c)));

export function setupItems(f) {
  const { build } = f;
  const count = {};
  for (const it of build.items) {
    const kind = ITEM_RULES[it.id].kind;
    count[kind] = (count[kind] ?? 0) + 1;
  }
  const n = (kind) => count[kind] ?? 0;

  for (const m of f.moves) {
    m.dmgBonus = 0;
    m.chargeBonus = 0;
    m.accBonus = 0;
    m.critBonus = 0;
    const attack = m.move.class !== 'status';
    for (const it of build.items) {
      const rule = ITEM_RULES[it.id];
      const adj = it.adj.includes(m.index);
      switch (rule.kind) {
        case 'typeBoost':
          if (adj && m.move.type === rule.type) m.dmgBonus += ITEM.typeBoost;
          break;
        case 'choice':
          if (adj && m.move.class === rule.cls) m.dmgBonus += ITEM.choiceBoost;
          if (!adj && attack) m.chargeBonus -= ITEM.choicePenalty;
          break;
        case 'scarf':
          if (adj) m.chargeBonus += ITEM.scarfCharge;
          else m.dmgBonus -= ITEM.scarfPenalty;
          break;
        case 'wideLens':
          if (adj) m.accBonus += ITEM.wideLens;
          break;
        case 'scopeLens':
          if (adj) m.critBonus += ITEM.scopeLens;
          break;
        case 'quickClaw':
          if (adj) m.charge += ITEM.quickClaw;
          break;
      }
    }
    if (attack) m.dmgBonus += ITEM.lifeOrb * stackSum(n('lifeOrb'));
    if (m.move.type && m.onBags.includes(`bag_type_${m.move.type}`)) m.chargeBonus += ITEM.typeBag;
    if (!attack) m.coolMs *= 1 + ITEM.vestStatusCool * stackSum(n('assaultVest'));
    m.charge = Math.min(1, m.charge);
  }

  const poison = f.types.includes('poison');
  // 진화의휘석: 최종 진화면 효과 없음, 진화가 2단계 남았으면 더 크게 (1단계에 머무는 전략, §2.3)
  const evio = [0, ITEM.eviolite, ITEM.evioliteBase][Math.min(2, stagesLeft(f.species))];
  f.item = {
    expertBelt: ITEM.expertBelt * stackSum(n('expertBelt')),
    lifeOrbCost: ITEM.lifeOrbCost * stackSum(n('lifeOrb')),
    leftovers: ITEM.leftovers * stackSum(n('leftovers')),
    sludgeHeal: poison ? ITEM.sludgeHeal * stackSum(n('blackSludge')) : 0,
    sludgeDamage: poison ? 0 : ITEM.sludgeDamage * stackSum(n('blackSludge')),
    shellBell: ITEM.shellBell * stackSum(n('shellBell')),
    helmet: ITEM.helmet * stackSum(n('rockyHelmet')),
    lightClay: ITEM.lightClay * stackSum(n('lightClay')),
    specialTaken: stackReduce(n('assaultVest'), ITEM.vestSpecial),
    allTaken: evio ? stackReduce(n('eviolite'), evio) : 1,
    cloak: n('covertCloak') > 0,
  };
  f.sash = n('focusSash') > 0;          // 전투당 1번
  // 1회성 도구: 가방 읽기 순서대로, 나무열매 바구니 안 열매는 발동 +1
  f.once = build.items
    .filter((it) => ITEM_RULES[it.id].once)
    .map((it) => ({
      id: it.id,
      ...ITEM_RULES[it.id],
      uses: (ITEM_RULES[it.id].kind === 'resistBerry' ? ITEM.resistBerryUses : 1)
        + (ITEM_RULES[it.id].berry && it.onBags.includes('bag_berry') ? ITEM.basketUses : 0),
    }));
}

// 조건에 맞는 1회성 도구 하나를 쓴다 (남은 횟수 −1). 없으면 null
export function takeOnce(f, pred) {
  const it = f.once.find((o) => o.uses > 0 && pred(o));
  if (it) it.uses--;
  return it ?? null;
}
