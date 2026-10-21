import { PLANT_SPECIES, type Plant } from '../sim';
import type { TankBounds } from './layout';
import { canvasTexture, makeCanvas, mix, paintScale, rgba, seeded, type Ctx } from './paint';
import type { Texture } from 'pixi.js';
import { sceneryImage } from './painted';
import { frontLip, sandSurface, SUBSTRATE_PALETTES, type SubstrateLook } from './substrate';

/**
 * 精緻插畫風的場景（design/art-style.md §0.4）：用 Canvas 繪製漸層、柔光、半透明，烘成貼圖。
 * 後景（遠山、遠處水草）用低解析度繪製再放大，自然就是模糊的；中景沉木、前景石頭與底沙清楚。
 * 造景照真實（青龍石、沉木、水草），只借參考圖的光影與質感。
 * 大小以 hs（相對示意圖的鏡頭倍率）縮放：缸越大 hs 越小，石頭和水草看起來越小（§7）。
 * 有精繪素材（背景、青龍石、沉木）時畫素材，再疊上同樣的水色、光影讓它融入水中；沒有就用程式繪製。
 */

function imageSize(img: CanvasImageSource): { w: number; h: number } {
  const i = img as { width: number; height: number };
  return { w: i.width, h: i.height };
}

/**
 * 把一張去背素材畫成水裡的物件：底部中心對齊 (cx, baseY)，高度 height。
 * 先在小畫布上疊上方受光、下方陰影與水的藍色（越遠 haze 越重），再畫到場景上，底下加接觸陰影。
 */
function drawSceneryArt(ctx: Ctx, img: CanvasImageSource, cx: number, baseY: number, height: number, haze: number, flip = false, look: { aspect?: number; filter?: string } = {}, scale = 1): void {
  const { w: iw, h: ih } = imageSize(img);
  const h = height;
  const w = (iw / ih) * h * (look.aspect ?? 1);
  const { canvas: tmp, ctx: t } = makeCanvas(w, h, scale);
  if (flip) {
    t.translate(w, 0);
    t.scale(-1, 1);
  }
  if (look.filter) t.filter = look.filter;
  t.drawImage(img, 0, 0, w, h);
  t.filter = 'none';
  t.setTransform(scale, 0, 0, scale, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  const light = t.createLinearGradient(0, 0, 0, h);
  light.addColorStop(0, 'rgba(200,245,255,0.14)');
  light.addColorStop(0.5, 'rgba(40,120,150,0)');
  light.addColorStop(1, 'rgba(5,25,35,0.42)');
  t.fillStyle = light;
  t.fillRect(0, 0, w, h);
  t.fillStyle = `rgba(30,110,140,${haze})`;
  t.fillRect(0, 0, w, h);
  const shadow = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, w * 0.6);
  shadow.addColorStop(0, 'rgba(5,25,35,0.5)');
  shadow.addColorStop(1, 'rgba(5,25,35,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(cx - w * 0.65, baseY - h * 0.12, w * 1.3, h * 0.24);
  // 圖的底部留有幾像素透明邊，往下沉一點讓石頭「坐」在沙上
  ctx.drawImage(tmp, cx - w / 2, baseY - h * 0.97, w, h);
}

/** 示意圖的鏡頭：1100 px 寬的缸代表 60 cm。 */
export const MOCKUP_PX_PER_CM = 1100 / 60;

export const WATER = { top: 0x2a93b4, mid: 0x14627c, bottom: 0x0a3140 };

/**
 * 後景：只有水（YenWel：「背景應該只有水才對」，design/first-10-minutes.md F1-b）：青藍的水、上方的光暈、往下越來越濃的水霧。
 * 不畫任何水草、石頭；缸裡看得到的每一株草、每一顆石頭都是玩家自己擺的。
 * 有精繪背景圖時照螢幕解析度畫（手機高解析度螢幕上才不會糊成一片）；沒有素材時用 1/4 解析度畫漸層。
 */
export function paintBackdrop(b: TankBounds, hs: number, pixelRatio = 1): Texture {
  const art = sceneryImage('bg-back');
  const k = art ? paintScale(pixelRatio, b.width) : 0.25;
  const { canvas, ctx } = makeCanvas(b.width * k, b.height * k);
  ctx.scale(k, k);
  const { width: w, height: h, bottom } = b;
  const water = ctx.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, rgba(WATER.top, 1));
  water.addColorStop(0.55, rgba(WATER.mid, 1));
  water.addColorStop(1, rgba(WATER.bottom, 1));
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, w, h);
  // 上方中央的光暈
  const glow = ctx.createRadialGradient(w * 0.5, -h * 0.1, 0, w * 0.5, -h * 0.1, h * 0.9);
  glow.addColorStop(0, 'rgba(190,240,255,0.55)');
  glow.addColorStop(1, 'rgba(190,240,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  if (art) {
    // 精繪背景：等比放大蓋滿，底部的水草對齊底沙；一點點模糊、蓋上水色，當作遠景
    const { w: iw, h: ih } = imageSize(art);
    // 直向手機不要放大到蓋滿整個高度（水草會變得巨大）；上方空出來的部分是原本的水色，接縫用漸層融掉
    const s = Math.max(w / iw, (h * 0.7) / ih);
    const dw = iw * s;
    const dh = ih * s;
    const dy = Math.min(0, bottom + 40 * hs - dh * 0.96);
    ctx.save();
    // 濾鏡的模糊是畫布像素：乘上 k，不管螢幕解析度多少，看起來都是約 0.7 個 CSS 像素
    // 統一調色（畫面評測 V15）：背景稍微提亮、飽和，往參考圖的亮青藍靠（第 12 批的後景本身已經偏亮，只輕調）
    ctx.filter = `blur(${(0.7 * k).toFixed(2)}px) brightness(1.06) saturate(1.15)`;
    ctx.drawImage(art, (w - dw) / 2, dy, dw, dh);
    ctx.restore();
    if (dy > -dh * 0.02) {
      const seam = mix(WATER.top, WATER.mid, Math.min(1, dy / h / 0.55));
      const blend = ctx.createLinearGradient(0, dy, 0, dy + dh * 0.35);
      blend.addColorStop(0, rgba(seam, 1));
      blend.addColorStop(1, rgba(seam, 0));
      ctx.fillStyle = blend;
      ctx.fillRect(0, dy, w, dh * 0.35);
    }
    // 蓋一層青色（濾色）：整體偏青、亮，不是灰綠
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(30,150,185,0.1)';
    ctx.fillRect(0, 0, w, h);
    const sky = ctx.createRadialGradient(w * 0.5, -h * 0.15, 0, w * 0.5, -h * 0.15, h * 1.1);
    sky.addColorStop(0, 'rgba(170,240,255,0.25)');
    sky.addColorStop(1, 'rgba(170,240,255,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    paintFarPlants(ctx, w, bottom, hs, k);
    const fade = ctx.createLinearGradient(0, h * 0.45, 0, h);
    fade.addColorStop(0, 'rgba(20,90,110,0)');
    fade.addColorStop(1, 'rgba(10,60,80,0.28)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    return canvasTexture(canvas, false);
  }

  paintFarPlants(ctx, w, bottom, hs, k);
  // 水的霧氣：越往下越濃
  const haze = ctx.createLinearGradient(0, h * 0.35, 0, h);
  haze.addColorStop(0, 'rgba(20,90,110,0)');
  haze.addColorStop(1, 'rgba(10,50,65,0.45)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
  return canvasTexture(canvas, false);
}

/**
 * 遠處的水草剪影（畫面評測第 9 輪 #265）：只種一株草時缸不會是一整片水。
 * 模糊、約 20% 不透明的深青色，看得出是遠景，不會被當成能點的水草。
 */
function paintFarPlants(ctx: Ctx, w: number, bottom: number, hs: number, k: number): void {
  const rand = seeded(907);
  ctx.save();
  ctx.filter = `blur(${(3 * hs * k).toFixed(2)}px)`;
  ctx.globalAlpha = 0.2;
  ctx.lineCap = 'round';
  // 幾叢高矮不一的草，左右兩邊高、中間矮，像造景的後景
  for (let c = 0; c < 9; c++) {
    const cx = w * (c / 8) + (rand() - 0.5) * w * 0.06;
    const edge = Math.abs(cx / w - 0.5) * 2;
    const tall = (70 + 120 * edge + rand() * 50) * hs;
    const blades = 6 + Math.floor(rand() * 6);
    ctx.strokeStyle = c % 2 ? '#0d4a4c' : '#14595a';
    for (let i = 0; i < blades; i++) {
      const x = cx + (rand() - 0.5) * 60 * hs;
      const len = tall * (0.55 + rand() * 0.45);
      const lean = (rand() - 0.5) * 0.5 * len;
      ctx.lineWidth = (3 + rand() * 4) * hs;
      ctx.beginPath();
      ctx.moveTo(x, bottom + 10 * hs);
      ctx.quadraticCurveTo(x + lean * 0.2, bottom - len * 0.5, x + lean, bottom - len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function rockPath(ctx: Ctx, x: number, y: number, s: number, pts: number[]): void {
  ctx.beginPath();
  ctx.moveTo(x + pts[0] * s, y + pts[1] * s);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(x + pts[i] * s, y + pts[i + 1] * s);
  ctx.closePath();
}

/** 青龍石：上亮下暗的灰藍色，右半邊陰影、白色裂紋、頂端邊緣光，底部有接觸陰影。 */
function paintSeiryu(ctx: Ctx, x: number, y: number, s: number, pts: number[], cracks: number[][], seed: number): void {
  const rand = seeded(seed);
  const top = Math.min(...pts.filter((_, i) => i % 2 === 1)) * s;
  // 接觸陰影
  const shadow = ctx.createRadialGradient(x, y, 0, x, y, Math.abs(pts[0]) * s * 1.3);
  shadow.addColorStop(0, 'rgba(5,25,35,0.55)');
  shadow.addColorStop(1, 'rgba(5,25,35,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(x - Math.abs(pts[0]) * s * 1.4, y - 20 * s, Math.abs(pts[0]) * s * 2.8, 40 * s);

  ctx.save();
  rockPath(ctx, x, y, s, pts);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y + top, 0, y);
  g.addColorStop(0, '#c4ced6');
  g.addColorStop(0.45, '#8d9aa6');
  g.addColorStop(1, '#3e4b57');
  ctx.fillStyle = g;
  ctx.fillRect(x - 200 * s, y + top - 10, 400 * s, -top + 20);
  // 右半邊的陰影面
  ctx.fillStyle = 'rgba(20,35,50,0.35)';
  ctx.beginPath();
  ctx.moveTo(x + pts[4] * s, y + pts[5] * s);
  ctx.lineTo(x + pts[6] * s, y + pts[7] * s);
  ctx.lineTo(x + pts[8] * s, y + pts[9] * s);
  ctx.lineTo(x + pts[4] * s * 0.3, y);
  ctx.closePath();
  ctx.fill();
  // 石頭表面的斑點紋理
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,40,0.12)';
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * Math.abs(pts[0]) * 2 * s, y + top * rand(), (1 + rand() * 3) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // 青龍石特有的白色裂紋：深色凹痕＋亮邊
  for (const c of cracks) {
    ctx.strokeStyle = 'rgba(30,40,50,0.55)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(x + c[0] * s, y + c[1] * s);
    ctx.lineTo(x + c[2] * s, y + c[3] * s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235,240,245,0.5)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(x + c[0] * s + 2 * s, y + c[1] * s);
    ctx.lineTo(x + c[2] * s + 2 * s, y + c[3] * s);
    ctx.stroke();
  }
  // 藍色的水氣，讓石頭融入水中
  ctx.fillStyle = 'rgba(40,130,160,0.12)';
  ctx.fillRect(x - 200 * s, y + top - 10, 400 * s, -top + 20);
  ctx.restore();
  // 頂端的邊緣光（光從上方來）
  ctx.save();
  ctx.strokeStyle = 'rgba(220,250,255,0.75)';
  ctx.shadowColor = 'rgba(200,245,255,0.9)';
  ctx.shadowBlur = 6 * s;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x + pts[2] * s, y + pts[3] * s);
  ctx.lineTo(x + pts[4] * s, y + pts[5] * s);
  ctx.lineTo(x + pts[6] * s, y + pts[7] * s);
  ctx.stroke();
  ctx.restore();
}

/** 中景：沉木＋莫絲。畫在水草後面。decor = false（玩家自己擺了造景）時是空的。 */
export function paintDriftwood(b: TankBounds, hs: number, decor = true, pixelRatio = 1): Texture {
  if (!decor) return canvasTexture(makeCanvas(2, 2).canvas, false);
  const k = paintScale(pixelRatio, b.width);
  const { canvas, ctx } = makeCanvas(b.width, b.height, k);
  const ox = b.width * 0.38;
  const oy = b.bottom + 12 * hs;
  const P = (x: number, y: number): [number, number] => [ox + (x - 510) * hs, oy + (y - 510) * hs];
  const wood = sceneryImage('wood-1');
  if (wood) {
    // 精繪的杜鵑根：中景，比前景石頭多一點水的藍色
    drawSceneryArt(ctx, wood, b.width * 0.42, oy - 4 * hs, 320 * hs, 0.14, false, {}, k);
    return canvasTexture(canvas, false, k);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const trunk = new Path2D();
  trunk.moveTo(...P(462, 512));
  trunk.bezierCurveTo(...P(505, 420), ...P(560, 355), ...P(650, 276));
  trunk.lineTo(...P(674, 292));
  trunk.bezierCurveTo(...P(592, 372), ...P(566, 440), ...P(556, 512));
  trunk.closePath();
  const bark = ctx.createLinearGradient(...P(470, 400), ...P(560, 420));
  bark.addColorStop(0, '#9a6a40');
  bark.addColorStop(0.5, '#6e4527');
  bark.addColorStop(1, '#3b2414');
  ctx.fillStyle = bark;
  ctx.fill(trunk);
  // 樹皮紋路
  ctx.save();
  ctx.clip(trunk);
  const rand = seeded(311);
  for (let i = 0; i < 26; i++) {
    const t = rand();
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,220,170,0.18)' : 'rgba(30,15,5,0.35)';
    ctx.lineWidth = (1 + rand() * 2) * hs;
    ctx.beginPath();
    ctx.moveTo(...P(470 + t * 80, 515));
    ctx.bezierCurveTo(...P(510 + t * 60, 430), ...P(560 + t * 50, 370), ...P(640 + t * 30, 285));
    ctx.stroke();
  }
  ctx.restore();
  // 分枝
  const branch = new Path2D();
  branch.moveTo(...P(606, 322));
  branch.bezierCurveTo(...P(650, 308), ...P(690, 332), ...P(734, 308));
  ctx.strokeStyle = '#4a2e1a';
  ctx.lineWidth = 11 * hs;
  ctx.stroke(branch);
  ctx.strokeStyle = 'rgba(160,110,70,0.6)';
  ctx.lineWidth = 3 * hs;
  ctx.stroke(branch);
  // 莫絲：一團團柔和的綠，邊緣有亮綠的細芽
  const moss: Array<[number, number, number]> = [
    [508, 444, 12], [522, 426, 12], [538, 408, 15], [552, 390, 12], [568, 374, 13], [582, 358, 12], [596, 342, 13], [610, 326, 13], [626, 310, 16], [700, 318, 10], [718, 310, 9], [488, 470, 9],
  ];
  for (const [x, y, r] of moss) {
    const [cx, cy] = P(x, y);
    const g = ctx.createRadialGradient(cx - r * 0.3 * hs, cy - r * 0.4 * hs, 0, cx, cy, r * hs * 1.1);
    g.addColorStop(0, '#7fcf6a');
    g.addColorStop(0.6, '#3f9450');
    g.addColorStop(1, 'rgba(30,90,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * hs * 1.1, 0, Math.PI * 2);
    ctx.fill();
    // 細小的葉團：幾顆更小的亮綠點，讓莫絲看起來毛茸茸的
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const d = (0.4 + rand() * 0.55) * r * hs;
      const rr = (0.18 + rand() * 0.2) * r * hs;
      ctx.fillStyle = rand() < 0.5 ? 'rgba(150,220,120,0.55)' : 'rgba(40,110,60,0.5)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(canvas, false, k);
}

/** 前景：三顆青龍石與底沙（底沙蓋住石頭底部）。底沙依底材換外觀，裸缸就是玻璃缸底。 */
export function paintFront(b: TankBounds, hs: number, look: SubstrateLook = 'sand', decor = true, pixelRatio = 1): Texture {
  const k = paintScale(pixelRatio, b.width);
  const { canvas, ctx } = makeCanvas(b.width, b.height, k);
  const { width: w, bottom } = b;
  // 裸缸：石頭直接放在玻璃上
  const y = look === 'bare' ? bottom + 8 * hs : bottom + 22 * hs;
  if (look === 'bare') paintGlassFloor(ctx, b, hs);
  // 玩家自己擺了造景：只畫底沙，石頭沉木由造景圖層畫（scape-view.ts）
  if (!decor) {
    if (look !== 'bare') paintSubstrate(ctx, b, hs, look);
    return canvasTexture(canvas, false, k);
  }
  const rocks = (['rock-1', 'rock-4', 'rock-3'] as const).map((k) => sceneryImage(k));
  if (look === 'bare') {
    // 石頭底下的接觸陰影
    for (const [x, r] of [[0.28, 90], [0.67, 70], [0.79, 42]] as const) {
      const sg = ctx.createRadialGradient(w * x, y, 0, w * x, y, r * hs);
      sg.addColorStop(0, 'rgba(0,10,15,0.55)');
      sg.addColorStop(1, 'rgba(0,10,15,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(w * x, y, r * hs, r * hs * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (rocks.every(Boolean)) {
    drawSceneryArt(ctx, rocks[0]!, w * 0.28, y, 165 * hs, 0.06, false, {}, k);
    drawSceneryArt(ctx, rocks[1]!, w * 0.67, y + 4 * hs, 125 * hs, 0.06, true, {}, k);
    drawSceneryArt(ctx, rocks[2]!, w * 0.79, y + 6 * hs, 72 * hs, 0.06, false, {}, k);
  } else {
    paintSeiryu(ctx, w * 0.29, y, hs, [-85, 0, -51, -110, 8.5, -126.5, 59.5, -77, 85, 0], [[8.5, -126.5, 0, -10], [-51, -110, -34, -33]], 11);
    paintSeiryu(ctx, w * 0.67, y + 4 * hs, hs, [-70, 0, -42, -80, 7, -92, 49, -56, 70, 0], [[7, -92, 0, -8], [-42, -80, -28, -24]], 23);
    paintSeiryu(ctx, w * 0.775, y + 4 * hs, hs, [-45, 0, -27, -55, 4.5, -63.25, 31.5, -38.5, 45, 0], [[4.5, -63.25, 0, -6]], 37);
  }
  if (look !== 'bare') paintSubstrate(ctx, b, hs, look);
  return canvasTexture(canvas, false, k);
}

/** 裸缸的缸底：一片玻璃，底下是缸架的暗色。 */
function paintGlassFloor(ctx: Ctx, b: TankBounds, hs: number): void {
  const { width: w, height: h, bottom } = b;
  const g0 = bottom + 6 * hs;
  const stand = ctx.createLinearGradient(0, g0, 0, h);
  stand.addColorStop(0, '#16303a');
  stand.addColorStop(1, '#0b171c');
  ctx.fillStyle = stand;
  ctx.fillRect(0, g0, w, h - g0);
  // 玻璃厚度：一條亮邊加上反光
  const glass = ctx.createLinearGradient(0, g0 - 2 * hs, 0, g0 + 10 * hs);
  glass.addColorStop(0, 'rgba(200,240,240,0.55)');
  glass.addColorStop(0.3, 'rgba(120,190,190,0.35)');
  glass.addColorStop(1, 'rgba(60,120,120,0)');
  ctx.fillStyle = glass;
  ctx.fillRect(0, g0 - 2 * hs, w, 12 * hs);
  ctx.fillStyle = 'rgba(230,255,255,0.7)';
  ctx.fillRect(0, g0 - 1 * hs, w, Math.max(1, 1.2 * hs));
}

/** 底沙：後面高的沙面受光，前面隔著玻璃看到分層的斷面。 */
function paintSubstrate(ctx: Ctx, b: TankBounds, hs: number, look: Exclude<SubstrateLook, 'bare'>): void {
  const { width: w, height: h, bottom } = b;
  const pal = SUBSTRATE_PALETTES[look];
  const step = Math.max(4, w / 160);
  const top = new Path2D();
  top.moveTo(0, sandSurface(look, 0, w, bottom, hs));
  for (let x = step; x <= w + step; x += step) top.lineTo(x, sandSurface(look, x, w, bottom, hs));
  top.lineTo(w, h);
  top.lineTo(0, h);
  top.closePath();
  const lip = new Path2D();
  lip.moveTo(0, frontLip(look, 0, w, bottom, hs));
  for (let x = step; x <= w + step; x += step) lip.lineTo(x, frontLip(look, x, w, bottom, hs));
  lip.lineTo(w, h);
  lip.lineTo(0, h);
  lip.closePath();

  // 沙面：越前面越亮（光從上面照下來）
  const g = ctx.createLinearGradient(0, bottom - 14 * hs, 0, bottom + 32 * hs);
  g.addColorStop(0, pal.top[0]);
  g.addColorStop(0.4, pal.top[1]);
  g.addColorStop(1, pal.top[2]);
  ctx.fillStyle = g;
  ctx.fill(top);
  ctx.save();
  ctx.clip(top);
  const tile = sceneryImage(`sub-${look}-tile`);
  if (tile) {
    // 精繪底材紋理：斜斜看下去，垂直方向壓扁，越後面越暗
    const { w: iw } = imageSize(tile);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      const k = (180 * hs) / iw;
      pattern.setTransform(new DOMMatrix().translate(0, bottom - 16 * hs).scale(k, k * 0.38));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, bottom - 20 * hs, w, 56 * hs);
    }
    const shade = ctx.createLinearGradient(0, bottom - 16 * hs, 0, bottom + 32 * hs);
    shade.addColorStop(0, 'rgba(10,20,20,0.4)');
    shade.addColorStop(0.45, 'rgba(10,20,20,0.05)');
    shade.addColorStop(1, 'rgba(255,250,235,0.08)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, bottom - 20 * hs, w, 56 * hs);
  }
  const art = tile;
  const rand = seeded(4242);
  paintGrains(ctx, rand, pal, hs, 0, bottom - 16 * hs, w, 50 * hs, art ? 3 : 1);
  if (look === 'sand' || look === 'coral') {
    // 小卵石、貝殼碎片（畫面評測 V19：原本是灰色的亮面圓球，像黏在沙上的氣泡）
    // 改成扁扁的、顏色跟沙接近的小石子，三五顆聚在一起，底下有一點接觸陰影
    const groups = Math.round(w / 140);
    for (let gi = 0; gi < groups; gi++) {
      const gx = rand() * w;
      const count = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < count; k++) {
        const x = gx + (rand() - 0.5) * 26 * hs;
        const yy = sandSurface(look, x, w, bottom, hs) + 5 * hs + rand() * 18 * hs;
        const r = (1.4 + rand() * 2.6) * Math.max(0.6, hs);
        const tone = look === 'coral' ? [0xf4ece0, 0xe6c8b8, 0xfaf6ee, 0xd8cfc0][(gi + k) % 4] : [0xc9b48e, 0xb09a78, 0x9a8a74, 0xd8c8a6, 0x8d7a62][(gi + k) % 5];
        ctx.fillStyle = 'rgba(60,45,25,0.22)';
        ctx.beginPath();
        ctx.ellipse(x + r * 0.2, yy + r * 0.45, r * 1.5, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        const pg = ctx.createLinearGradient(x, yy - r * 0.7, x, yy + r * 0.7);
        pg.addColorStop(0, rgba(mix(tone, 0xffffff, 0.25), 1));
        pg.addColorStop(1, rgba(mix(tone, 0x000000, 0.18), 1));
        ctx.fillStyle = pg;
        ctx.beginPath();
        if (look === 'coral') {
          // 珊瑚碎片是有稜角的
          ctx.moveTo(x - r * 1.4, yy);
          ctx.lineTo(x - r * 0.2, yy - r);
          ctx.lineTo(x + r * 1.3, yy - r * 0.3);
          ctx.lineTo(x + r * 0.5, yy + r * 0.7);
        } else ctx.ellipse(x, yy, r * (1.2 + rand() * 0.5), r * 0.7, (rand() - 0.5) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // 沙面最後面的陰影（水草、石頭根部）
  const edge = ctx.createLinearGradient(0, bottom - 16 * hs, 0, bottom + 14 * hs);
  edge.addColorStop(0, 'rgba(20,30,25,0.5)');
  edge.addColorStop(1, 'rgba(20,30,25,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, bottom - 20 * hs, w, 36 * hs);
  ctx.restore();

  // 斷面：隔著前玻璃看進去，上層顆粒清楚、往下越暗，中間有幾條沉積紋
  ctx.save();
  ctx.clip(lip);
  const lipY = bottom + 27 * hs;
  const side = sceneryImage(`sub-${look}-side`);
  if (side) {
    // 精繪斷面條：上緣波浪接著沙面，左右接起來鋪滿
    const { w: iw, h: ih } = imageSize(side);
    const sh = Math.max(h - lipY + 6 * hs, 60 * hs);
    const sw = iw * (sh / ih);
    const face = ctx.createLinearGradient(0, lipY, 0, h);
    face.addColorStop(0, pal.face[0]);
    face.addColorStop(1, pal.face[1]);
    ctx.fillStyle = face;
    ctx.fillRect(0, lipY, w, h - lipY);
    for (let x = 0; x < w; x += sw - 1) ctx.drawImage(side, x, lipY - 6 * hs, sw, sh);
  } else {
    const lipY = bottom + 27 * hs;
    const face = ctx.createLinearGradient(0, lipY, 0, h);
    face.addColorStop(0, pal.face[0]);
    face.addColorStop(1, pal.face[1]);
    ctx.fillStyle = face;
    ctx.fillRect(0, lipY, w, h - lipY);
    if (look === 'soil') {
      // 水草泥底下墊一層基肥（偏紅褐）
      const base = lipY + (h - lipY) * 0.55;
      ctx.fillStyle = 'rgba(120,60,30,0.45)';
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (let x = 0; x <= w; x += step) ctx.lineTo(x, base + Math.sin(x * 0.02) * 3 * hs);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
    }
    for (let k = 1; k <= 3; k++) {
      const yy = lipY + (h - lipY) * (k / 4.2);
      ctx.strokeStyle = look === 'soil' ? 'rgba(0,0,0,0.25)' : 'rgba(120,95,60,0.22)';
      ctx.lineWidth = Math.max(1, 1.5 * hs);
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        const yy2 = yy + Math.sin(x * 0.013 + k * 2) * 2.5 * hs;
        if (x === 0) ctx.moveTo(x, yy2);
        else ctx.lineTo(x, yy2);
      }
      ctx.stroke();
    }
    paintGrains(ctx, rand, pal, hs, 0, lipY, w, h - lipY, 0.7);
  }
  // 越往下越暗（光透不進去）
  const dark = ctx.createLinearGradient(0, lipY, 0, h);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, 'rgba(0,10,15,0.45)');
  ctx.fillStyle = dark;
  ctx.fillRect(0, lipY, w, h - lipY);
  ctx.restore();
  // 前玻璃的邊：一條細細的反光
  ctx.strokeStyle = 'rgba(235,255,255,0.45)';
  ctx.lineWidth = Math.max(1, 1.4 * hs);
  ctx.beginPath();
  for (let x = 0; x <= w + step; x += step) {
    const yy = frontLip(look, x, w, bottom, hs);
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}

/** 撒顆粒：水草泥是圓的黑褐顆粒，沙子是細點。 */
function paintGrains(ctx: Ctx, rand: () => number, pal: (typeof SUBSTRATE_PALETTES)['sand'], hs: number, x0: number, y0: number, w: number, hh: number, sparse: number): void {
  const n = (w * hh) / (pal.grainEvery * sparse);
  const size = pal.grainSize * Math.max(0.6, hs);
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * w;
    const yy = y0 + rand() * hh;
    ctx.fillStyle = pal.grains[Math.floor(rand() * pal.grains.length)];
    const r = size * (0.5 + rand() * 0.7);
    if (size > 2) {
      ctx.beginPath();
      ctx.ellipse(x, yy, r, r * 0.85, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(x, yy, r, r);
  }
}

/**
 * 焦散網紋的亮度（0–1）：細胞狀的網（Voronoi 的邊，F2−F1 接近 0 的地方），再用低頻的波扭一下讓網線彎彎的。
 * size 是貼圖邊長，cells 每邊幾格；點的位置用整數頻率包回去，所以可以無縫拼接。
 * 畫面評測 V17：原本三組大波疊出來的是幾條粗白曲線，像煙；水底的光紋應該是細細一張網。
 */
export function causticsField(size: number, cells: number, seed = 7): Float32Array {
  let r = seed;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pts: number[] = [];
  for (let i = 0; i < cells * cells; i++) pts.push(rand(), rand());
  const cell = size / cells;
  const T = (Math.PI * 2) / size;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 扭曲：整數頻率，拼接處接得起來
      const amp = cell * 0.22;
      const wx = x + amp * (Math.sin(2 * y * T + 1.3) + 0.5 * Math.sin(5 * y * T + 3 * x * T));
      const wy = y + amp * (Math.sin(2 * x * T) + 0.5 * Math.sin(4 * x * T - 3 * y * T + 2));
      const gx = Math.floor(wx / cell);
      const gy = Math.floor(wy / cell);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const k = (((cy % cells) + cells) % cells) * cells + (((cx % cells) + cells) % cells);
          const px = (cx + pts[k * 2]) * cell;
          const py = (cy + pts[k * 2 + 1]) * cell;
          const d = Math.hypot(wx - px, wy - py);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      const e = (f2 - f1) / cell;
      out[y * size + x] = Math.exp(-((e / 0.08) ** 2));
    }
  }
  return out;
}

/** 可以無縫拼接的焦散光紋（水面的波浪把光聚成網狀亮線）。 */
let caustics: Texture | null = null;
export function causticsTexture(): Texture {
  if (caustics) return caustics;
  const N = 256;
  const { canvas, ctx } = makeCanvas(N, N);
  const img = ctx.createImageData(N, N);
  const field = causticsField(N, 7);
  for (let i = 0; i < N * N; i++) {
    img.data[i * 4] = 235;
    img.data[i * 4 + 1] = 252;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(255 * field[i]);
  }
  ctx.putImageData(img, 0, 0);
  caustics = canvasTexture(canvas, false);
  caustics.source.addressMode = 'repeat';
  return caustics;
}

/** 光束：中央亮、兩側柔和消失，由上往下漸淡（用加法混色疊在畫面上）。 */
let ray: Texture | null = null;
export function rayTexture(): Texture {
  if (ray) return ray;
  const { canvas, ctx } = makeCanvas(64, 256);
  const img = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = (x - 31.5) / 32;
      const a = Math.exp(-dx * dx * 5) * Math.pow(1 - y / 256, 1.4);
      const i = (y * 64 + x) * 4;
      img.data[i] = 235;
      img.data[i + 1] = 250;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  ray = canvasTexture(canvas, false);
  return ray;
}

/** 四周的暗角，讓視線集中在中間（精品感）。 */
export function paintVignette(w: number, h: number): Texture {
  const k = 0.25;
  const { canvas, ctx } = makeCanvas(w * k, h * k);
  const cw = canvas.width;
  const ch = canvas.height;
  const g = ctx.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.35, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.75);
  g.addColorStop(0, 'rgba(0,15,25,0)');
  g.addColorStop(1, 'rgba(0,15,25,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // 上亮下深：水面附近透一點光，越往缸底越暗，前後才有距離感（畫面評測第 9 輪 #265）
  const v = ctx.createLinearGradient(0, 0, 0, ch);
  v.addColorStop(0, 'rgba(235,250,255,0.07)');
  v.addColorStop(0.35, 'rgba(235,250,255,0)');
  v.addColorStop(0.7, 'rgba(0,20,30,0)');
  v.addColorStop(1, 'rgba(0,20,30,0.2)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cw, ch);
  // 前面的玻璃：左上到右下兩道很淡的斜光（畫面評測第 8 輪：缸要有前後景深）
  ctx.save();
  ctx.translate(cw * 0.3, 0);
  ctx.rotate(-0.5);
  for (const [x, w, a] of [[0, 0.16, 0.12], [0.22, 0.05, 0.1]]) {
    const band = ctx.createLinearGradient(x * cw, 0, (x + w) * cw, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, `rgba(255,255,255,${a})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(x * cw, -ch, w * cw, ch * 3);
  }
  ctx.restore();
  return canvasTexture(canvas, false);
}

// ---- 水草（模擬中的水草，大小依生物量）--------------------------------------

/** 一片柔和的葉子：葉基深、葉尖亮，有中肋高光與半透明的葉緣。 */
function paintLeaf(ctx: Ctx, x: number, y: number, angle: number, len: number, width: number, color: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const path = new Path2D();
  path.moveTo(0, 0);
  path.quadraticCurveTo(len * 0.45, -width, len, 0);
  path.quadraticCurveTo(len * 0.45, width, 0, 0);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, rgba(mix(color, 0x000000, 0.35), 1));
  g.addColorStop(0.6, rgba(color, 0.95));
  g.addColorStop(1, rgba(mix(color, 0xffffff, 0.3), 0.85));
  ctx.fillStyle = g;
  ctx.fill(path);
  // 下半葉的陰影
  ctx.fillStyle = 'rgba(0,30,20,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, width, len, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(mix(color, 0xffffff, 0.55), 0.7);
  ctx.lineWidth = Math.max(0.5, width * 0.12);
  ctx.beginPath();
  ctx.moveTo(len * 0.05, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

/** 矮的水草：高度 = [基本, 每單位大小增加]（像素，乘上 hs）。 */
const LOW_PLANTS: Partial<Record<Plant['species'], [number, number]>> = { eleocharis: [45, 40], glosso: [40, 30], hydrocotyle: [50, 34], moss: [45, 30] };

export interface PlantPainting {
  texture: Texture;
  /** 根部在貼圖上的位置（像素）。 */
  anchorX: number;
  anchorY: number;
}

/**
 * 依生物量畫一株水草。紅蝴蝶：一叢有莖草，越往上越紅（強光下的典型顏色）。小榕：綁在小石頭上的寬葉。
 * 溶葉時偏黃褐，葉面長藻時顏色變暗、有斑點。
 */
export function paintPlant(plant: Plant, hs: number, scale = 1): PlantPainting {
  const sp = PLANT_SPECIES[plant.species];
  const size = Math.min(2.2, plant.biomassG / sp.maxBiomassG + 0.25);
  const melting = plant.growthRate < -0.0002;
  const algae = plant.leafAlgae;
  const tint = (c: number) => {
    let out = c;
    if (melting) out = mix(out, 0xb8a848, 0.7);
    if (algae > 0.15) out = mix(out, 0x4a5a32, algae * 0.6);
    return out;
  };
  const high = sp.lightType === 'high';
  // 前景草、莫絲矮矮的往旁邊長；其他照陰性／陽性草的高度
  const low = LOW_PLANTS[plant.species];
  const full = (low ? low[0] + size * low[1] : high ? 110 + size * 150 : 60 + size * 30) * hs;
  const W = (high || low ? 220 : 160) * hs * (0.8 + size * 0.3);
  const H = full * 1.12 + 30 * hs;
  const { canvas, ctx } = makeCanvas(W, H, scale);
  const ax = W / 2;
  const ay = H - 6 * hs;
  ctx.translate(ax, ay);
  ctx.lineCap = 'round';
  const rand = seeded(plant.id * 97 + 13);

  const art = sceneryImage(`plant-${plant.species}`);
  if (art) {
    // 精繪水草：依生物量決定高度，溶葉偏黃褐、長藻變暗並有斑點
    const { w: iw, h: ih } = imageSize(art);
    const dh = full * 1.1;
    const dw = Math.min(W, (iw / ih) * dh);
    const { canvas: tmp, ctx: t } = makeCanvas(dw, dh, scale);
    t.drawImage(art, 0, 0, dw, dh);
    t.globalCompositeOperation = 'source-atop';
    if (melting) {
      t.fillStyle = 'rgba(184,168,72,0.6)';
      t.fillRect(0, 0, dw, dh);
    }
    if (algae > 0.15) {
      t.fillStyle = `rgba(60,72,40,${Math.min(0.6, algae * 0.6)})`;
      t.fillRect(0, 0, dw, dh);
      t.fillStyle = `rgba(26,42,20,${Math.min(0.9, algae)})`;
      for (let i = 0; i < 40 * algae; i++) {
        t.beginPath();
        t.arc(rand() * dw, rand() * dh, (1.5 + rand() * 2) * hs, 0, Math.PI * 2);
        t.fill();
      }
    }
    const shade = t.createLinearGradient(0, 0, 0, dh);
    shade.addColorStop(0, 'rgba(200,245,255,0.08)');
    shade.addColorStop(0.6, 'rgba(20,80,90,0)');
    shade.addColorStop(1, 'rgba(5,30,30,0.45)');
    t.fillStyle = shade;
    t.fillRect(0, 0, dw, dh);
    ctx.drawImage(tmp, -dw / 2, -dh * 0.98, dw, dh);
    return { texture: canvasTexture(canvas, true, scale), anchorX: ax, anchorY: ay };
  }

  if (high) {
    const stems = Math.max(1, Math.round(1 + size * 2.2));
    for (let i = 0; i < stems; i++) {
      const x0 = (i - (stems - 1) / 2) * 30 * hs;
      const h = full * (0.72 + ((i * 53) % 29) / 100);
      const sway = (i % 2 ? 1 : -1) * 8 * hs;
      ctx.strokeStyle = rgba(tint(0x8a3a3a), 1);
      ctx.lineWidth = Math.max(1.5, 3.5 * hs);
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 - 8 * hs, -h * 0.4, x0 + 10 * hs + sway, -h * 0.7, x0 + sway * 0.5, -h);
      ctx.stroke();
      const pairs = Math.max(3, Math.floor(h / (16 * hs)));
      for (let k = 1; k <= pairs; k++) {
        const t = k / (pairs + 0.5);
        const y = -h * t;
        const x = x0 + sway * 0.5 * t * t + (-8 * hs) * (1 - t) * t;
        // 底部偏綠、頂端紅（紅蝴蝶在強光下的顏色）
        const c = tint(mix(0x5fae4a, k % 2 ? 0xe24a3a : 0xf0704a, Math.min(1, Math.max(0, t - 0.2) * 1.5)));
        const len = (30 - t * 8) * hs;
        paintLeaf(ctx, x, y, -0.35 - rand() * 0.25, len, 6 * hs, c);
        paintLeaf(ctx, x, y, Math.PI + 0.35 + rand() * 0.25, len, 6 * hs, c);
      }
    }
  } else {
    const leaves = Math.max(3, Math.round(3 + size * 4));
    const stemY = -20 * hs;
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI / 2 + (i / (leaves - 1) - 0.5) * 2.3;
      const reach = (26 + size * 16) * hs;
      const bx = Math.cos(a) * reach;
      const by = stemY + Math.sin(a) * reach * 0.9;
      ctx.strokeStyle = rgba(tint(0x2e7a3e), 1);
      ctx.lineWidth = Math.max(1, 2.6 * hs);
      ctx.beginPath();
      ctx.moveTo(0, stemY);
      ctx.quadraticCurveTo(bx * 0.4, by - 6 * hs, bx, by);
      ctx.stroke();
      // 小榕：寬厚的深綠葉，表面有光澤
      paintLeaf(ctx, bx, by, a, (36 + size * 8) * hs, 13 * hs, tint(0x2f8f45));
      if (algae > 0.2) {
        ctx.fillStyle = `rgba(26,42,20,${algae})`;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * 18 * hs, by + Math.sin(a) * 18 * hs, 3 * hs, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 綁著的小青龍石
    paintSeiryu(ctx, 0, 4 * hs, hs * 0.5, [-55, 0, -32, -50, 8, -60, 40, -34, 55, 0], [[8, -60, 2, -4]], plant.id);
  }
  return { texture: canvasTexture(canvas, true, scale), anchorX: ax, anchorY: ay };
}

/** 造景材料的外觀：沒有專屬素材的石頭用青龍石素材換顏色、比例（火山石偏紅黑、板岩扁平偏灰）。 */
const HARDSCAPE_ART: Record<string, { keys: string[]; height: number; aspect?: number; filter?: string }> = {
  seiryu: { keys: ['rock-1', 'rock-4', 'rock-3', 'rock-5', 'rock-2'], height: 150 },
  lava: { keys: ['rock-3', 'rock-5', 'rock-1'], height: 120, filter: 'grayscale(0.6) sepia(0.7) hue-rotate(-25deg) saturate(1.6) brightness(0.55) contrast(1.15)' },
  slate: { keys: ['rock-3', 'rock-4'], height: 70, aspect: 1.9, filter: 'grayscale(0.85) brightness(0.72) contrast(1.2)' },
  driftwood: { keys: ['wood-1', 'wood-2', 'wood-3'], height: 300 },
};
/** 同一種石頭每塊大小不太一樣（依形狀種子）。 */
const VARIANT_SIZE = [1, 0.82, 0.66, 0.92, 0.74];

export interface HardscapePainting {
  texture: Texture;
  /** 底部中心（落在底沙上的點）在貼圖裡的比例位置。 */
  anchorX: number;
  anchorY: number;
}

/** 一組造景材料畫成一張貼圖（含接觸陰影、水的藍色）。height 是畫面上的高度（px）。 */
export function paintHardscapeItem(id: string, seed: number, hs: number, scale: number, haze: number, flip: boolean, pixelRatio = 1): HardscapePainting {
  const art = HARDSCAPE_ART[id] ?? HARDSCAPE_ART.seiryu;
  const variant = Math.abs(seed) % art.keys.length;
  const img = sceneryImage(art.keys[variant]);
  const height = art.height * hs * scale * (id === 'driftwood' ? 1 : VARIANT_SIZE[Math.abs(seed) % VARIANT_SIZE.length]);
  const w = Math.max(8, height * (art.aspect ?? 1) * 1.45);
  const ch = Math.max(8, height * 1.2);
  const k = Math.max(1, Math.min(pixelRatio, 2));
  const { canvas, ctx } = makeCanvas(w, ch, k);
  const baseY = height * 1.03;
  if (img) drawSceneryArt(ctx, img, w / 2, baseY, height, haze, flip, art, k);
  else paintSeiryu(ctx, w / 2, baseY, height / 127, [-85, 0, -51, -110, 8.5, -126.5, 59.5, -77, 85, 0], [[8.5, -126.5, 0, -10]], seed);
  return { texture: canvasTexture(canvas, false, k), anchorX: 0.5, anchorY: baseY / ch };
}
