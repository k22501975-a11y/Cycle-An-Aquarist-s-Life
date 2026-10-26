import type { TankState } from './state';
import { AMMONIA_SCALE, NITRITE_SCALE, nearest, measuredProblem, NORMAL_WATER_CHANGE, BIG_WATER_CHANGE } from './readings';

/** 開機用不到，分出來讓開機少載一點（docs/performance-budget.md）。 */
/**
 * 建議換多少水（#237）：量得到氨或亞硝時，挑換完讀數會掉一格的那個量（三成不夠就換一半），沒有問題就是平常的三成。
 * 新缸第 1 天氨讀 0.25（實際約 0.22）：換三成只降到 0.16，色卡還是 0.25；換一半降到 0.11，才讀得到 0。
 */
export function suggestedWaterChange(state: TankState): number {
  const problem = measuredProblem(state);
  if (!problem) return NORMAL_WATER_CHANGE;
  const [scale, value] = problem === 'ammonia' ? [AMMONIA_SCALE, state.water.tan] : [NITRITE_SCALE, state.water.no2];
  return nearest(scale, value * (1 - NORMAL_WATER_CHANGE)) < nearest(scale, value) ? NORMAL_WATER_CHANGE : BIG_WATER_CHANGE;
}
