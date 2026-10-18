import { FISH_SPECIES } from './species';
import { ELDERLY_FRACTION, freeAmmonia, immunity, lifeFraction } from './processes/fauna';
import { hasVisible } from './processes/disease';
import type { Fish, TankState } from './state';

/**
 * 測試劑讀數：和真實試劑一樣只能讀到色卡上的級距，不是精確數值。
 */
export interface TestKitReading {
  ammonia: number;
  nitrite: number;
  nitrate: number;
  ph: number;
  kh: number;
}

const AMMONIA_SCALE = [0, 0.25, 0.5, 1, 2, 4, 8];
const NITRITE_SCALE = [0, 0.25, 0.5, 1, 2, 5];
const NITRATE_SCALE = [0, 5, 10, 20, 40, 80, 160];
const PH_SCALE = [6.0, 6.4, 6.6, 6.8, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.8];

function nearest(scale: number[], value: number): number {
  return scale.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), scale[0]);
}

export function testWater(state: TankState): TestKitReading {
  const w = state.water;
  return {
    ammonia: nearest(AMMONIA_SCALE, w.tan),
    nitrite: nearest(NITRITE_SCALE, w.no2),
    nitrate: nearest(NITRATE_SCALE, w.no3),
    ph: nearest(PH_SCALE, w.ph),
    kh: Math.round(w.kh),
  };
}

export type Symptom =
  | 'hiding'
  | 'clamped_fins'
  | 'not_eating'
  | 'gasping'
  | 'flashing'
  | 'white_spots'
  | 'lethargic'
  | 'loss_of_balance'
  | 'thin'
  | 'torn_fins'
  | 'pregnant'
  | 'elderly'
  | 'white_patches'
  | 'gill_flare';

/**
 * 玩家能「看到」的症狀。分成早期行為異常、中期外觀變化、晚期瀕死，
 * 玩家要從症狀反推原因（設計文件 5.6）。
 */
export function observeSymptoms(state: TankState, fish: Fish): Symptom[] {
  if (!fish.alive) return [];
  const w = state.water;
  const out: Symptom[] = [];
  if (fish.stress > 0.4) out.push('hiding');
  if (fish.stress > 0.5) out.push('clamped_fins');
  if (fish.stress > 0.6) out.push('not_eating');
  // 鰓吸蟲也會浮頭喘氣，很容易誤以為是缺氧
  if (w.o2 < 3.5 || freeAmmonia(state) > 0.05 || w.co2 > 35 || hasVisible(fish, 'flukes')) out.push('gasping');
  if ((fish.ich.stage === 'incubating' && fish.ich.progress > 0.5) || freeAmmonia(state) > 0.03) out.push('flashing');
  if (fish.ich.stage === 'visible') out.push('white_spots');
  if (fish.health < 0.5) out.push('lethargic');
  if (fish.health < 0.15) out.push('loss_of_balance');
  if (fish.starvingHours > 48) out.push('thin');
  if (fish.finDamage > 0.15) out.push('torn_fins');
  if (fish.pregnancy > 0.5) out.push('pregnant');
  if (lifeFraction(fish) > ELDERLY_FRACTION + 0.05) out.push('elderly');
  if (hasVisible(fish, 'columnaris')) out.push('white_patches');
  if (hasVisible(fish, 'flukes')) out.push('gill_flare');
  return out;
}

/** 開發與除錯用：魚的內部狀態（玩家看不到）。 */
export function inspectFish(fish: Fish) {
  return { ...fish, immunity: immunity(fish, FISH_SPECIES[fish.species]) };
}
