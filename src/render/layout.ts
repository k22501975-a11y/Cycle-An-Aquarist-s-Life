/** 水缸內部的座標範圍（像素，以畫布左上角為原點）。 */
export interface TankBounds {
  width: number;
  height: number;
  /** 水面的 y（魚游不上去的高度）。 */
  surface: number;
  /** 底砂表面的 y。 */
  bottom: number;
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
