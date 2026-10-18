import { temperatureFactor } from '../chemistry';
import type { TankState } from '../state';

/** 有機物中的氮含量：分解時以氨氮（TAN）形式釋出。 */
const NITROGEN_FRACTION = 0.04;
/** 分解 1 mg 有機物的耗氧量（mg）。實際 BOD 約 1，但部分在底砂、濾材中分解，不全算在水中。 */
const O2_PER_MG_ORGANIC = 0.3;
/** 有機物在 25°C 下每小時分解的比例。 */
const DECOMPOSITION_PER_HOUR = 0.03;
/** 沒被吃掉的飼料沉底後，每小時轉成腐敗有機物的比例。 */
const FOOD_SPOIL_PER_HOUR = 0.5;
/** 屍體每小時腐爛的比例。 */
const CORPSE_DECAY_PER_HOUR = 0.02;

export function updateWaste(state: TankState, dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  const tf = temperatureFactor(water.tempC);

  const spoiled = water.foodMg * (1 - Math.exp(-FOOD_SPOIL_PER_HOUR * dt));
  water.foodMg -= spoiled;
  water.organicMg += spoiled;

  // 死魚沒撈出來，會持續腐爛成大量有機廢物 → 氨。
  for (const fish of state.fish) {
    if (fish.alive || fish.corpseMg <= 0) continue;
    const decayed = fish.corpseMg * (1 - Math.exp(-CORPSE_DECAY_PER_HOUR * tf * dt));
    fish.corpseMg -= decayed;
    water.organicMg += decayed;
  }

  const decomposed = water.organicMg * (1 - Math.exp(-DECOMPOSITION_PER_HOUR * tf * dt));
  water.organicMg -= decomposed;
  water.tan += (decomposed * NITROGEN_FRACTION) / volume;
  water.o2 = Math.max(0, water.o2 - (decomposed * O2_PER_MG_ORGANIC) / volume);
  water.co2 += (decomposed * O2_PER_MG_ORGANIC * 1.375) / volume;
}
