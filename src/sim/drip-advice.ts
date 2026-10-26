import { tankHabit, type WaterHabit } from './acclimation';
import type { TankState } from './state';
import { BAG_ML, bagMl, DRIP_MAX_ML_PER_S, DRIP_READY_GAP, dripGap, dripReady, habitSeverity, type DripGrade, type DripOutcome, type DripSession } from './drip';

/** 魚受得了的「每秒變化量」（差距嚴重度／秒）；超過就開始緊張。 */
const TOLERANCE_PER_S = 0.08;
/** 不緊張時每秒放鬆多少。 */
const CALM_PER_S = 0.15;

/** 滴流對水的建議：開機用不到，分出來讓開機少載一點。 */
/** 照建議（滴速一直開在綠線上）要滴幾秒才能放魚：小遊戲用來壓縮時間（mvp.md §4.4.3）。 */
export function dripAdviceSeconds(from: WaterHabit, to: WaterHabit): number {
  const s: DripSession = { from, to, addedMl: 0, nervous: 0, peakNervous: 0, seconds: 0 };
  while (!dripReady(s) && s.seconds < 3600) stepDrip(s, safeRate(s), 0.1);
  return s.seconds;
}

/** 袋子裡現在的水（畫面上的差距條、袋子水位用）。 */
export function bagWater(s: DripSession): WaterHabit {
  const g = dripGap(s);
  const mix = (a: number, b: number) => a * g + b * (1 - g);
  return { ph: mix(s.from.ph, s.to.ph), gh: mix(s.from.gh, s.to.gh), tempC: mix(s.from.tempC, s.to.tempC) };
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

export function startDrip(state: TankState, from: WaterHabit): DripSession {
  return { from: { ...from }, to: tankHabit(state), addedMl: 0, nervous: 0, peakNervous: 0, seconds: 0 };
}

/** 對得好不好：完美的魚一進缸就展開尾巴（畫面演出）。 */
export function dripGrade(o: DripOutcome): DripGrade {
  if (o.gap <= DRIP_READY_GAP && o.rush < 0.3) return 'perfect';
  if (o.gap <= 0.5 && o.rush < 0.6) return 'good';
  return 'rushed';
}
