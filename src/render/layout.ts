/** 水缸內部的座標範圍（像素）。 */
export interface TankBounds {
  width: number;
  height: number;
  /** 水面的 y。 */
  surface: number;
  /** 底砂表面的 y。 */
  bottom: number;
}

export function tankBounds(width: number, height: number): TankBounds {
  return { width, height, surface: height * 0.06, bottom: height * 0.86 };
}

/** 依畫面大小縮放魚與水草，讓手機與桌機看起來比例一致。 */
export function unitScale(bounds: TankBounds): number {
  return Math.max(0.7, Math.min(1.6, Math.min(bounds.width / 380, bounds.height / 620)));
}
