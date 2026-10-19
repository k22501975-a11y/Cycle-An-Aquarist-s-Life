import { CanvasSource, Texture } from 'pixi.js';

/**
 * 用 Canvas 2D 程式繪製貼圖（漸層、柔邊、半透明）。精繪素材到位之前，魚、背景、造景都用這裡產生的替代圖；
 * 之後換成畫師／AI 繪製的 PNG 時，只要回傳同樣尺寸與錨點的貼圖即可（design/art-style.md §0.3、§0.5）。
 */

export type Ctx = CanvasRenderingContext2D;

/**
 * 開一張畫布。scale > 1 時畫布像素多 scale 倍、座標照原本的 CSS 像素畫（手機高密度螢幕用），
 * 轉貼圖時要把同一個 scale 傳給 canvasTexture，畫面上的大小才不變。
 */
export function makeCanvas(width: number, height: number, scale = 1): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d')!;
  if (scale !== 1) ctx.scale(scale, scale);
  return { canvas, ctx };
}

/** Canvas 轉成 Pixi 貼圖；縮小顯示的貼圖開 mipmap，避免鋸齒與閃爍。resolution 是畫布的 scale。 */
export function canvasTexture(canvas: HTMLCanvasElement, mipmaps = true, resolution = 1): Texture {
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: mipmaps, scaleMode: 'linear', resolution });
  return new Texture({ source });
}

/** 預先畫好的整幅貼圖最多畫多寬（像素）：再大只是更吃記憶體。 */
const PAINT_MAX_PX = 2560;

/** 照螢幕解析度畫整幅貼圖的倍率：不低於 1、最多 2 倍、寬度不超過上限。 */
export function paintScale(pixelRatio: number, width: number): number {
  return Math.max(1, Math.min(pixelRatio, 2, PAINT_MAX_PX / Math.max(1, width)));
}

/** 可重現的亂數（同一張圖每次產生都一樣）。 */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

export function mix(c1: number, c2: number, t: number): number {
  const ch = (shift: number) => Math.round(((c1 >> shift) & 255) * (1 - t) + ((c2 >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 柔和的圓形光點貼圖（白色、中心不透明、邊緣透明），粒子、光暈共用。 */
let softDot: Texture | null = null;
export function softDotTexture(): Texture {
  if (softDot) return softDot;
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softDot = canvasTexture(canvas);
  return softDot;
}

/** 沉底顆粒、藻片：圓圓的小顆粒，帶立體亮面。 */
let pellets: Texture[] | null = null;
export function pelletTextures(): Texture[] {
  if (pellets) return pellets;
  const colors = [['#7a4a26', '#b9824c'], ['#4f6b2c', '#93ad5a'], ['#8a5a2a', '#d0a060']];
  pellets = colors.map(([base, hi]) => {
    const { canvas, ctx } = makeCanvas(32, 32);
    const g = ctx.createRadialGradient(12, 11, 1, 16, 16, 13);
    g.addColorStop(0, hi);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(16, 16, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,5,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(12, 11, 3.5, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    return canvasTexture(canvas);
  });
  return pellets;
}

/** 冷凍紅蟲：彎彎的細長紅色小蟲，一節一節。 */
let worms: Texture[] | null = null;
export function wormTextures(): Texture[] {
  if (worms) return worms;
  worms = [0, 1, 2].map((k) => {
    const rand = seeded(311 + k * 23);
    const { canvas, ctx } = makeCanvas(48, 24);
    const bend = (rand() - 0.5) * 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#9c1c1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(5, 12);
    ctx.quadraticCurveTo(24, 12 + bend, 43, 12 - bend * 0.3);
    ctx.stroke();
    ctx.strokeStyle = '#d8453a';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // 一節一節的環紋
    ctx.strokeStyle = 'rgba(80,0,0,0.5)';
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const x = (1 - t) * (1 - t) * 5 + 2 * (1 - t) * t * 24 + t * t * 43;
      const y = (1 - t) * (1 - t) * 12 + 2 * (1 - t) * t * (12 + bend) + t * t * (12 - bend * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y - 2.2);
      ctx.lineTo(x, y + 2.2);
      ctx.stroke();
    }
    return canvasTexture(canvas);
  });
  return worms;
}

/** 黏缸壁錠：壓在玻璃上的一塊圓餅，邊緣已經開始散開。 */
let tablet: Texture | null = null;
export function tabletTexture(): Texture {
  if (tablet) return tablet;
  const rand = seeded(77);
  const { canvas, ctx } = makeCanvas(64, 64);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 20 + rand() * 9;
    ctx.fillStyle = `rgba(${150 + rand() * 40},${110 + rand() * 30},${60 + rand() * 20},0.55)`;
    ctx.beginPath();
    ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.5 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(28, 26, 2, 32, 32, 22);
  g.addColorStop(0, '#e7c486');
  g.addColorStop(0.7, '#b98a4c');
  g.addColorStop(1, '#8c6230');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 20, 0, Math.PI * 2);
  ctx.fill();
  // 混在裡面的綠色藻粉和紅色蝦粉
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, r = rand() * 17;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(90,130,50,0.7)' : 'rgba(190,70,50,0.6)';
    ctx.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.6, 1.6);
  }
  tablet = canvasTexture(canvas);
  return tablet;
}

/** 飼料片：幾種顏色的不規則薄片，帶一點亮面。 */
let flakes: Texture[] | null = null;
export function flakeTextures(): Texture[] {
  if (flakes) return flakes;
  const colors = [['#e0913c', '#f7c271'], ['#c8452e', '#f08a64'], ['#8fa53a', '#c9d878'], ['#d9a646', '#f4dc8e']];
  flakes = colors.map(([base, hi], k) => {
    const rand = seeded(91 + k * 17);
    const { canvas, ctx } = makeCanvas(32, 32);
    ctx.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 9 + rand() * 6;
      const x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r * 0.75;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(6, 6, 26, 26);
    g.addColorStop(0, hi);
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,40,10,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(12, 12, 4, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
    return canvasTexture(canvas);
  });
  return flakes;
}
