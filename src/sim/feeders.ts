import { addFood } from './food';
import { PINCH_MEALS } from './readings';
import { FISH_SPECIES } from './species';
import { hourOfDay, type TankState } from './state';

/**
 * 出遠門用品（design/mvp.md §4.7、food.md §4）。
 * 假期飼料錠：沉在缸底慢慢溶解，一顆約 7 天，給一缸 6 條孔雀魚左右每天半餐的基本營養；平價飼料，比較髒。
 * 自動餵食器：每天 9 點（一天兩次的話加 19 點）投「一小撮」，份量跟著缸裡的魚數變。MVP 不做故障。
 */
export const HOLIDAY_TABLET_DAYS = 7;
export const HOLIDAY_TABLET_MG = 315;
export const FEEDER_HOURS = [9, 19];

/** 放一顆假期飼料錠。 */
export function addHolidayTablet(state: TankState): void {
  (state.holidayTablets ??= []).push(HOLIDAY_TABLET_MG);
}

/** 裝上自動餵食器（已經有就改次數）。 */
export function installFeeder(state: TankState, timesPerDay: 1 | 2 = 1): void {
  state.equipment.feeder = { timesPerDay };
}

/** 缸裡有沒有持續餵食的東西（餵食器，或還沒溶完的飼料錠）。 */
export function hasSteadyFood(state: TankState): boolean {
  return !!state.equipment.feeder || (state.holidayTablets ?? []).length > 0;
}

/** 一小撮：現在缸裡所有魚一餐的 PINCH_MEALS 倍（跟遊戲裡的按鈕一樣）。 */
export function pinchMg(state: TankState): number {
  const meal = state.fish.filter((f) => f.alive).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
  return meal * PINCH_MEALS;
}

export function updateFeeders(state: TankState, dt: number): void {
  const tablets = state.holidayTablets;
  if (tablets && tablets.length > 0) {
    const rate = (HOLIDAY_TABLET_MG / (HOLIDAY_TABLET_DAYS * 24)) * dt;
    let released = 0;
    for (let i = 0; i < tablets.length; i++) {
      const mg = Math.min(tablets[i], rate);
      tablets[i] -= mg;
      released += mg;
    }
    state.holidayTablets = tablets.filter((mg) => mg > 1e-3);
    addFood(state.water, 'sticky', 1, released);
  }
  const feeder = state.equipment.feeder;
  if (!feeder) return;
  // 跨過整點就投（一個 tick 只跨一個整點）
  const before = hourOfDay(state);
  const after = (before + dt) % 24;
  for (const h of FEEDER_HOURS.slice(0, feeder.timesPerDay)) {
    const crossed = before <= after ? before < h && h <= after : before < h || h <= after;
    if (crossed) addFood(state.water, 'floating', 2, pinchMg(state));
  }
}
