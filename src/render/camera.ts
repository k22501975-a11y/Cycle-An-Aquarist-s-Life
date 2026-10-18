/**
 * 大缸的鏡頭：90 cm 以上的缸畫得比畫面寬，可以左右滑動、雙指縮放。
 * span 是缸畫出來的寬度相對畫面寬的倍數（1 = 整缸塞進畫面）；pan 是畫面左緣在缸裡的位置（像素）。
 */

export interface Camera {
  span: number;
  pan: number;
}

/** 從幾公分寬的缸開始可以滑動。 */
export const SCROLL_FROM_CM = 90;
/** 縮放一格的大小：每次改變都要重畫造景，所以用固定幾格，不連續縮放。 */
export const SPAN_STEP = 0.25;

/** 最多拉近到多少：魚看起來和 60 cm 缸差不多大，最多 2.5 倍畫面寬。 */
export function maxSpan(tankWidthCm: number): number {
  if (tankWidthCm < SCROLL_FROM_CM) return 1;
  return Math.min(2.5, snapSpan(tankWidthCm / 60));
}

export function snapSpan(span: number): number {
  return Math.max(1, Math.round(span / SPAN_STEP) * SPAN_STEP);
}

export function clampPan(pan: number, span: number, screenWidth: number): number {
  return Math.min(Math.max(0, screenWidth * (span - 1)), Math.max(0, pan));
}

/** 以畫面上 anchorX 這一點為中心縮放：那一點底下的東西留在原地。 */
export function zoomAt(cam: Camera, factor: number, anchorX: number, screenWidth: number, max: number): Camera {
  const span = Math.min(max, snapSpan(cam.span * factor));
  if (span === cam.span) return cam;
  const u = (cam.pan + anchorX) / (cam.span * screenWidth);
  return { span, pan: clampPan(u * span * screenWidth - anchorX, span, screenWidth) };
}

/** 換缸或畫面大小改變後，把鏡頭限制在合理範圍；換成大缸時預設拉近、對準中間。 */
export function fitCamera(cam: Camera, tankWidthCm: number, screenWidth: number, tankChanged: boolean): Camera {
  const max = maxSpan(tankWidthCm);
  const span = tankChanged ? max : Math.min(max, cam.span);
  const pan = tankChanged ? (screenWidth * (span - 1)) / 2 : cam.pan;
  return { span, pan: clampPan(pan, span, screenWidth) };
}
