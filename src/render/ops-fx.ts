/** 換水、測水、修剪的操作演出：只有數學，畫面物件在 tank-view。 */

import { mix } from './paint';

export const WATER_CHANGE_SECONDS = 4;

export interface WaterChangeFrame {
  /** 水位下降了多少（0 滿水，1 降到換水比例的位置）。 */
  drop: number;
  /** 正在虹吸抽水（畫虹吸管）。 */
  siphon: boolean;
  /** 正在加水（畫水柱）。 */
  pour: boolean;
}

/** 換水演出：抽水 1.5 秒、停一下、加水 1.6 秒。 */
export function waterChangeFrame(t: number): WaterChangeFrame {
  if (t < 0 || t >= WATER_CHANGE_SECONDS) return { drop: 0, siphon: false, pour: false };
  const ease = (k: number) => k * k * (3 - 2 * k);
  if (t < 1.5) return { drop: ease(t / 1.5), siphon: true, pour: false };
  if (t < 2.1) return { drop: 1, siphon: false, pour: false };
  const k = Math.min(1, (t - 2.1) / 1.6);
  return { drop: 1 - ease(k), siphon: false, pour: k < 1 };
}

/** 從換水前後的硝酸鹽反推換了幾成水（算不出來就當三成）。 */
export function inferFraction(no3Before: number, no3After: number, tapNo3: number): number {
  const span = no3Before - tapNo3;
  if (Math.abs(span) < 0.5) return 0.3;
  return Math.min(0.8, Math.max(0.1, (no3Before - no3After) / span));
}

export type KitParam = 'ph' | 'ammonia' | 'nitrite' | 'nitrate';

/** 測試劑的比色：仿常見液體測試劑的顏色。 */
const KIT_STOPS: Record<KitParam, Array<[number, number]>> = {
  ph: [[6.0, 0xe8d23a], [7.0, 0x8fbf4a], [7.6, 0x4a8fc0], [8.4, 0x8a4ab0]],
  ammonia: [[0, 0xe9dc4a], [1, 0xb4c84a], [8, 0x2f8a4a]],
  nitrite: [[0, 0x6ab8e0], [1, 0x9a5ac8], [5, 0x7a2a9a]],
  nitrate: [[0, 0xf0d84a], [20, 0xf08a3a], [160, 0xa81e2a]],
};

export function kitColor(param: KitParam, value: number): number {
  const stops = KIT_STOPS[param];
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    if (value <= v1) {
      const [v0, c0] = stops[i - 1];
      return mix(c0, c1, (value - v0) / (v1 - v0));
    }
  }
  return stops[stops.length - 1][1];
}

export const TEST_SECONDS = 5;

/** 試管演出：裝水、滴試劑後慢慢變色、停一會兒再淡出。 */
export function tubeFrame(t: number): { fill: number; tint: number; alpha: number } {
  if (t < 0 || t >= TEST_SECONDS) return { fill: 0, tint: 0, alpha: 0 };
  const fill = Math.min(1, t / 0.6);
  const tint = Math.max(0, Math.min(1, (t - 0.7) / 1.2));
  const alpha = Math.min(1, t / 0.25, (TEST_SECONDS - t) / 0.6);
  return { fill, tint, alpha };
}

/** 修剪：生物量一下子少了至少半根插枝，就算剪了幾根（最多畫 5 根）。 */
export function cuttingsFromDrop(before: number, after: number, cuttingMassG: number): number {
  const drop = before - after;
  if (drop < cuttingMassG * 0.5) return 0;
  return Math.min(5, Math.max(1, Math.round(drop / cuttingMassG)));
}
