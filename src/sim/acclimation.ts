import { waterGh } from './growth';
import { FISH_SPECIES, type FishSpeciesId } from './species';
import type { Fish, TankState } from './state';

/**
 * 水質適應（design/acclimation.md）：魚怕的不是 pH 6.5，而是突然從 7.8 變成 6.5。
 * 每尾魚有自己習慣的水（舒適中心），會慢慢往牠住的水移動；壓力看離舒適中心多遠，
 * 超出物種的存活範圍才是真的撐不住。新魚直接倒進差很多的水會休克，慢慢滴水對水就沒事。
 */

export interface WaterHabit {
  ph: number;
  gh: number;
  tempC: number;
}

/** 每遊戲天往目前的水移動多少（pH 0.05、GH 0.3、水溫 0.3°C）：一兩週就能適應一個 pH 單位的一半。 */
export const ACCLIMATION_PER_DAY: WaterHabit = { ph: 0.05, gh: 0.3, tempC: 0.3 };
/** 離習慣的水差這麼多以內不會緊迫。 */
export const COMFORT_BAND: WaterHabit = { ph: 0.5, gh: 4, tempC: 2 };

/** 店裡買來的魚習慣的水：魚場的水質、店裡的水溫。 */
export function farmHabit(species: FishSpeciesId): WaterHabit {
  const w = FISH_SPECIES[species].farmWater;
  return { ph: w.ph, gh: w.gh, tempC: 26 };
}

/** 這缸近期的水（剛出生的魚就習慣這個）。 */
export function tankHabit(state: TankState): WaterHabit {
  return { ph: state.water.phAvg, gh: waterGh(state), tempC: state.water.tempAvgC };
}

/** 這尾魚習慣的水；舊存檔沒有，當成已經習慣了目前的缸。 */
export function habitOf(state: TankState, fish: Fish): WaterHabit {
  return fish.acclimated ?? tankHabit(state);
}

/** 每小時把舒適中心往這缸的水推一點，但推不出物種的存活範圍。 */
export function driftAcclimation(state: TankState, fish: Fish, dt: number): void {
  const now = tankHabit(state);
  const h = (fish.acclimated ??= { ...now });
  const step = (from: number, to: number, perDay: number) => from + Math.max(-perDay * (dt / 24), Math.min(perDay * (dt / 24), to - from));
  const r = FISH_SPECIES[fish.species].phSurvive;
  h.ph = Math.min(r.max, Math.max(r.min, step(h.ph, now.ph, ACCLIMATION_PER_DAY.ph)));
  h.gh = step(h.gh, now.gh, ACCLIMATION_PER_DAY.gh);
  h.tempC = step(h.tempC, now.tempC, ACCLIMATION_PER_DAY.tempC);
}

/** 目前的水跟這尾魚習慣的差多少（正負都有）。 */
export function habitGap(state: TankState, fish: Fish): WaterHabit {
  const h = habitOf(state, fish);
  return { ph: state.water.ph - h.ph, gh: waterGh(state) - h.gh, tempC: state.water.tempC - h.tempC };
}

/** 離舒適中心太遠造成的壓力（不含突然變化，那個另外算）。 */
export function habitStress(state: TankState, fish: Fish): number {
  const g = habitGap(state, fish);
  return Math.max(0, Math.abs(g.ph) - COMFORT_BAND.ph) / 0.8 + Math.max(0, Math.abs(g.gh) - COMFORT_BAND.gh) / 10;
}

/** 超出存活範圍多少 pH（0 表示在範圍內）。 */
export function phBeyondSurvival(state: TankState, fish: Fish): number {
  const r = FISH_SPECIES[fish.species].phSurvive;
  return Math.max(0, r.min - state.water.ph, state.water.ph - r.max);
}

/**
 * 新魚放進缸：直接倒進去的話，袋子裡的水跟缸水差越多越休克（壓力暴衝，差太多會受傷甚至當場死掉）；
 * 慢慢滴水對水就只有搬家的一點緊迫。回傳要加的壓力和健康損失。
 */
export function releaseShock(state: TankState, from: WaterHabit, drip: boolean): { stress: number; harm: number } {
  if (drip) return { stress: 0, harm: 0 };
  const dPh = Math.abs(from.ph - state.water.ph);
  const dT = Math.abs(from.tempC - state.water.tempC);
  const dGh = Math.abs(from.gh - waterGh(state));
  const stress = Math.min(0.6, dT * 0.08 + dPh * 0.3 + dGh * 0.02);
  // pH 差超過 1、水溫差超過 4 度才會真的受傷
  const harm = Math.max(0, dPh - 1) * 0.5 + Math.max(0, dT - 4) * 0.1;
  return { stress, harm };
}

/** 建議滴水對水多久（分鐘）：差越多越久。 */
export function dripMinutes(state: TankState, from: WaterHabit): number {
  const dPh = Math.abs(from.ph - state.water.ph);
  const dT = Math.abs(from.tempC - state.water.tempC);
  return Math.round(Math.min(90, 20 + dPh * 40 + dT * 5) / 5) * 5;
}
