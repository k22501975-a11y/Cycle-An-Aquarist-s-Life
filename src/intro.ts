import './intro.css';

/**
 * 開場動畫（YenWel：「進遊戲希望能做個前置動畫」）：
 * 水族館的門打開 → 鏡頭走進去到一個缸 → 光從水面灑下來、幾尾孔雀魚游過 → 標題「Aquarist's Life」。
 * - 第一次開約 6.5 秒，之後只演 2 秒的短版（缸＋標題）。
 * - 先停在安靜的開始畫面（YenWel：「開頭動畫應該要我按開始才開始」），按「開始」才演；
 *   這一下也是瀏覽器要的第一次點擊，背景音樂從這裡開始出得了聲。
 * - 點一下就跳過（遊戲還沒載好就等它載好）。
 * - 遊戲在背後同時載入：main.ts 畫好主畫面後呼叫 introReady()，動畫演完、遊戲也好了才收起來。
 * main.ts 第一個載入它（打包在主程式裡，算進 check-assets 的體積預算，也跟著 sw.js 快取），
 * 遊戲初始化、載圖的這段時間就在演。
 */

const SEEN_KEY = 'cycle.intro.v1';
const FULL_MS = 6500;
const SHORT_MS = 2000;
const ART = `${import.meta.env.BASE_URL}art/`;

let gameReady = false;
let timeUp = false;
let finished = false;
let root: HTMLElement | null = null;
let after: (() => void)[] = [];

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
  after.forEach((cb) => cb());
  after = [];
}

/** 開場動畫收起來之後才做（沒演動畫就馬上做）：免得歡迎卡被動畫蓋住、計時白白跑掉。 */
export function whenIntroDone(cb: () => void): void {
  if (finished || !root) cb();
  else after.push(cb);
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
  // 夜裡的小水族館：厚塗的店面（木牆、櫥窗裡兩層水缸、燈照著招牌）分三層，門板單獨一層才能做開門動畫。
  // 招牌和 OPEN 的字留在 SVG，縮放時才清楚。圖是用程式畫的，產生方式見 scripts/art/shopfront/。
  const img = (name: string, x: number, y: number, w: number, h: number) =>
    `<image href="${ART}intro/shop-${name}.webp" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  return `<svg class="intro-shop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="ishade" cx="0.5" cy="0.6" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
    </defs>
    ${img('night', 0, 0, 1600, 900)}
    <text x="800" y="342" text-anchor="middle" font-size="40" font-weight="700" letter-spacing="10" fill="#ffe2a0" stroke="#ffb850" stroke-opacity="0.35" stroke-width="5" paint-order="stroke" font-family="'Noto Sans TC', system-ui, sans-serif">阿德水族館</text>
    <g class="intro-door-l">${img('doorl', 640, 400, 160, 500)}</g>
    <g class="intro-door-r">${img('doorr', 800, 400, 160, 500)}
      <text x="880" y="463" transform="rotate(-4 880 470)" text-anchor="middle" font-size="18" font-weight="700" letter-spacing="3" fill="#ffe2a0" font-family="system-ui, sans-serif">OPEN</text></g>
    ${img('front', 0, 380, 1600, 520)}
    <rect width="1600" height="900" fill="url(#ishade)"/>
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
    ${short ? '' : '<div class="intro-glow"></div>'}
    <div class="intro-title">
      <small>Cycle</small>
      <b>Aquarist's Life</b>
    </div>
    <div class="intro-skip">點一下跳過</div>
    <div class="intro-gate">
      <img class="intro-gate-bg" src="${ART}bg/bg-tank-back.webp" alt="" draggable="false">
      <div class="intro-gate-title"><small>Cycle</small><b>Aquarist's Life</b></div>
      <button class="intro-start" type="button">開始</button>
    </div>`;
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
  root.classList.add('gate');
  document.body.append(root);
  const btn = root.querySelector<HTMLButtonElement>('.intro-start');
  btn?.focus({ preventScroll: true });
  btn?.addEventListener('click', () => play(short || reduce), { once: true });
}

/** 按了「開始」：收掉開始畫面，從頭演動畫。 */
function play(short: boolean): void {
  if (!root) return;
  const el = root;
  el.classList.remove('gate');
  markSeen();
  window.setTimeout(
    () => {
      timeUp = true;
      maybeFinish();
    },
    short ? SHORT_MS : FULL_MS,
  );
  // 點一下跳過：遊戲還在載就先換成「載入中」的樣子，載好馬上收
  el.addEventListener('pointerdown', () => {
    timeUp = true;
    el.classList.add('skipped');
    maybeFinish();
  });
}

if (document.body) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
