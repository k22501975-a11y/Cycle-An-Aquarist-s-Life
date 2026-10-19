/** 水缸內部的座標範圍（像素，以畫布左上角為原點）。 */
export interface TankBounds {
  width: number;
  height: number;
  /** 水面的 y（魚游不上去的高度）。 */
  surface: number;
  /** 底砂表面的 y。 */
  bottom: number;
  /** 沙面的高低起伏：x 處東西會停在哪個 y（沒有就是平的 bottom）。 */
  floor?: (x: number) => number;
}

/** x 處的沙面：飼料、蝦、死魚停在這裡。 */
export function floorAt(b: TankBounds, x: number): number {
  return b.floor ? b.floor(x) : b.bottom;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 育幼盒掛在缸的右上角、上緣露出水面一點（#187）。盒裡的魚只在框裡游。 */
export function nurseryRect(b: TankBounds): Rect {
  const w = Math.min(b.width * 0.2, 220);
  const h = Math.min((b.bottom - b.surface) * 0.32, 150);
  return { x: b.width * 0.96 - w, y: b.surface - h * 0.12, w, h };
}

/** 把盒裡的魚關在框裡（留 pad 的邊），撞到邊就掉頭。回傳有沒有撞到。 */
export function keepInRect(s: { x: number; y: number; vx: number; vy: number }, r: Rect, surface: number, pad: number): boolean {
  const x0 = r.x + pad, x1 = r.x + r.w - pad;
  const y0 = Math.max(r.y, surface) + pad, y1 = r.y + r.h - pad;
  let hit = false;
  if (s.x < x0 || s.x > x1) {
    s.x = Math.min(x1, Math.max(x0, s.x));
    s.vx = -s.vx * 0.5;
    hit = true;
  }
  if (s.y < y0 || s.y > y1) {
    s.y = Math.min(y1, Math.max(y0, s.y));
    s.vy = -s.vy * 0.5;
    hit = true;
  }
  return hit;
}

/** 狀態列、下方按鈕列蓋住畫面的高度（它們是半透明的，水缸畫在它們後面）。 */
export interface Insets {
  top: number;
  bottom: number;
}

/**
 * 水缸撐滿整個畫面（design/art-style.md §7：缸永遠撐滿畫面）。
 * 狀態列與按鈕列是半透明的浮動卡片，水和底沙延伸到它們後面；魚的活動範圍避開被蓋住的地方。
 */
export function sceneBounds(width: number, height: number, insets: Insets): TankBounds {
  const surface = Math.min(height * 0.4, insets.top + Math.max(6, height * 0.015));
  const sandDepth = Math.max(22, height * 0.07);
  const bottom = Math.max(surface + 60, height - insets.bottom - sandDepth);
  return { width, height, surface, bottom };
}

/**
 * 鏡頭：每公分幾個像素。畫面大小固定，所以缸越大鏡頭拉越遠、魚看起來越小。
 * 畫面比例和真實的缸不一定相同（手機很扁），取寬、高兩個方向的幾何平均。
 */
export function pxPerCm(bounds: TankBounds, sizeCm: { w: number; h: number }): number {
  const water = Math.max(1, bounds.bottom - bounds.surface);
  // 底沙與水面上的空間約佔缸高的兩成
  return Math.sqrt((bounds.width / sizeCm.w) * (water / (sizeCm.h * 0.8)));
}
