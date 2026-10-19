import { tankHabit, type WaterHabit } from './acclimation';
import { economy } from './economy';
import { waterGh } from './growth';
import type { TankState } from './state';

/**
 * 對水小遊戲（design/first-10-minutes.md F5，接 acclimation.md）：
 * 袋子裡是魚場的水，玩家按住滴管調滴速，缸水一滴一滴進袋子，袋子水位上升、水質差距慢慢收斂。
 * 差距越大越要滴慢：變化太快魚會緊張（nervous 上升，畫面上顏色變淡）。
 * 放魚時看還剩多少差距（gap）和最緊張到什麼程度（rush），換算成放進缸的休克（releaseShock）。
 * 這裡只算數值，時間用現實秒數（小遊戲大約 15～40 秒）。
 */

/** 袋子裡原本的水（mL）。 */
export const BAG_ML = 500;
/** 滴管開到最大每秒滴進多少 mL。 */
export const DRIP_MAX_ML_PER_S = 100;
/** 差距剩這麼多就可以放魚了（袋子水量到原本的 4 倍）。 */
export const DRIP_READY_GAP = 0.25;
/** 魚受得了的「每秒變化量」（差距嚴重度／秒）；超過就開始緊張。 */
const TOLERANCE_PER_S = 0.08;
/** 不緊張時每秒放鬆多少。 */
const CALM_PER_S = 0.15;
/** 前幾次買魚一定要玩對水小遊戲，之後可以一鍵「慢慢過水」。 */
export const DRIP_TUTORIAL_TIMES = 3;

export interface DripSession {
  /** 袋子裡原本的水（魚習慣的）。 */
  from: WaterHabit;
  /** 缸裡的水。 */
  to: WaterHabit;
  /** 已經滴進袋子的缸水（mL）。 */
  addedMl: number;
  /** 魚現在多緊張（0～1）。 */
  nervous: number;
  /** 整段過程最緊張到多少。 */
  peakNervous: number;
  /** 玩了幾秒。 */
  seconds: number;
}

export type DripGrade = 'perfect' | 'good' | 'rushed';

export interface DripOutcome {
  /** 放魚時還剩多少差距（0 完全對好、1 直接倒）。 */
  gap: number;
  /** 過程中最緊張到多少（0～1）。 */
  rush: number;
}

/** 水差多少的嚴重度：pH 差 0.5、水溫差 2 度、GH 差 4 各算 1（跟舒適範圍一致）。 */
export function habitSeverity(a: WaterHabit, b: WaterHabit): number {
  return Math.abs(a.ph - b.ph) / 0.5 + Math.abs(a.tempC - b.tempC) / 2 + Math.abs(a.gh - b.gh) / 4;
}

export function startDrip(state: TankState, from: WaterHabit): DripSession {
  return { from: { ...from }, to: tankHabit(state), addedMl: 0, nervous: 0, peakNervous: 0, seconds: 0 };
}

/** 還剩多少差距（0～1）：袋子裡原本的水佔多少。 */
export function dripGap(s: DripSession): number {
  return BAG_ML / (BAG_ML + s.addedMl);
}

/** 袋子裡現在的水（畫面上的差距條、袋子水位用）。 */
export function bagWater(s: DripSession): WaterHabit {
  const g = dripGap(s);
  const mix = (a: number, b: number) => a * g + b * (1 - g);
  return { ph: mix(s.from.ph, s.to.ph), gh: mix(s.from.gh, s.to.gh), tempC: mix(s.from.tempC, s.to.tempC) };
}

/** 袋子現在的水量（mL）。 */
export function bagMl(s: DripSession): number {
  return BAG_ML + s.addedMl;
}

/** 照現在的差距，滴速最多開到多少（0～1）魚還不會緊張；畫面可以在滴速條上標出這條線。 */
export function safeRate(s: DripSession): number {
  const severity = habitSeverity(s.from, s.to);
  if (severity <= 0) return 1;
  const v = bagMl(s);
  // 每秒變化量 = 嚴重度 × d(gap)/dt = 嚴重度 × BAG_ML × 滴速 / 水量²
  return Math.min(1, (TOLERANCE_PER_S * v * v) / (severity * BAG_ML * DRIP_MAX_ML_PER_S));
}

/** 過了 dtS 現實秒，滴管開在 rate（0～1）。 */
export function stepDrip(s: DripSession, rate: number, dtS: number): void {
  const r = Math.max(0, Math.min(1, rate));
  if (dtS <= 0) return;
  const before = dripGap(s);
  s.addedMl += r * DRIP_MAX_ML_PER_S * dtS;
  const change = (habitSeverity(s.from, s.to) * (before - dripGap(s))) / dtS;
  if (change > TOLERANCE_PER_S) s.nervous = Math.min(1, s.nervous + ((change - TOLERANCE_PER_S) / TOLERANCE_PER_S) * 0.5 * dtS);
  else s.nervous = Math.max(0, s.nervous - CALM_PER_S * dtS);
  s.peakNervous = Math.max(s.peakNervous, s.nervous);
  s.seconds += dtS;
}

/** 可以放魚了（差距夠小）。玩家也可以提早放，只是休克大一點。 */
export function dripReady(s: DripSession): boolean {
  return dripGap(s) <= DRIP_READY_GAP;
}

export function dripOutcome(s: DripSession): DripOutcome {
  return { gap: dripGap(s), rush: s.peakNervous };
}

/** 對得好不好：完美的魚一進缸就展開尾巴（畫面演出）。 */
export function dripGrade(o: DripOutcome): DripGrade {
  if (o.gap <= DRIP_READY_GAP && o.rush < 0.3) return 'perfect';
  if (o.gap <= 0.5 && o.rush < 0.6) return 'good';
  return 'rushed';
}

/** 一鍵「慢慢過水」：跟慢慢滴到好一樣。 */
export const PATIENT_DRIP: DripOutcome = { gap: DRIP_READY_GAP, rush: 0 };

/** 還要強制玩幾次對水小遊戲。 */
export function dripTutorialLeft(state: TankState): number {
  return Math.max(0, DRIP_TUTORIAL_TIMES - (economy(state).dripsDone ?? 0));
}

/** 玩完一次對水小遊戲（放魚時呼叫）。 */
export function recordDrip(state: TankState): void {
  const e = economy(state);
  e.dripsDone = (e.dripsDone ?? 0) + 1;
}

/**
 * 放魚時的休克：差距收斂到 DRIP_READY_GAP 就跟傳統滴水對水一樣沒事，完全沒滴（gap 1）跟直接倒進去一樣；
 * 中間照比例。再加上過程中嚇到的緊迫。
 */
export function dripShock(state: TankState, from: WaterHabit, o: DripOutcome): { stress: number; harm: number } {
  const left = Math.max(0, Math.min(1, (o.gap - DRIP_READY_GAP) / (1 - DRIP_READY_GAP)));
  const dPh = Math.abs(from.ph - state.water.ph) * left;
  const dT = Math.abs(from.tempC - state.water.tempC) * left;
  const dGh = Math.abs(from.gh - waterGh(state)) * left;
  const stress = Math.min(0.6, dT * 0.08 + dPh * 0.3 + dGh * 0.02 + Math.max(0, Math.min(1, o.rush)) * 0.3);
  const harm = Math.max(0, dPh - 1) * 0.5 + Math.max(0, dT - 4) * 0.1;
  return { stress, harm };
}
