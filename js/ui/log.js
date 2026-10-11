// 전투 이벤트 → 한국어 한 줄 (전투 화면과 tools/fight.mjs가 같이 쓴다). DOM 없음.
import { STATUS_NAME, STAT_NAME, WEATHER_NAME, moveName, thingName, abilityName, josa } from './labels.js';

const SOURCE = { poison: '독', burn: '화상', sand: '모래바람', 'leech-seed': '씨뿌리기', fatigue: '피로', 'solar-power': '선파워', 'rain-dish': '젖은접시' };
const sourceName = (id) => SOURCE[id] ?? (id === 'struggle' ? '발버둥' : thingName(`item:${id}`) !== id ? thingName(`item:${id}`) : moveName(id));
const sec = (ms) => (ms / 1000).toFixed(1);

// who: { A: '이름', B: '이름' }, maxHp: { A, B }. 표시하지 않을 이벤트는 null
export function eventText(e, who, maxHp) {
  const me = who[e.side];
  const foe = e.side === 'A' ? 'B' : 'A';
  const hp = (side, v) => `${Math.max(0, v)}/${maxHp[side]}`;
  switch (e.type) {
    case 'use': return `${me}의 ${moveName(e.move)}!`;
    case 'miss': return '  빗나감';
    case 'hit': {
      if (e.eff === 0) return '  효과가 없다';
      const notes = [];
      if (e.eff > 1) notes.push('효과가 굉장했다');
      if (e.eff < 1) notes.push('효과가 별로');
      if (e.crit) notes.push('급소');
      if (e.sub) notes.push(`대타출동이 ${e.sub} 대신 받음`);
      return `  → ${e.damage} 피해${notes.length ? ` (${notes.join(', ')})` : ''}  ${who[foe]} HP ${hp(foe, e.hp)}`;
    }
    case 'recoil': return `  ${me} ${sourceName(e.move)} 반동 ${e.damage}  HP ${hp(e.side, e.hp)}`;
    case 'dot': return `  ${me} ${sourceName(e.source)} 피해 ${e.damage}  HP ${hp(e.side, e.hp)}`;
    case 'heal': return `  ${me} ${josa(sourceName(e.source), '으로', '로')} ${e.amount} 회복  HP ${hp(e.side, e.hp)}`;
    case 'stage': return e.change === 0
      ? `  ${me} ${STAT_NAME[e.stat]} 변화 → ${e.stage > 0 ? '+' : ''}${e.stage}`
      : `  ${me} ${STAT_NAME[e.stat]} ${e.change > 0 ? '+' : ''}${e.change} → ${e.stage > 0 ? '+' : ''}${e.stage}단계`;
    case 'status': return `  ${me} ${STATUS_NAME[e.status]} ${e.stacks}중첩`;
    case 'sleep': return `  ${me} 잠들었다 (${sec(e.until - e.t)}초)`;
    case 'freeze': return `  ${me} 얼어붙었다 (${sec(e.until - e.t)}초)`;
    case 'recharge': return `  ${me} 반동으로 쉰다 (${sec(e.until - e.t)}초)`;
    case 'flinch': return `  ${me} 풀죽음: ${moveName(e.move)} 충전 ${Math.round(e.charge * 100)}%`;
    case 'confused': return `  혼란으로 자신을 공격! ${e.damage} 피해  HP ${hp(e.side, e.hp)}`;
    case 'fail': return '  실패';
    case 'protect': return `  ${me} 방어 태세`;
    case 'screen': return `  ${me} ${moveName(e.move)} (${sec(e.until - e.t)}초)`;
    case 'weather': return e.weather ? `  날씨: ${WEATHER_NAME[e.weather]} (${sec(e.until - e.t)}초)` : '  날씨가 원래대로 돌아왔다';
    case 'substitute': return `  ${me} 대타출동 (HP ${e.amount})`;
    case 'leech-seed': return `  ${me}에게 씨가 심어졌다`;
    case 'taunt': return `  ${me} 도발당했다`;
    case 'item': return `  ${me}의 ${thingName(`item:${e.item}`)} 발동`;
    case 'ability': return `  ${me}의 ${abilityName(e.ability)} 발동`;
    default: return null;
  }
}
