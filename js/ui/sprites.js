// SpriteCollab 스프라이트와 초상화 (DESIGN §1). jsDelivr에서 받고, 실패하면 raw.githubusercontent로 1번 재시도.
const BASES = [
  'https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@master',
  'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master',
];
const dex4 = (dex) => String(dex).padStart(4, '0');
const shinyPath = (shiny) => (shiny ? '0000/0001/' : '');

// 방향별 줄 (시트의 행): 0 아래, 2 오른쪽, 6 왼쪽
export const FACING = { right: 2, left: 6 };

// 초상화 <img>. 실패하면 다른 주소, 그것도 실패하면 숨김
export function portrait(dex, { shiny = false, className = 'portrait' } = {}) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  let i = 0;
  const path = `/portrait/${dex4(dex)}/${shinyPath(shiny)}Normal.png`;
  img.onerror = () => {
    if (shiny) return portraitFallback(img, dex);
    if (++i < BASES.length) img.src = BASES[i] + path;
    else img.style.visibility = 'hidden';
  };
  img.src = BASES[0] + path;
  return img;
}
function portraitFallback(img, dex) {
  img.onerror = () => { img.style.visibility = 'hidden'; };
  img.src = `${BASES[0]}/portrait/${dex4(dex)}/Normal.png`;
}

async function fetchText(path) {
  for (const base of BASES) {
    try {
      const r = await fetch(base + path);
      if (r.ok) return { text: await r.text(), base };
    } catch {
      // 다음 주소로
    }
  }
  throw new Error(`불러오기 실패: ${path}`);
}

function loadImage(urls) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let i = 0;
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => (++i < urls.length ? (img.src = urls[i]) : reject(new Error('이미지 실패')));
    img.src = urls[0];
  });
}

const cache = new Map();

// { anims: { Idle: { w, h, durations, img } ... } }. 이로치가 없으면 일반 그림
export function loadSprite(dex, shiny = false) {
  const k = `${dex}-${shiny}`;
  if (!cache.has(k)) cache.set(k, load(dex, shiny).catch(() => (shiny ? load(dex, false) : null)));
  return cache.get(k);
}

async function load(dex, shiny) {
  const dir = `/sprite/${dex4(dex)}/${shinyPath(shiny)}`;
  const { text } = await fetchText(`${dir}AnimData.xml`);
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const raw = {};
  for (const a of xml.querySelectorAll('Anim')) {
    const name = a.querySelector('Name')?.textContent;
    raw[name] = {
      copyOf: a.querySelector('CopyOf')?.textContent ?? null,
      w: Number(a.querySelector('FrameWidth')?.textContent),
      h: Number(a.querySelector('FrameHeight')?.textContent),
      durations: [...a.querySelectorAll('Durations > Duration')].map((d) => Number(d.textContent)),
    };
  }
  const anims = {};
  const wanted = ['Idle', 'Walk', 'Attack', 'Strike', 'SpAttack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
  await Promise.all(wanted.filter((n) => raw[n]).map(async (name) => {
    let src = name;
    while (raw[src]?.copyOf) src = raw[src].copyOf;
    const info = raw[src];
    if (!info?.durations.length) return;
    try {
      const img = await loadImage(BASES.map((b) => `${b}${dir}${src}-Anim.png`));
      anims[name] = { ...info, img };
    } catch {
      // 이 동작만 없음
    }
  }));
  return Object.keys(anims).length ? { anims } : null;
}

// 캔버스에 스프라이트를 그리는 재생기. play(이름)는 한 번 재생 후 Idle로 돌아간다
export class SpritePlayer {
  constructor(canvas, facing) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.row = FACING[facing];
    this.sprite = null;
    this.current = null;
    this.frame = 0;
    this.tick = 0;
    this.once = false;
    this.stopped = false;
  }

  set(sprite) {
    this.sprite = sprite;
    this.play('Idle', true);
  }

  // 원하는 동작이 없으면 대체 동작 (§1: 물리 Attack→Strike, 특수 SpAttack→Shoot, 변화 Charge→Idle)
  play(name, loop = false) {
    const alt = { Attack: ['Strike', 'Idle'], SpAttack: ['Shoot', 'Attack', 'Idle'], Charge: ['Idle'], Faint: ['Hurt'], Idle: ['Walk'] };
    const anims = this.sprite?.anims;
    if (!anims) return;
    const pick = [name, ...(alt[name] ?? [])].find((n) => anims[n]);
    if (!pick) return;
    this.current = anims[pick];
    this.name = pick;
    this.frame = 0;
    this.tick = 0;
    this.once = !loop;
    this.stopped = false;
  }

  // 1/60초 단위로 진행 (SpriteCollab 길이 단위)
  advance(frames) {
    const a = this.current;
    if (!a || this.stopped) return;
    this.tick += frames;
    while (this.tick >= a.durations[this.frame]) {
      this.tick -= a.durations[this.frame];
      this.frame++;
      if (this.frame >= a.durations.length) {
        if (this.name === 'Faint') { this.frame = a.durations.length - 1; this.stopped = true; return; }
        if (this.once) return this.play('Idle', true);
        this.frame = 0;
      }
    }
  }

  draw() {
    const { ctx, canvas, current: a } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!a) return;
    const rows = Math.round(a.img.height / a.h);
    const row = rows > this.row ? this.row : 0;
    // 크기는 Idle 기준으로 정하고, 모든 동작을 같은 중심점에 그린다 (시트 칸은 가운데 정렬)
    const base = this.sprite.anims.Idle ?? a;
    const scale = Math.max(1, Math.min(3, Math.floor(Math.min(canvas.width / base.w, canvas.height / base.h))));
    const cx = canvas.width / 2, cy = canvas.height - (base.h * scale) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.img, this.frame * a.w, row * a.h, a.w, a.h, cx - (a.w * scale) / 2, cy - (a.h * scale) / 2, a.w * scale, a.h * scale);
  }
}
