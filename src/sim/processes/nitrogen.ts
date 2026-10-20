import { KH_CONSUMED_PER_MG_TAN, O2_PER_MG_NO2_TO_NO3, O2_PER_MG_TAN_TO_NO2, temperatureFactor } from '../chemistry';
import { BACTERIA_SEED, isFilterRunning, type TankState } from '../state';
import { hardscapeBacteriaCapacity } from './hardscape';

/** 半飽和常數（mg/L）：受質濃度在此時細菌以一半速度工作。 */
const HALF_SATURATION = 0.2;
/**
 * 族群成長的半飽和常數（mg/L），比分解的低：廢物很少（1 株水草、一公兩母、一天一小撮）時菌也長得起來，
 * 新缸約第 5 天養好；一次放太多魚、餵太多，氨還是來不及處理（design/mvp.md §4.6）。
 */
const GROWTH_HALF_SATURATION = 0.04;
/** 最大比生長率（每小時）。少量魚、正常餵食時新缸約 3～7 天養好（YenWel 2026-10-19 定案）；一次放太多魚還是會氨爆。 */
const AOB_GROWTH = 0.12;
const NOB_GROWTH = 0.14;
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

/** 兩種硝化菌都長到這個量，才算「養好了」（少量魚、正常餵食約 5～8 天）。 */
export const CYCLED_BACTERIA = 0.3;

/** 還在養水、水裡有氨時放新魚，養水期多這麼多小時（design/polish-to-9.md §4：多 1 天）。 */
export const CYCLE_DELAY_PER_BATCH_H = 24;
/** 「氨不歸零」的門檻（mg/L），跟 isCycled 一樣（亞硝也用同一個）。 */
const AMMONIA_PRESENT = 0.1;
/** 延長期間硝化菌進度最多顯示到這裡，看得出還沒好。 */
const DELAYED_MATURITY_CAP = 0.95;

/** 兩種硝化菌長到「養好」的程度（0～1），不管有沒有被延長。 */
function bacteriaMaturity(state: TankState): number {
  return Math.min(1, Math.min(state.bacteria.aob, state.bacteria.nob) / CYCLED_BACTERIA);
}

/** 硝化菌長起來的程度（0～1）：取比較慢的那種；放新魚延長養水期時，多等的那段停在 95%。 */
export function cycleMaturity(state: TankState): number {
  const m = bacteriaMaturity(state);
  return (state.cycleDelay?.leftH ?? 0) > 0 ? Math.min(m, DELAYED_MATURITY_CAP) : m;
}

/**
 * 店裡的魚放進還在養水、氨不歸零的缸：魚撐得住（fauna 的氨耐受），但新增的廢物讓養水期多約 1 天。
 * 回傳這次有沒有延長（畫面用來讓老闆提醒）。同一個小時放進來的算同一批，只延長一次。
 */
export function delayCycleForNewFish(state: TankState): boolean {
  if (cycleMaturity(state) >= 1 || state.water.tan < AMMONIA_PRESENT) return false;
  const d = state.cycleDelay;
  if (d && d.addedHours === state.hours) return false;
  state.cycleDelay = { leftH: (d?.leftH ?? 0) + CYCLE_DELAY_PER_BATCH_H, addedHours: state.hours };
  return true;
}

/** 缸子養好了：硝化菌夠多，而且氨和亞硝酸鹽真的被處理掉了。 */
export function isCycled(state: TankState): boolean {
  return cycleMaturity(state) >= 1 && state.water.tan < AMMONIA_PRESENT && state.water.no2 < AMMONIA_PRESENT;
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
  const tanGrowth = water.tan / (GROWTH_HALF_SATURATION + water.tan);
  const no2Growth = water.no2 / (GROWTH_HALF_SATURATION + water.no2);
  bacteria.aob = grow(bacteria.aob, AOB_GROWTH * tanGrowth * activity, capacity, dt);
  bacteria.nob = grow(bacteria.nob, NOB_GROWTH * no2Growth * activity, capacity, dt);

  // 養水期延長：本來已經算養好（菌夠、氨和亞硝都退了）以後才開始倒數，多等的時間不會跟等亞硝退掉重疊
  const delay = state.cycleDelay;
  if (delay && delay.leftH > 0 && bacteriaMaturity(state) >= 1 && water.tan < AMMONIA_PRESENT && water.no2 < AMMONIA_PRESENT) delay.leftH = Math.max(0, delay.leftH - dt);
}

function grow(population: number, growthRate: number, capacity: number, dt: number): number {
  const rate = growthRate * (1 - population / capacity) - DECAY;
  return Math.max(BACTERIA_SEED, population * Math.exp(rate * dt));
}
