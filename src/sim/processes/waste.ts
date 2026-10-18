import { temperatureFactor } from '../chemistry';
import { FOOD_KINDS, foodLots, foodQuality, pruneFood } from '../food';
import type { TankState } from '../state';

/** 有機物中的氮含量：分解時以氨氮（TAN）形式釋出。 */
const NITROGEN_FRACTION = 0.04;
/** 分解 1 mg 有機物的耗氧量（mg）。實際 BOD 約 1，但部分在底砂、濾材中分解，不全算在水中。 */
const O2_PER_MG_ORGANIC = 0.3;
/** 有機物在 25°C 下每小時分解的比例。 */
const DECOMPOSITION_PER_HOUR = 0.03;
/** 屍體每小時腐爛的比例。 */
const CORPSE_DECAY_PER_HOUR = 0.02;

export function updateWaste(state: TankState, dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  const tf = temperatureFactor(water.tempC);

  // 各種飼料爛的速度不同（黏缸壁的放很久），平價的填充物多、肉食蛋白質高，爛了更髒
  for (const lot of foodLots(water)) {
    const spoiled = lot.mg * (1 - Math.exp(-FOOD_KINDS[lot.kind].spoilPerHour * dt));
    lot.mg -= spoiled;
    water.organicMg += spoiled * foodQuality(lot).dirt;
  }
  pruneFood(water);

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
