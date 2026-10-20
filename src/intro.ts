import './intro.css';

/**
 * 開場動畫（YenWel：「進遊戲希望能做個前置動畫」）：
 * 水族館的門打開 → 鏡頭走進去到一個缸 → 光從水面灑下來、幾尾孔雀魚游過 → 標題「Aquarist's Life」。
 * - 第一次開約 6.5 秒，之後只演 2 秒的短版（缸＋標題）。
 * - 點一下就跳過（遊戲還沒載好就等它載好）。
 * - 遊戲在背後同時載入：main.ts 畫好主畫面後呼叫 introReady()，動畫演完、遊戲也好了才收起來。
 * 這個檔案是獨立的入口（index.html 先載它），主程式還在下載時就開始演。
 */

const SEEN_KEY = 'cycle.intro.v1';
const FULL_MS = 6500;
const SHORT_MS = 2000;
const ART = `${import.meta.env.BASE_URL}art/`;

let gameReady = false;
let timeUp = false;
let finished = false;
let root: HTMLElement | null = null;

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // 存不了就每次都演完整版
  }
}

/** 自動化測試（webdriver）不演，免得擋住點擊；網址加 ?intro 可以強制演（錄影用）。 */
function wanted(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('intro')) return true;
  return !navigator.webdriver;
}

function finish(): void {
  if (finished || !root) return;
  finished = true;
  const el = root;
  el.classList.add('out');
  window.setTimeout(() => el.remove(), 700);
}

function maybeFinish(): void {
  if (gameReady && timeUp) finish();
}

/** 主畫面畫好了（main.ts 呼叫）。 */
export function introReady(): void {
  gameReady = true;
  maybeFinish();
}

function svgShopFront(): string {
  // 夜裡的小水族館：暖光的櫥窗、木門、招牌（向量畫，不用另外生圖）
  return `<svg class="intro-shop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a2b"/><stop offset="1" stop-color="#1c2b3a"/></linearGradient>
      <linearGradient id="iwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f2a"/><stop offset="1" stop-color="#241c18"/></linearGradient>
      <radialGradient id="iglow" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#ffd890" stop-opacity="0.95"/><stop offset="0.55" stop-color="#e9a95a" stop-opacity="0.55"/><stop offset="1" stop-color="#7a4a20" stop-opacity="0.15"/></radialGradient>
      <linearGradient id="itank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fc7d6"/><stop offset="1" stop-color="#155a6e"/></linearGradient>
      <linearGradient id="iwood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4429"/><stop offset="0.5" stop-color="#8a5a37"/><stop offset="1" stop-color="#5c3a23"/></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#isky)"/>
    <g fill="#e8eef5" opacity="0.6"><circle cx="160" cy="90" r="2"/><circle cx="420" cy="150" r="1.5"/><circle cx="1290" cy="80" r="2"/><circle cx="1480" cy="170" r="1.4"/><circle cx="980" cy="60" r="1.6"/></g>
    <rect x="180" y="170" width="1240" height="730" fill="url(#iwall)"/>
    <rect x="160" y="150" width="1280" height="40" rx="6" fill="#2a201b"/>
    <path d="M200 190 h1200 l-40 70 h-1120 z" fill="#2f5e5a"/>
    <path d="M200 190 h1200 l-40 70 h-1120 z" fill="none" stroke="#e7c27d" stroke-opacity="0.35" stroke-width="3"/>
    <g class="intro-awning">${Array.from({ length: 12 }, (_, i) => `<path d="M${240 + i * 93} 260 q46 40 93 0" fill="${i % 2 ? '#e7dcc4' : '#2f5e5a'}"/>`).join('')}</g>
    <rect x="560" y="290" width="480" height="70" rx="10" fill="#1a1411" stroke="#e7c27d" stroke-width="3"/>
    <text x="800" y="338" text-anchor="middle" font-size="40" font-weight="700" letter-spacing="10" fill="#f3d58f" font-family="'Noto Sans TC', system-ui, sans-serif">阿德水族館</text>
    <!-- 左右櫥窗：裡面的水缸透著光 -->
    <g>
      <rect x="250" y="400" width="300" height="300" rx="8" fill="url(#iglow)"/>
      <rect x="275" y="470" width="250" height="150" rx="4" fill="url(#itank)" opacity="0.9"/>
      <path d="M300 590 q20 -40 10 -90 M340 600 q-10 -50 6 -95 M480 600 q12 -40 -4 -80" stroke="#5fae5a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="250" y="400" width="300" height="300" rx="8" fill="none" stroke="#6b4429" stroke-width="14"/>
      <rect x="1050" y="400" width="300" height="300" rx="8" fill="url(#iglow)"/>
      <rect x="1075" y="470" width="250" height="150" rx="4" fill="url(#itank)" opacity="0.9"/>
      <path d="M1100 600 q14 -50 -6 -100 M1290 600 q-14 -46 8 -88" stroke="#5fae5a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="1050" y="400" width="300" height="300" rx="8" fill="none" stroke="#6b4429" stroke-width="14"/>
    </g>
    <!-- 門：門框後面是店裡的光，兩扇門板往兩邊開 -->
    <rect x="640" y="400" width="320" height="500" fill="#ffe2a8"/>
    <rect x="640" y="400" width="320" height="500" fill="url(#iglow)"/>
    <g class="intro-door-l"><rect x="640" y="400" width="160" height="500" fill="url(#iwood)"/><rect x="662" y="430" width="116" height="200" rx="6" fill="#ffd890" opacity="0.75"/><circle cx="782" cy="680" r="7" fill="#e7c27d"/></g>
    <g class="intro-door-r"><rect x="800" y="400" width="160" height="500" fill="url(#iwood)"/><rect x="822" y="430" width="116" height="200" rx="6" fill="#ffd890" opacity="0.75"/><circle cx="818" cy="680" r="7" fill="#e7c27d"/></g>
    <rect x="630" y="390" width="340" height="510" fill="none" stroke="#2a201b" stroke-width="20"/>
    <rect x="0" y="880" width="1600" height="20" fill="#14100e"/>
  </svg>`;
}

function build(short: boolean): HTMLElement {
  const el = document.createElement('div');
  el.id = 'intro';
  el.className = short ? 'short' : 'full';
  el.setAttribute('role', 'presentation');
  const fish = [
    ['fish/guppy-male-bluegrass-halfmoon.webp', 'f1'],
    ['fish/guppy-male-redcobra-ribbon.webp', 'f2'],
    ['fish/guppy-male-albino-red-swallow.webp', 'f3'],
  ]
    .map(([src, cls]) => `<img class="intro-fish ${cls}" src="${ART}${src}" alt="" draggable="false">`)
    .join('');
  el.innerHTML = `
    ${short ? '' : `<div class="intro-street">${svgShopFront()}</div>`}
    <div class="intro-tank">
      <img class="intro-bg" src="${ART}bg/bg-tank-back.webp" alt="" draggable="false">
      <div class="intro-rays"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="intro-caustics"></div>
      ${fish}
      <div class="intro-bubbles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="intro-title">
      <small>Cycle</small>
      <b>Aquarist's Life</b>
    </div>
    <div class="intro-skip">點一下跳過</div>`;
  return el;
}

function start(): void {
  if (!wanted()) {
    gameReady = timeUp = finished = true;
    return;
  }
  const short = seenBefore() && !new URLSearchParams(location.search).has('full');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  root = build(short || reduce);
  document.body.append(root);
  markSeen();
  window.setTimeout(
    () => {
      timeUp = true;
      maybeFinish();
    },
    short || reduce ? SHORT_MS : FULL_MS,
  );
  // 點一下跳過：遊戲還在載就先換成「載入中」的樣子，載好馬上收
  root.addEventListener('pointerdown', () => {
    timeUp = true;
    root?.classList.add('skipped');
    maybeFinish();
  });
}

if (document.body) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
