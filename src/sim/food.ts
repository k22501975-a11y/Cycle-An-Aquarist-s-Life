import type { Water } from './state';

/**
 * 飼料（design/food.md）：放在哪一層決定誰吃得到，等級決定營養、發色、繁殖意願和髒不髒水。
 * 缸裡的飼料用「一批一批」記：同一種、同一等級的放在一起。water.foodMg 仍是總量，
 * 舊存檔或直接改總量的程式（換水虹吸）由 foodLots() 對回來。
 */

export type FoodKind = 'floating' | 'sinking' | 'sticky' | 'meat';
export type FoodGrade = 1 | 2 | 3 | 4;

export interface FoodLot {
  kind: FoodKind;
  grade: FoodGrade;
  mg: number;
}

export interface FoodKindSpec {
  name: string;
  hint: string;
  /** 沒被吃掉時每小時腐敗的比例：漂浮的沉下去才開始爛，黏缸壁的能放很久。 */
  spoilPerHour: number;
  /** 殘餌、糞便變成有機物的倍數（肉食蛋白質高，最髒）。 */
  dirt: number;
  /** 加在等級上的發色、繁殖意願（肉食讓魚準備繁殖）。 */
  color: number;
  breeding: number;
  /** 價錢倍數（跟同等級的漂浮飼料比）。 */
  price: number;
}

export const FOOD_KINDS: Record<FoodKind, FoodKindSpec> = {
  floating: { name: '漂浮', hint: '薄片、浮性顆粒，上中層的魚先搶', spoilPerHour: 0.35, dirt: 1, color: 0, breeding: 0, price: 1 },
  sinking: { name: '沉底', hint: '沉性顆粒、蝦飼料，直接落到底沙給蝦吃', spoilPerHour: 0.5, dirt: 1.1, color: 0, breeding: 0, price: 1 },
  sticky: { name: '黏缸壁', hint: '壓在前玻璃上慢慢散開，大家都會來啄', spoilPerHour: 0.08, dirt: 1, color: 0, breeding: 0, price: 1.5 },
  meat: { name: '肉食', hint: '冷凍紅蟲、豐年蝦，最愛吃也最髒水', spoilPerHour: 0.6, dirt: 1.35, color: 0.1, breeding: 0.25, price: 2 },
};

export interface FoodGradeSpec {
  name: string;
  /** 價錢倍數（標準 = 1）。 */
  price: number;
  /** 一口能填飽多少（填充物多的吃了也不太飽）。 */
  satiety: number;
  /** 長期營養的目標值 0–1（標準 0.5）。 */
  nutrition: number;
  /** 發色的目標值 0–1。 */
  color: number;
  /** 繁殖意願的目標值 0–1（標準 0.5）。 */
  breeding: number;
  /** 填充物比例：吃不完、排出來的都變髒。 */
  filler: number;
}

export const FOOD_GRADES: Record<FoodGrade, FoodGradeSpec> = {
  1: { name: '平價', price: 0.4, satiety: 0.85, nutrition: 0.3, color: 0, breeding: 0.3, filler: 0.5 },
  2: { name: '標準', price: 1, satiety: 1, nutrition: 0.5, color: 0.15, breeding: 0.5, filler: 0.3 },
  3: { name: '高級', price: 2.4, satiety: 1.1, nutrition: 0.75, color: 0.5, breeding: 0.7, filler: 0.15 },
  4: { name: '專業', price: 4.8, satiety: 1.15, nutrition: 0.9, color: 0.8, breeding: 0.85, filler: 0.12 },
};

/** 沒指定時的飼料：標準等級的漂浮薄片（最常見的）。 */
export const DEFAULT_FOOD: { kind: FoodKind; grade: FoodGrade } = { kind: 'floating', grade: 2 };

/** 舊存檔留下的殘餌當作沉在底沙的標準飼料。 */
const LEGACY_FOOD: { kind: FoodKind; grade: FoodGrade } = { kind: 'sinking', grade: 2 };

/** 缸裡的飼料，跟 foodMg 總量對齊後回傳（同一個陣列，可以直接改）。 */
export function foodLots(water: Water): FoodLot[] {
  const lots = (water.food ??= []);
  const sum = lots.reduce((s, l) => s + l.mg, 0);
  if (water.foodMg > sum + 1e-6) {
    const extra = water.foodMg - sum;
    const lot = lots.find((l) => l.kind === LEGACY_FOOD.kind && l.grade === LEGACY_FOOD.grade);
    if (lot) lot.mg += extra;
    else lots.push({ ...LEGACY_FOOD, mg: extra });
  } else if (water.foodMg < sum - 1e-6) {
    // 別的地方直接減了總量（換水虹吸），各批照比例少
    const k = sum > 0 ? Math.max(0, water.foodMg) / sum : 0;
    for (const l of lots) l.mg *= k;
  }
  pruneFood(water);
  return water.food!;
}

/** 拿掉吃完的批次，總量重算。 */
export function pruneFood(water: Water): void {
  water.food = (water.food ?? []).filter((l) => l.mg > 1e-3);
  water.foodMg = water.food.reduce((s, l) => s + l.mg, 0);
}

/** 投進一批飼料。 */
export function addFood(water: Water, kind: FoodKind, grade: FoodGrade, mg: number): void {
  if (mg <= 0) return;
  const lots = foodLots(water);
  const lot = lots.find((l) => l.kind === kind && l.grade === grade);
  if (lot) {
    lot.mg += mg;
    // 最新投的放最後，畫面用它決定撒下去的是什麼
    lots.splice(lots.indexOf(lot), 1);
    lots.push(lot);
  } else lots.push({ kind, grade, mg });
  water.foodMg += mg;
}

/** 一批飼料的品質（等級＋種類）。 */
export function foodQuality(lot: { kind: FoodKind; grade: FoodGrade }) {
  const g = FOOD_GRADES[lot.grade];
  const k = FOOD_KINDS[lot.kind];
  return {
    satiety: g.satiety,
    nutrition: g.nutrition,
    color: Math.min(1, g.color + k.color),
    breeding: Math.min(1, g.breeding + k.breeding),
    /** 1 mg 變成多少有機物（標準漂浮 = 1）。 */
    dirt: k.dirt * (0.7 + g.filler),
  };
}

/** 一餐的價錢倍數（標準漂浮 = 1）。 */
export function mealPrice(kind: FoodKind, grade: FoodGrade): number {
  return FOOD_KINDS[kind].price * FOOD_GRADES[grade].price;
}

/** 長期狀態的預設值：沒記錄的魚當作一直吃標準飼料。 */
export const DEFAULT_NUTRITION = 0.5;
export const DEFAULT_BREEDING_CONDITION = 0.5;

/** 營養對免疫力、成長的倍數（標準 = 1）。 */
export function nutritionFactor(nutrition: number | undefined): number {
  return 0.8 + 0.4 * (nutrition ?? DEFAULT_NUTRITION);
}

/** 繁殖意願對懷孕機率的倍數（標準 = 1）。 */
export function breedingFactor(condition: number | undefined): number {
  return 0.6 + 0.8 * (condition ?? DEFAULT_BREEDING_CONDITION);
}

/** 繁殖意願對一窩胎數的倍數（標準 = 1；孕期吃活餌、好飼料最多多一成半，midgame.md C13）。 */
export function broodFactor(condition: number | undefined): number {
  return 0.85 + 0.3 * (condition ?? DEFAULT_BREEDING_CONDITION);
}
