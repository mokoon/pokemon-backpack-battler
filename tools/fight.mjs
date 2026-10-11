// 명령줄 전투: node tools/fight.mjs a.json b.json --seed 1
// 스냅샷 두 개(DESIGN §11.4)로 전투를 한 번 돌려 사람이 읽을 수 있는 로그를 출력한다.
import { readFileSync } from 'node:fs';
import { simulate } from '../js/sim/battle.js';
import { pokemonName, thingName, abilityName } from '../js/ui/labels.js';
import { eventText } from '../js/ui/log.js';

const args = process.argv.slice(2);
const seedAt = args.indexOf('--seed');
const seed = seedAt >= 0 ? Number(args[seedAt + 1]) : 1;
const files = args.filter((a, i) => !a.startsWith('--') && (seedAt < 0 || i !== seedAt + 1));
if (files.length !== 2 || !Number.isInteger(seed)) {
  console.error('사용법: node tools/fight.mjs a.json b.json [--seed 1]');
  process.exit(1);
}
const [snapA, snapB] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));

const who = { A: `A ${pokemonName(snapA.species)}`, B: `B ${pokemonName(snapB.species)}` };
const sec = (ms) => (ms / 1000).toFixed(1);

let result;
try {
  result = simulate(snapA, snapB, seed);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const start = result.events[0];
const maxHp = start.maxHp;

const describe = (snap) => {
  const moves = snap.items.filter((i) => i.id.startsWith('move:')).map((i) => thingName(i.id));
  const items = snap.items.filter((i) => i.id.startsWith('item:')).map((i) => thingName(i.id));
  return `특성 ${abilityName(snap.ability)} · 라운드 ${snap.round}\n    기술: ${moves.join(', ') || '없음 (발버둥)'}\n    도구: ${items.join(', ') || '없음'}`;
};
console.log(`시드 ${seed}`);
console.log(`${who.A} (HP ${maxHp.A}) ${describe(snapA)}`);
console.log(`${who.B} (HP ${maxHp.B}) ${describe(snapB)}`);
console.log('');

const damage = { A: {}, B: {} };
let lastT = -1;
for (const e of result.events.slice(1, -1)) {
  const time = e.t !== lastT ? `[${sec(e.t).padStart(5)}초] ` : '          ';
  lastT = e.t;
  const text = eventText(e, who, maxHp);
  if (text) console.log(time + text);
  if (e.type === 'hit') damage[e.side][e.move] = (damage[e.side][e.move] ?? 0) + e.damage;
}

const end = result.events.at(-1);
console.log('');
const reason = end.reason === 'time' ? '시간 제한' : '쓰러짐';
console.log(end.winner === 'draw' ? `무승부 (${reason})` : `${who[end.winner]} 승리 (${reason})`);
console.log(`전투 시간 ${sec(result.durationMs)}초`);
for (const side of ['A', 'B']) {
  const parts = Object.entries(damage[side]).sort((a, b) => b[1] - a[1]).map(([m, d]) => `${thingName(`move:${m}`)} ${d}`);
  console.log(`  ${who[side]} 기술별 피해: ${parts.join(', ') || '없음'}`);
}
