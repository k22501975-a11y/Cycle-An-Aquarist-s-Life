import { FISH_SPECIES } from './species';
import { ELDERLY_FRACTION, freeAmmonia, immunity, lifeFraction, likelyCauses } from './processes/fauna';
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

export const AMMONIA_SCALE = [0, 0.25, 0.5, 1, 2, 4, 8];
export const NITRITE_SCALE = [0, 0.25, 0.5, 1, 2, 5];
const NITRATE_SCALE = [0, 5, 10, 20, 40, 80, 160];
const PH_SCALE = [6.0, 6.4, 6.6, 6.8, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.8];

export function nearest(scale: number[], value: number): number {
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

/** 測試劑讀到這個數字（mg/L）就算有問題：換水是在解決量得到的問題。 */
export const MEASURED_PROBLEM_LEVEL = 0.25;

/**
 * 現在測水會量到的問題（照測試劑色卡讀數，不是精確數值）：氨優先，其次亞硝酸，都沒有就是 null。
 * 教學、每日任務用來判斷「換水」是不是在解決一個量得到的問題。
 */
export function measuredProblem(state: TankState): 'ammonia' | 'nitrite' | null {
  const r = testWater(state);
  if (r.ammonia >= MEASURED_PROBLEM_LEVEL) return 'ammonia';
  if (r.nitrite >= MEASURED_PROBLEM_LEVEL) return 'nitrite';
  return null;
}

/** 換水的兩個常用量：一般三成、水變差時大換一半（換水面板的預設鈕也是這兩個）。 */
export const NORMAL_WATER_CHANGE = 0.3;
export const BIG_WATER_CHANGE = 0.5;

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
  | 'gill_flare'
  | 'begging';

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
  if (fish.hunger > HUNGRY && fish.stress <= 0.6) out.push('begging');
  if (fish.starvingHours > 48) out.push('thin');
  if (fish.finDamage > 0.15) out.push('torn_fins');
  if (fish.pregnancy > 0.5) out.push('pregnant');
  if (lifeFraction(fish) > ELDERLY_FRACTION + 0.05) out.push('elderly');
  if (hasVisible(fish, 'columnaris')) out.push('white_patches');
  if (hasVisible(fish, 'flukes')) out.push('gill_flare');
  return out;
}

/**
 * 飢餓值超過這個就算「餓了」：會在水面巡游討食，待辦提醒餵食。畫面、待辦都讀這個值。
 * 照教學一天一兩次「一小撮」都不會到（一次停在約 0.62，design/mvp.md §4.6）；不餵三、四天就會到。
 */
export const HUNGRY = 0.65;
/** 「一小撮」是一餐的幾倍（新缸期的維持量）。 */
export const PINCH_MEALS = 0.85;

export type HungerLevel = 'full' | 'fed' | 'hungry' | 'starving';

/** 飢餓的四個等級，給點魚的資訊、肚子扁不扁的畫法用。 */
export function hungerLevel(fish: Fish): HungerLevel {
  if (fish.hunger >= 1) return 'starving';
  if (fish.hunger > HUNGRY) return 'hungry';
  if (fish.hunger > 0.25) return 'fed';
  return 'full';
}

/**
 * 玩家看得到的魚況（點魚的資訊卡、老闆提醒用）：飢餓程度、健康、生病的可能原因。
 * hunger、health 是 0～1（1 是最餓／最健康）；causes 由主要到次要。
 */
export function fishCondition(state: TankState, fish: Fish) {
  return {
    hunger: hungerLevel(fish),
    hungerValue: fish.hunger,
    health: fish.health,
    stress: fish.stress,
    causes: fish.alive ? likelyCauses(state, fish) : [],
  };
}

/** 開發與除錯用：魚的內部狀態（玩家看不到）。 */
export function inspectFish(fish: Fish) {
  return { ...fish, immunity: immunity(fish, FISH_SPECIES[fish.species]) };
}
