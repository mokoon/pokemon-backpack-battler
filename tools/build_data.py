"""PokeAPI CSV → js/data/*.js, 도구 아이콘 → assets/items/

실행: python tools/build_data.py
CSV는 tools/.cache/에 받아 두고 다시 쓴다 (지우면 새로 받음).
규칙은 docs/DESIGN.md §2.3, §5, §10.2, §1.1.
"""
import csv
import io
import json
import math
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
OUT = ROOT / 'js' / 'data'
ICONS = ROOT / 'assets' / 'items'

CSV_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/{}.csv'
ITEM_ICON_URL = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/{}.png'
SHOWDOWN_SHEET_URL = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png'
TRACKER_URL = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json'
CREDIT_NAMES_URL = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/credit_names.txt'

KO = 3            # local_language_id 한국어
MAX_DEX = 1025
EXCLUDED_VERSION_GROUPS = {19, 24, 28, 29, 30, 31, 32}   # §5.1

# §5.2 PP → 기본 쿨타임(초)
PP_COOL = [(5, 8.0), (10, 6.0), (15, 5.0), (20, 4.2), (25, 3.6), (30, 3.2), (35, 2.8), (40, 2.5)]
SLOW_PRIORITY_COOL_MUL = 1.2   # 우선도 −1 이하
CHARGE_COOL_MUL = 1.3          # 2턴 기술 (§5.7)

SELF_FAINT = {'explosion', 'self-destruct', 'misty-explosion'}
# 원작에서 조건이 있어야 쓰이는 기술 (실시간 전투에서는 조건을 옮기기 어려움, DESIGN §5.1)
CONDITIONAL = {
    'snore', 'sleep-talk',            # 자신이 잠들어 있을 때
    'dream-eater',                    # 상대가 잠들어 있을 때
    'fake-out', 'first-impression',   # 나온 첫 턴
    'focus-punch',                    # 맞으면 실패
    'last-resort',                    # 다른 기술을 모두 쓴 뒤
    'belch',                          # 열매를 먹은 뒤
    'synchronoise',                   # 상대와 타입이 같을 때
    'steel-roller',                   # 필드가 있을 때
    'upper-hand',                     # 상대가 우선도 기술을 쓸 때만
}

# PokeAPI move_meta가 없는 8~9세대 기술의 원작 효과 (손으로 보충, DESIGN §18.1).
# 키: 추가 효과(ailment/ailmentChance), 풀죽음(flinch), 급소 단계(crit), 반동·흡수(drain, 음수면 반동),
# 연속(hits=(min, max)), 능력 변화(stats=[(능력, 변화)], self=True면 자신, chance=확률 %).
# 원작 효과 중 이 게임에 없는 것(필드, 회복 봉인, 조건부 위력 등)은 빼고 기본 공격만 둔다.
META_PATCH = {
    'dire-claw': {'ailment': 'poison', 'ailmentChance': 50},          # 원작: 독/마비/잠듦 중 하나 50%
    'psyshield-bash': {'stats': [('def', 1)], 'self': True},
    'springtide-storm': {'stats': [('atk', -1)], 'chance': 30},
    'mystical-power': {'stats': [('spa', 1)], 'self': True},
    'chloroblast': {'drain': -50},                                     # 원작: 최대 HP의 50% 반동
    'mountain-gale': {'flinch': 30},
    'headlong-rush': {'stats': [('def', -1), ('spd', -1)], 'self': True},
    'barb-barrage': {'ailment': 'poison', 'ailmentChance': 50},
    'esper-wing': {'crit': 1, 'stats': [('spe', 1)], 'self': True},
    'bitter-malice': {'stats': [('atk', -1)]},
    'triple-arrows': {'crit': 1, 'flinch': 30, 'stats': [('def', -1)], 'chance': 50},
    'infernal-parade': {'ailment': 'burn', 'ailmentChance': 30},
    'ceaseless-edge': {'crit': 1},
    'bleakwind-storm': {'stats': [('spe', -1)], 'chance': 30},
    'wildbolt-storm': {'ailment': 'paralysis', 'ailmentChance': 20},
    'sandsear-storm': {'ailment': 'burn', 'ailmentChance': 20},
    'axe-kick': {'ailment': 'confusion', 'ailmentChance': 30},
    'lumina-crash': {'stats': [('spd', -2)]},
    'spin-out': {'stats': [('spe', -2)], 'self': True},
    'population-bomb': {'hits': (1, 10)},
    'triple-dive': {'hits': (3, 3)},
    'mortal-spin': {'ailment': 'poison', 'ailmentChance': 100},
    'flower-trick': {'crit': 2},                                       # 원작: 반드시 급소
    'torch-song': {'stats': [('spa', 1)], 'self': True},
    'aqua-step': {'stats': [('spe', 1)], 'self': True},
    'make-it-rain': {'stats': [('spa', -1)], 'self': True},
    'pounce': {'stats': [('spe', -1)]},
    'trailblaze': {'stats': [('spe', 1)], 'self': True},
    'chilling-water': {'stats': [('atk', -1)]},
    'twin-beam': {'hits': (2, 2)},
    'armor-cannon': {'stats': [('def', -1), ('spd', -1)], 'self': True},
    'bitter-blade': {'drain': 50},
    'aqua-cutter': {'crit': 1},
    'blazing-torque': {'ailment': 'burn', 'ailmentChance': 30},
    'wicked-torque': {'ailment': 'sleep', 'ailmentChance': 10},
    'noxious-torque': {'ailment': 'poison', 'ailmentChance': 30},
    'combat-torque': {'ailment': 'paralysis', 'ailmentChance': 30},
    'magical-torque': {'ailment': 'confusion', 'ailmentChance': 30},
    'matcha-gotcha': {'drain': 50, 'ailment': 'burn', 'ailmentChance': 20},
    'ivy-cudgel': {'crit': 1},
    'tachyon-cutter': {'hits': (2, 2)},
    'malignant-chain': {'ailment': 'poison', 'ailmentChance': 50},
    'wave-crash': {'drain': -33},
}


def patched_meta(ident):
    p = META_PATCH.get(ident, {})
    hits = p.get('hits', (None, None))
    stats = p.get('stats', [])
    category = ('damage-raise' if p.get('self') else 'damage-lower') if stats else (
        'damage-ailment' if p.get('ailment') else 'damage')
    meta = {
        'category': category, 'ailment': p.get('ailment', 'none'), 'minHits': hits[0], 'maxHits': hits[1],
        'drain': p.get('drain', 0), 'healing': 0, 'critRate': p.get('crit', 0),
        'ailmentChance': p.get('ailmentChance', 0), 'flinchChance': p.get('flinch', 0),
        'statChance': p.get('chance', 0) if stats else 0,
    }
    return meta, stats

# §5.8 변화기 효과 계열 (능력 변화 계열은 move_meta로 판정)
STATUS_FAMILY = {
    # 상태이상 / 수면 / 혼란 (§8.3 표)
    'poison-powder': 'ailment', 'poison-gas': 'ailment', 'toxic': 'ailment',
    'will-o-wisp': 'ailment', 'thunder-wave': 'ailment', 'glare': 'ailment', 'stun-spore': 'ailment',
    'hypnosis': 'sleep', 'sing': 'sleep', 'lovely-kiss': 'sleep', 'sleep-powder': 'sleep', 'spore': 'sleep',
    'confuse-ray': 'confuse', 'supersonic': 'confuse', 'swagger': 'confuse',
    # 방어
    'protect': 'protect', 'detect': 'protect', 'spiky-shield': 'protect',
    'kings-shield': 'protect', 'baneful-bunker': 'protect', 'obstruct': 'protect',
    'silk-trap': 'protect', 'burning-bulwark': 'protect',
    'reflect': 'screen', 'light-screen': 'screen', 'aurora-veil': 'aurora-veil',
    'sunny-day': 'weather', 'rain-dance': 'weather', 'sandstorm': 'weather', 'snowscape': 'weather',
    'substitute': 'substitute', 'leech-seed': 'leech-seed', 'taunt': 'taunt', 'haze': 'haze',
}
FAMILY_TILES = {
    'boost1': 1, 'boost2': 2, 'lower': 1, 'ailment': 2, 'confuse': 2, 'heal': 2, 'protect': 2,
    'screen': 3, 'aurora-veil': 4, 'weather': 2, 'substitute': 2, 'leech-seed': 2, 'taunt': 2, 'haze': 2,
}

# §5.6 모양 (칸 수 → 물리 / 특수·변화)
SHAPES = {
    1: ('1', '1'), 2: ('I2', 'I2'), 3: ('I3', 'L3'), 4: ('L4', 'O4'), 5: ('L5', 'P5'), 6: ('R6', 'R6'),
}
GRADES = {1: 'common', 2: 'common', 3: 'uncommon', 4: 'rare', 5: 'epic', 6: 'legendary'}

# §10.2 MVP 도구 + §2.3 진화 도구 (68개)
MVP_ITEMS = [
    'charcoal', 'mystic-water', 'magnet', 'miracle-seed', 'never-melt-ice', 'black-belt',
    'poison-barb', 'soft-sand', 'sharp-beak', 'twisted-spoon', 'silver-powder', 'hard-stone',
    'spell-tag', 'dragon-fang', 'black-glasses', 'metal-coat', 'silk-scarf', 'fairy-feather',
    'life-orb', 'choice-band', 'choice-specs', 'choice-scarf', 'leftovers', 'black-sludge',
    'shell-bell', 'focus-sash', 'assault-vest', 'rocky-helmet', 'expert-belt', 'wide-lens',
    'scope-lens', 'quick-claw', 'light-clay', 'eviolite', 'everstone', 'white-herb', 'covert-cloak',
    'sitrus-berry', 'oran-berry', 'lum-berry',
    'liechi-berry', 'ganlon-berry', 'salac-berry', 'petaya-berry', 'apicot-berry',
    'occa-berry', 'passho-berry', 'wacan-berry', 'rindo-berry', 'yache-berry', 'chople-berry',
    'kebia-berry', 'shuca-berry', 'coba-berry', 'payapa-berry', 'tanga-berry', 'charti-berry',
    'kasib-berry', 'haban-berry', 'colbur-berry', 'babiri-berry', 'roseli-berry', 'chilan-berry',
    'rare-candy', 'thunder-stone', 'linking-cord', 'soothe-bell', 'oval-stone',
]
ITEM_NAME_FALLBACK = {'roseli-berry': '로셀열매'}   # PokeAPI에 한국어 이름이 없음
SHOWDOWN_ICONS = {'covert-cloak': 750, 'fairy-feather': 754}   # §1.1 시트 칸 번호
HAND_DRAWN = {'linking-cord'}


# ---------- 공통 ----------

def fetch(url, path):
    if not path.exists():
        print('받는 중', url)
        req = urllib.request.Request(url, headers={'User-Agent': 'pokemon-backpack-battler-build'})
        with urllib.request.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
    return path


def rows(name):
    path = fetch(CSV_URL.format(name), CACHE / f'{name}.csv')
    with open(path, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def num(s):
    return int(s) if s not in ('', None) else None


def ko_names(name, key):
    return {int(r[key]): r['name'] for r in rows(name) if r['local_language_id'] == str(KO)}


def round_half_up(x):
    return math.floor(x + 0.5 + 1e-9)


def write_js(name, exports):
    body = '// [자동 생성] tools/build_data.py — 손으로 고치지 말 것\n'
    for key, value in exports.items():
        body += f'export const {key} = {json.dumps(value, ensure_ascii=False, separators=(",", ":"))};\n'
    (OUT / f'{name}.js').write_text(body, encoding='utf-8')
    print(f'  js/data/{name}.js  {len(body.encode("utf-8")) // 1024} KB')


# ---------- 타입 ----------

def build_types():
    # 18타입만 (스텔라는 테라스탈 전용, 10000번 이후는 ??? 타입)
    types = {int(r['id']): r['identifier'] for r in rows('types') if int(r['id']) < 10000 and r['identifier'] != 'stellar'}
    names = ko_names('type_names', 'type_id')
    chart = defaultdict(dict)
    for r in rows('type_efficacy'):
        a, d, f = int(r['damage_type_id']), int(r['target_type_id']), int(r['damage_factor'])
        if a in types and d in types and f != 100:
            chart[types[a]][types[d]] = f / 100
    write_js('typechart', {
        'TYPES': {types[i]: {'name': names.get(i, types[i])} for i in sorted(types)},
        'TYPE_CHART': chart,
    })
    return types


# ---------- 기술 ----------

def base_cool(pp):
    for limit, cool in PP_COOL:
        if pp <= limit:
            return cool
    return PP_COOL[-1][1]


def status_family(ident, meta, stat_changes, target):
    if ident in STATUS_FAMILY:
        return STATUS_FAMILY[ident]
    cat = meta['category'] if meta else None
    if cat == 'heal' and target == 'user':
        return 'heal'
    if cat == 'net-good-stats' and stat_changes:
        changes = [c for _, c in stat_changes]
        if target == 'user' and all(c > 0 for c in changes):
            if changes == [1]:
                return 'boost1'
            if changes == [2] or changes == [1, 1]:
                return 'boost2'
        if target != 'user' and all(c < 0 for c in changes):
            return 'lower'
    return None


def build_moves(types):
    names = ko_names('move_names', 'move_id')
    classes = {int(r['id']): r['identifier'] for r in rows('move_damage_classes')}
    targets = {int(r['id']): r['identifier'] for r in rows('move_targets')}
    ailments = {int(r['id']): r['identifier'] for r in rows('move_meta_ailments')}
    meta_cats = {int(r['id']): r['identifier'] for r in rows('move_meta_categories')}
    stat_ids = {1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe', 7: 'accuracy', 8: 'evasion'}
    flag_names = {int(r['id']): r['identifier'] for r in rows('move_flags')}

    flags = defaultdict(list)
    for r in rows('move_flag_map'):
        flags[int(r['move_id'])].append(flag_names[int(r['move_flag_id'])])
    stat_changes = defaultdict(list)
    for r in rows('move_meta_stat_changes'):
        stat_changes[int(r['move_id'])].append((stat_ids[int(r['stat_id'])], int(r['change'])))
    metas = {}
    for r in rows('move_meta'):
        metas[int(r['move_id'])] = {
            'category': meta_cats[int(r['meta_category_id'])],
            'ailment': ailments.get(int(r['meta_ailment_id']), 'none'),
            'minHits': num(r['min_hits']), 'maxHits': num(r['max_hits']),
            'drain': int(r['drain']), 'healing': int(r['healing']), 'critRate': int(r['crit_rate']),
            'ailmentChance': int(r['ailment_chance']), 'flinchChance': int(r['flinch_chance']),
            'statChance': int(r['stat_chance']),
        }

    moves = {}
    for r in rows('moves'):
        mid = int(r['id'])
        if mid >= 10000:   # 다크 기술 (콜로세움)
            continue
        ident = r['identifier']
        power, pp, acc, prio = num(r['power']), num(r['pp']), num(r['accuracy']), int(r['priority'])
        cls = classes[int(r['damage_class_id'])]
        target = targets[int(r['target_id'])]
        meta = metas.get(mid)
        changes = stat_changes.get(mid, [])
        if meta is None and cls != 'status':
            # meta가 없는 공격기(8~9세대 일부)는 META_PATCH로 원작 효과를 채운다 (DESIGN §18.1)
            meta, changes = patched_meta(ident)
        elif meta is None:
            changes = []   # meta 없는 변화기는 능력 변화 대상(자신/상대)을 알 수 없음
        mflags = flags.get(mid, [])
        m = {
            'id': mid, 'name': names.get(mid, ident), 'type': types.get(int(r['type_id'])),
            'class': cls, 'power': power, 'pp': pp, 'accuracy': acc, 'priority': prio,
            'target': target, 'flags': mflags, 'meta': meta,
            'statChanges': [{'stat': s, 'change': c} for s, c in changes],
            'ep': None, 'tiles': None, 'tileAdj': None, 'cool': None,
            'power1': None, 'perSec': None, 'shape': None, 'grade': None, 'family': None,
            'excluded': False, 'excludeReason': None,
        }
        moves[ident] = m

        if not pp or pp <= 1:
            m['excluded'], m['excludeReason'] = True, 'pp1'
            continue
        if ident in CONDITIONAL:
            m['excluded'], m['excludeReason'] = True, 'conditional'
            continue
        cool = base_cool(pp)
        if prio <= -1:
            cool *= SLOW_PRIORITY_COOL_MUL
        if 'charge' in mflags:
            cool *= CHARGE_COOL_MUL
        m['cool'] = round(cool, 2)

        if cls == 'status':
            fam = status_family(ident, meta, changes, target)
            if fam is None:
                m['excluded'], m['excludeReason'] = True, 'no-family'
                continue
            m['family'] = fam
            tiles = FAMILY_TILES.get(fam) or (2 if (acc or 100) <= 80 else 3)   # 수면: 명중 80% 이하 2칸
        else:
            if not power or power <= 1:   # 위력 1 = 피해가 상황에 따라 정해지는 기술 (카타스트로피 등)
                m['excluded'], m['excludeReason'] = True, 'no-power'
                continue
            if ident in SELF_FAINT:
                m['excluded'], m['excludeReason'] = True, 'self-faint'
                continue
            lo, hi = (meta['minHits'], meta['maxHits']) if meta else (None, None)
            hits = 3.1 if (lo, hi) == (2, 5) else ((lo + hi) / 2 if lo and hi else 1)
            ep = power * hits * ((acc or 100) / 100)   # 명중이 비었거나 0이면 반드시 맞음
            tiles = min(6, max(1, math.floor(ep / 30 + 0.5)))
            target_eff = 30 * (1 + 0.03 * (tiles - 1))
            tile_adj = min(1.20, max(0.85, target_eff * tiles / ep))
            m['ep'] = round(ep, 2)
            m['tileAdj'] = round(tile_adj, 4)
            m['power1'] = round_half_up(power * tile_adj * cool / 4)
            m['perSec'] = round(ep * tile_adj / 4, 2)
        m['tiles'] = tiles
        m['shape'] = SHAPES[tiles][0 if cls == 'physical' else 1]
        m['grade'] = GRADES[tiles]

    write_js('moves', {'MOVES': moves})
    return moves


# ---------- 포켓몬, 배우는 기술 ----------

def build_pokemon(types, moves):
    names = ko_names('pokemon_species_names', 'pokemon_species_id')
    abil_ident = {int(r['id']): r['identifier'] for r in rows('abilities')}
    items = {int(r['id']): r['identifier'] for r in rows('items')}
    triggers = {int(r['id']): r['identifier'] for r in rows('evolution_triggers')}
    stat_keys = {1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe'}

    ptypes, stats, abils = defaultdict(list), defaultdict(dict), defaultdict(list)
    for r in sorted(rows('pokemon_types'), key=lambda r: int(r['slot'])):
        ptypes[int(r['pokemon_id'])].append(types[int(r['type_id'])])
    for r in rows('pokemon_stats'):
        stats[int(r['pokemon_id'])][stat_keys[int(r['stat_id'])]] = int(r['base_stat'])
    for r in rows('pokemon_abilities'):
        abils[int(r['pokemon_id'])].append({
            'id': abil_ident[int(r['ability_id'])], 'slot': int(r['slot']), 'hidden': r['is_hidden'] == '1'})

    # 진화 방법 (§2.3): 진화된 종마다 첫 행만 사용
    evo = {}
    for r in sorted(rows('pokemon_evolution'), key=lambda r: int(r['id'])):
        sid = int(r['evolved_species_id'])
        if sid in evo:
            continue
        trig = triggers[int(r['evolution_trigger_id'])]
        level, held = num(r['minimum_level']), num(r['held_item_id'])
        if trig == 'use-item':
            item = items[int(r['trigger_item_id'])]
        elif trig == 'trade':
            item = 'linking-cord'
        elif trig == 'level-up' and held:
            item = items[held]
        elif trig == 'level-up' and r['minimum_happiness']:
            item = 'soothe-bell'
        elif trig == 'level-up' and level:
            item = 'rare-candy'
        else:
            item = None
        evo[sid] = {'trigger': trig, 'level': level, 'item': item}

    # 배우는 기술: 그 포켓몬 자신의 본편 기술 합집합 (§5.1)
    move_ident = {m['id']: k for k, m in moves.items()}
    learn = defaultdict(set)
    levelup = defaultdict(dict)   # pid → {move ident: 최저 레벨}
    for r in rows('pokemon_moves'):
        pid, vg = int(r['pokemon_id']), int(r['version_group_id'])
        if pid > MAX_DEX or vg in EXCLUDED_VERSION_GROUPS:
            continue
        ident = move_ident.get(int(r['move_id']))
        if ident is None:
            continue
        learn[pid].add(ident)
        lv = num(r['level'])
        if r['pokemon_move_method_id'] == '1' and lv and lv >= 1:
            levelup[pid][ident] = min(lv, levelup[pid].get(ident, 999))

    def usable_attack(ident):
        m = moves[ident]
        return m['class'] != 'status' and not m['excluded']

    def start_move(pid):
        # §4.4: 가장 낮은 레벨에 배우는 공격기 (자기 타입 공격기가 있으면 그중에서),
        # 없으면 배울 수 있는 공격기 중 위력이 가장 낮은 것
        cands = [(lv, moves[i]['power'], moves[i]['id'], i) for i, lv in levelup[pid].items() if usable_attack(i)]
        if not cands:
            cands = [(0, moves[i]['power'], moves[i]['id'], i) for i in learn[pid] if usable_attack(i)]
        own = [c for c in cands if moves[c[3]]['type'] in ptypes[pid]]
        return min(own or cands)[3] if cands else None

    pokemon = {}
    for r in rows('pokemon_species'):
        sid = int(r['id'])
        st = stats[sid]
        pokemon[sid] = {
            'name': names.get(sid, r['identifier']), 'identifier': r['identifier'],
            'types': ptypes[sid], 'stats': st, 'bst': sum(st.values()),
            'abilities': sorted(abils[sid], key=lambda a: a['slot']),
            'evolvesFrom': num(r['evolves_from_species_id']), 'chain': int(r['evolution_chain_id']),
            'baby': r['is_baby'] == '1', 'legendary': r['is_legendary'] == '1', 'mythical': r['is_mythical'] == '1',
            'evo': evo.get(sid), 'startMove': start_move(sid),
        }

    learnsets = {sid: sorted(moves[i]['id'] for i in learn[sid]) for sid in pokemon}
    write_js('pokemon', {'POKEMON': pokemon})
    write_js('learnsets', {'LEARNSETS': learnsets})
    return pokemon, learnsets


# ---------- 특성, 도구 ----------

def build_abilities():
    names = ko_names('ability_names', 'ability_id')
    flavor = {}
    for r in sorted(rows('ability_flavor_text'), key=lambda r: int(r['version_group_id'])):
        if r['language_id'] == str(KO):
            flavor[int(r['ability_id'])] = ' '.join(r['flavor_text'].split())
    abilities = {}
    for r in rows('abilities'):
        if r['is_main_series'] != '1':
            continue
        aid = int(r['id'])
        abilities[r['identifier']] = {'id': aid, 'name': names.get(aid, r['identifier']), 'desc': flavor.get(aid, '')}
    write_js('abilities', {'ABILITIES': abilities})
    return abilities


def build_items():
    names = ko_names('item_names', 'item_id')
    ids = {r['identifier']: int(r['id']) for r in rows('items')}
    items = {}
    for ident in MVP_ITEMS:
        iid = ids.get(ident)
        items[ident] = {'id': iid, 'name': names.get(iid) or ITEM_NAME_FALLBACK.get(ident, ident)}
    write_js('items', {'ITEMS': items})
    return items


def build_icons():
    from PIL import Image, ImageDraw
    ICONS.mkdir(parents=True, exist_ok=True)
    failed = []
    for ident in MVP_ITEMS:
        path = ICONS / f'{ident}.png'
        if path.exists() or ident in SHOWDOWN_ICONS or ident in HAND_DRAWN:
            continue
        try:
            fetch(ITEM_ICON_URL.format(ident), path)
        except Exception as e:
            failed.append(f'{ident} ({e})')

    sheet = None
    for ident, n in SHOWDOWN_ICONS.items():
        path = ICONS / f'{ident}.png'
        if path.exists():
            continue
        if sheet is None:
            sheet = Image.open(io.BytesIO(fetch(SHOWDOWN_SHEET_URL, CACHE / 'itemicons-sheet.png').read_bytes()))
        x, y = (n % 16) * 24, (n // 16) * 24
        sheet.crop((x, y, x + 24, y + 24)).save(path)

    # 연결의끈: 직접 그린 단순 끈 아이콘 (§1.1)
    path = ICONS / 'linking-cord.png'
    if not path.exists():
        img = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.line([(3, 18), (8, 8), (12, 14), (16, 6), (21, 12)], fill=(60, 60, 70, 255), width=4)
        d.line([(3, 18), (8, 8), (12, 14), (16, 6), (21, 12)], fill=(120, 200, 255, 255), width=2)
        d.ellipse([1, 16, 6, 21], fill=(250, 210, 60, 255))
        d.ellipse([18, 9, 23, 14], fill=(250, 210, 60, 255))
        img.save(path)
    return failed


# ---------- 스프라이트 제작자 (§1: 크레딧 표시 의무) ----------

def config_list(name):
    config = (ROOT / 'js' / 'config.js').read_text(encoding='utf-8')
    return [int(x) for x in re.search(name + r'\s*=\s*\[([^\]]*)\]', config).group(1).split(',')]


def build_credits(pokemon):
    tracker = json.loads(fetch(TRACKER_URL, CACHE / 'tracker.json').read_text(encoding='utf-8'))
    names = {}
    for line in fetch(CREDIT_NAMES_URL, CACHE / 'credit_names.txt').read_text(encoding='utf-8').splitlines()[1:]:
        cols = line.split('	')
        if len(cols) >= 2 and cols[0]:
            names[cols[1]] = cols[0]

    def people(credit):
        ids = [credit.get('primary')] + credit.get('secondary', [])
        # 이름이 등록되지 않은 사람은 Discord ID로 (<@!123> → Discord 123)
        return [names.get(i) or re.sub(r'^<@!?(\d+)>$', r'Discord \1', i) for i in ids if i]

    # 게임에 나오는 포켓몬: 시작 후보 계통 전부 + 보스
    chains = {pokemon[s]['chain'] for s in config_list('STARTER_POOL')}
    used = sorted({s for s, p in pokemon.items() if p['chain'] in chains} | set(config_list('BOSS_POOL')))
    credits = {}
    for dex in used:
        node = tracker.get(f'{dex:04d}', {})
        shiny = node.get('subgroups', {}).get('0000', {}).get('subgroups', {}).get('0001', {})
        credits[dex] = {
            'sprite': people(node.get('sprite_credit', {})),
            'portrait': people(node.get('portrait_credit', {})),
            'shiny': people(shiny.get('sprite_credit', {})) if shiny else [],
        }
    write_js('credits', {'CREDITS': credits})


# ---------- 요약 ----------

def summary(pokemon, moves, learnsets, abilities, icon_failed):
    pool = config_list('STARTER_POOL')
    rules_path = ROOT / 'js' / 'rules' / 'abilities.js'
    rules = rules_path.read_text(encoding='utf-8') if rules_path.exists() else ''
    done = set(re.findall(r"'([a-z0-9-]+)'\s*:\s*\{\s*status:\s*'(?:ok|changed|economy)'", rules))

    # 풀을 넓힐 때 기준 (§2.2): 2단 이상 계통의 첫 단계, 전설·환상 제외
    has_child = {p['evolvesFrom'] for p in pokemon.values() if p['evolvesFrom']}
    eligible = [s for s, p in pokemon.items()
                if p['evolvesFrom'] is None and s in has_child and not p['legendary'] and not p['mythical']]

    pool_chains = {pokemon[s]['chain'] for s in pool}
    line_species = [s for s, p in pokemon.items() if p['chain'] in pool_chains]
    line_abilities = sorted({a['id'] for s in line_species for a in pokemon[s]['abilities']})
    todo = [a for a in line_abilities if a not in done]

    usable = [k for k, m in moves.items() if not m['excluded']]
    reasons = defaultdict(int)
    for m in moves.values():
        if m['excluded']:
            reasons[m['excludeReason']] += 1
    empty = [f'{s} {pokemon[s]["name"]}' for s, ids in learnsets.items() if not ids]
    icons = len(list(ICONS.glob('*.png')))

    print('\n===== 요약 =====')
    print(f'포켓몬: {len(pokemon)}')
    print(f'시작 후보 (STARTER_POOL): {len(pool)}마리, 풀 확장 기준에 맞는 포켓몬: {len(eligible)}마리')
    print(f'기술: 전체 {len(moves)}, 사용 가능 {len(usable)}, 제외 {dict(reasons)}')
    print(f'배울 기술이 비는 포켓몬 ({len(empty)}): {", ".join(empty) or "없음"}')
    print(f'특성: {len(abilities)}개. 시작 후보 계통 특성 {len(line_abilities)}개 중 todo {len(todo)}개')
    print(f'도구 아이콘: {icons}개 (assets/items/)' + (f', 실패: {icon_failed}' if icon_failed else ''))
    print('시작 후보 계통:')
    for s in sorted(line_species, key=lambda s: (pokemon[s]['chain'], s)):
        p = pokemon[s]
        evo = p['evo']
        evo_txt = f'{evo["item"]} (lv {evo["level"]})' if evo else '-'
        sm = p['startMove']
        print(f'  {s:4} {p["name"]:6} {"/".join(p["types"]):16} BST {p["bst"]:3}  진화 {evo_txt:22} '
              f'시작 기술 {moves[sm]["name"] if sm else "-"}  기술 {len(learnsets[s])}개  '
              f'특성 {", ".join(a["id"] for a in p["abilities"])}')


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    types = build_types()
    moves = build_moves(types)
    pokemon, learnsets = build_pokemon(types, moves)
    abilities = build_abilities()
    build_items()
    build_credits(pokemon)
    icon_failed = build_icons()
    summary(pokemon, moves, learnsets, abilities, icon_failed)


if __name__ == '__main__':
    main()
