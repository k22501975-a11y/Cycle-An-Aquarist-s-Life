import { price, spend } from './economy';
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

/** 裝上自動餵食器（已經有就改次數）。新裝的先按一次「手動餵一次」試餵（daily-loop.md §7 第 3 點）。 */
export function installFeeder(state: TankState, timesPerDay: 1 | 2 = 1): void {
  const fresh = !state.equipment.feeder;
  state.equipment.feeder = { timesPerDay };
  if (fresh) addFood(state.water, 'floating', 2, pinchMg(state));
}

/** 裝好餵食器的提示：先試餵一次、之後幾點自動餵。 */
export function feederInstalledText(timesPerDay: 1 | 2): string {
  return `裝好了，先試餵一次。之後每天 ${FEEDER_HOURS.slice(0, timesPerDay).map((h) => `${h} 點`).join('、')}自動餵。`;
}

/** 早上報告的提示直接買（daily-loop.md §4）：這缸裝上一天餵兩次的自動餵食器，錢從主缸的錢包出。回傳不能買的原因，買好了回傳 null。 */
export function buyFeeder(tanks: TankState[], index: number): string | null {
  const t = tanks[index];
  if (!t) return '找不到這缸';
  if (t.equipment.feeder) return '這缸已經有自動餵食器了';
  const cost = price('feeder:auto');
  if (!spend(tanks[0], cost)) return `錢不夠：要 ${cost} 元`;
  installFeeder(t, 2);
  return null;
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
