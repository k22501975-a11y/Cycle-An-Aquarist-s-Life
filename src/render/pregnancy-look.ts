import type { Graphics } from 'pixi.js';

/**
 * 懷孕的母魚在缸裡看得出來（polish-to-9.md §12.1）：照懷孕程度分 3 段。
 * 1（≥ 0.3）肚子微圓；2（≥ 0.7）肚子明顯變圓、胎斑變大變黑；3（≥ 0.88）肚子方方的、胎斑裡看得到小魚的眼睛、游得慢。
 */
export type PregnancyStage = 0 | 1 | 2 | 3;

/** 每一段從多少懷孕程度開始。 */
export const PREGNANCY_STEPS = [0.3, 0.7, 0.88] as const;

export function pregnancyStage(pregnancy: number): PregnancyStage {
  return pregnancy >= PREGNANCY_STEPS[2] ? 3 : pregnancy >= PREGNANCY_STEPS[1] ? 2 : pregnancy >= PREGNANCY_STEPS[0] ? 1 : 0;
}

/** 身體上下撐開多少（肚子變圓、變方）。 */
const BELLY_Y = [1, 1.05, 1.08, 1.12] as const;
export const bellyScaleY = (stage: PregnancyStage): number => BELLY_Y[stage];

/** 第 3 段游得慢、常停在水草邊：活潑程度乘這個、愛躲至少這麼多。 */
export const HEAVY_ACTIVITY = 0.55;
export const HEAVY_HIDE = 0.9;

/** 胎斑的顏色：深褐近黑。 */
const SPOT = 0x2a1c16;

/**
 * 在母魚身上畫胎斑（肛鰭前上方那塊深色）：第 1 段淡淡一小塊，第 2 段大而黑，
 * 第 3 段方方的一大塊，裡面一排小黑點加一點反光（小魚的眼睛）。座標是魚的圖層座標（頭朝左）。
 */
export function drawGravidSpot(g: Graphics, art: { R: number; bodyEllipse: { x: number; y: number; rx: number; ry: number } }, stage: PregnancyStage): void {
  g.clear();
  if (stage === 0) return;
  const { bodyEllipse: e, R } = art;
  // 胎斑在腹鰭後、肛鰭前上方（畫好的懷孕母魚圖上那塊深色的位置），比身體中心稍微靠頭、在肚子下緣
  const cx = (e.x - e.rx * 0.13) * R;
  const cy = (e.y + e.ry * 0.98) * R;
  const rx = e.rx * (stage === 1 ? 0.08 : stage === 2 ? 0.12 : 0.16) * R;
  const ry = e.ry * (stage === 1 ? 0.24 : stage === 2 ? 0.34 : 0.42) * R;
  if (stage < 3) {
    // 外圈淡、裡面深，邊緣不要一刀切
    g.ellipse(cx, cy, rx * 1.5, ry * 1.5).fill({ color: SPOT, alpha: stage === 1 ? 0.14 : 0.2 });
    g.ellipse(cx, cy, rx, ry).fill({ color: SPOT, alpha: stage === 1 ? 0.32 : 0.6 });
    return;
  }
  // 第 3 段：方方的一塊（圓角很大，像撐開的肚皮），外面一圈淡的暈開
  g.roundRect(cx - rx * 1.45, cy - ry * 1.4, rx * 2.9, ry * 2.8, ry * 1.2).fill({ color: SPOT, alpha: 0.18 });
  g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, ry * 0.75).fill({ color: SPOT, alpha: 0.66 });
  // 小魚的眼睛：兩排錯開的小黑點，每顆一點反光
  const eye = Math.max(0.8, Math.min(rx, ry) * 0.17);
  for (let i = 0; i < 6; i++) {
    const row = i < 3 ? 0 : 1;
    const col = i % 3;
    const x = cx - rx * 0.5 + col * rx * 0.5 + row * rx * 0.22 - rx * 0.1;
    const y = cy - ry * 0.28 + row * ry * 0.52;
    g.circle(x, y, eye).fill({ color: 0x050302, alpha: 0.95 });
    g.circle(x - eye * 0.3, y - eye * 0.3, eye * 0.38).fill({ color: 0xfff4dc, alpha: 0.85 });
  }
}
