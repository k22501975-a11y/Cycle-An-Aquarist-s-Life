/** 水缸內部的座標範圍（像素，以水缸左上角為原點）。 */
export interface TankBounds {
  width: number;
  height: number;
  /** 水面的 y。 */
  surface: number;
  /** 底砂表面的 y。 */
  bottom: number;
}

/** 水缸在畫布上的位置與大小（含外框內側）。 */
export interface TankRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 真實水缸大多是寬比高長（例如 60×30 cm）。畫面比例在這個範圍內就填滿，超出就留白放背景。 */
export const MIN_ASPECT = 1.5;
export const MAX_ASPECT = 2.6;

/**
 * 在畫布中放一個橫向的水缸：盡量填滿，但寬高比夾在 MIN_ASPECT–MAX_ASPECT。
 * 下方留一點空間給缸座。直向手機上水缸會是一條橫的寬缸，上下是房間背景。
 */
export function tankRect(canvasWidth: number, canvasHeight: number): TankRect {
  const margin = Math.max(6, Math.min(canvasWidth, canvasHeight) * 0.025);
  const standHeight = Math.min(28, canvasHeight * 0.06);
  const availW = Math.max(1, canvasWidth - margin * 2);
  const availH = Math.max(1, canvasHeight - margin * 2 - standHeight);
  let width = availW;
  let height = availH;
  if (width / height > MAX_ASPECT) width = height * MAX_ASPECT;
  if (width / height < MIN_ASPECT) height = width / MIN_ASPECT;
  const x = (canvasWidth - width) / 2;
  // 直向時水缸放在畫面中間偏下，像擺在缸座上。
  const y = Math.max(margin, (canvasHeight - standHeight - height) / 2 + (availH - height) * 0.15);
  return { x, y, width, height };
}

export function tankBounds(width: number, height: number): TankBounds {
  return { width, height, surface: height * 0.07, bottom: height * 0.84 };
}

/** 依水缸高度縮放魚與水草，讓手機與桌機看起來比例一致。 */
export function unitScale(bounds: TankBounds): number {
  return Math.max(0.6, Math.min(2.6, bounds.height / 300));
}
