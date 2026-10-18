import { CanvasSource, Texture } from 'pixi.js';

/**
 * 用 Canvas 2D 程式繪製貼圖（漸層、柔邊、半透明）。精繪素材到位之前，魚、背景、造景都用這裡產生的替代圖；
 * 之後換成畫師／AI 繪製的 PNG 時，只要回傳同樣尺寸與錨點的貼圖即可（design/art-style.md §0.3、§0.5）。
 */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

/** Canvas 轉成 Pixi 貼圖；縮小顯示的貼圖開 mipmap，避免鋸齒與閃爍。 */
export function canvasTexture(canvas: HTMLCanvasElement, mipmaps = true): Texture {
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: mipmaps, scaleMode: 'linear' });
  return new Texture({ source });
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
