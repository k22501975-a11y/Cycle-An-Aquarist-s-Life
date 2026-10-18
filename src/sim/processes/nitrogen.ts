import { KH_CONSUMED_PER_MG_TAN, O2_PER_MG_NO2_TO_NO3, O2_PER_MG_TAN_TO_NO2, temperatureFactor } from '../chemistry';
import { BACTERIA_SEED, isFilterRunning, type TankState } from '../state';
import { hardscapeBacteriaCapacity } from './hardscape';

/** 半飽和常數（mg/L）：受質濃度在此時細菌以一半速度工作。 */
const HALF_SATURATION = 0.2;
/** 最大比生長率（每小時）。硝化菌繁殖很慢，所以新缸要養好幾週。 */
const AOB_GROWTH = 0.03;
const NOB_GROWTH = 0.03;
/** 自然死亡率（每小時）。沒有食物時族群會慢慢縮小。 */
const DECAY = 0.003;
/** 缸壁、底砂也能長一點細菌（每公升水的容量）。 */
const SURFACE_CAPACITY_PER_LITER = 0.005;

/** 細菌族群上限：濾材（過濾器運轉中才算）＋缸內表面。 */
export function bacteriaCapacity(state: TankState): number {
  const surface = state.equipment.tank.volumeL * SURFACE_CAPACITY_PER_LITER + hardscapeBacteriaCapacity(state);
  const filter = state.equipment.filter;
  return surface + (filter && isFilterRunning(state) ? filter.spec.bacteriaCapacityMgPerHour : 0);
}

/** 濾材上的細菌佔全部的比例（洗濾材、換過濾器時會失去這部分）。 */
export function filterBacteriaShare(state: TankState): number {
  const filter = state.equipment.filter;
  if (!filter) return 0;
  const surface = state.equipment.tank.volumeL * SURFACE_CAPACITY_PER_LITER + hardscapeBacteriaCapacity(state);
  return filter.spec.bacteriaCapacityMgPerHour / (filter.spec.bacteriaCapacityMgPerHour + surface);
}

export function updateNitrogen(state: TankState, dt: number): void {
  const { water, bacteria } = state;
  const volume = state.equipment.tank.volumeL;
  const tf = temperatureFactor(water.tempC);
  // pH 低於 6.5 時硝化作用明顯變慢；溶氧不足也會。
  const phFactor = water.ph >= 7 ? 1 : Math.max(0.05, (water.ph - 5.5) / 1.5);
  const o2Factor = water.o2 / (water.o2 + 1);
  const activity = tf * phFactor * o2Factor;
  const capacity = bacteriaCapacity(state);

  // 亞硝化：氨 → 亞硝酸鹽
  const tanSat = water.tan / (HALF_SATURATION + water.tan);
  const tanProcessed = Math.min(water.tan * volume, bacteria.aob * tanSat * activity * dt);
  water.tan -= tanProcessed / volume;
  water.no2 += tanProcessed / volume;

  // 硝化：亞硝酸鹽 → 硝酸鹽
  const no2Sat = water.no2 / (HALF_SATURATION + water.no2);
  const no2Processed = Math.min(water.no2 * volume, bacteria.nob * no2Sat * activity * dt);
  water.no2 -= no2Processed / volume;
  water.no3 += no2Processed / volume;

  water.kh = Math.max(0, water.kh - (tanProcessed / volume) * KH_CONSUMED_PER_MG_TAN);
  water.o2 = Math.max(
    0,
    water.o2 - (tanProcessed * O2_PER_MG_TAN_TO_NO2 + no2Processed * O2_PER_MG_NO2_TO_NO3) / volume,
  );

  // 族群成長：有食物才長，受濾材容量限制；容量變小（過濾器停機）時會死掉一部分。
  bacteria.aob = grow(bacteria.aob, AOB_GROWTH * tanSat * activity, capacity, dt);
  bacteria.nob = grow(bacteria.nob, NOB_GROWTH * no2Sat * activity, capacity, dt);
}

function grow(population: number, growthRate: number, capacity: number, dt: number): number {
  const rate = growthRate * (1 - population / capacity) - DECAY;
  return Math.max(BACTERIA_SEED, population * Math.exp(rate * dt));
}
