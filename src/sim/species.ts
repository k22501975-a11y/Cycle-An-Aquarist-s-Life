/**
 * 魚種與水草資料。數值是 Phase 0 的初版，之後會依真實資料再調整。
 */

export type FishSpeciesId = 'guppy' | 'zebrafish' | 'cherry_shrimp';

export interface FishSpecies {
  id: FishSpeciesId;
  name: string;
  /** 適溫範圍（°C）。超出越多，壓力越大。 */
  temp: { min: number; max: number };
  ph: { min: number; max: number };
  /** 成體體長（cm），用於「每公升 1 cm」的擁擠度估算。 */
  adultLengthCm: number;
  /** 濕重（mg），死亡腐爛時全部變成有機廢物。 */
  bodyMassMg: number;
  /** 每日食量（mg 飼料）。 */
  dailyFoodMg: number;
  /** 每小時耗氧（mg）。 */
  o2UseMgPerHour: number;
  /** 體質 0–1：基礎免疫力，也決定對毒素的耐受度。 */
  hardiness: number;
  /** 群游魚的最少數量；不足時持續有壓力。0 表示不需群游。 */
  minGroup: number;
  /** 是否會得白點病（蝦不會）。 */
  susceptibleToIch: boolean;
  /** 對藥物（如白點藥）是否敏感（無脊椎動物通常很敏感）。 */
  medicationSensitive: boolean;
  /** 剛出生的體長（cm）。 */
  birthLengthCm: number;
  /** 從出生長到成體（約九成體長）的天數。 */
  daysToAdult: number;
  /** 嘴巴大小 ÷ 體長：體長 × 此值以下的小生物吃得下。0 表示不吃活物。 */
  mouthRatio: number;
  /** 幼體在掠食者身邊、沒有躲藏處時，每天被吃掉的機率（剛出生時）。 */
  juvenilePredationPerDay: number;
  /** 咬鰭傾向（每尾長鰭魚每天被咬的基礎機率）。0 表示不咬鰭。 */
  finNipPerDay: number;
  /** 公魚是否有長鰭（咬鰭魚的目標）。 */
  longFinnedMales: boolean;
  /** Phase 0 的簡化繁殖（只為了讓仔魚、仔蝦出現；遺傳在 Phase 1）。 */
  breeding: { gestationDays: number; broodMean: number; broodMin: number; broodMax: number } | null;
}

export const FISH_SPECIES: Record<FishSpeciesId, FishSpecies> = {
  guppy: {
    id: 'guppy',
    name: '孔雀魚',
    temp: { min: 22, max: 28 },
    ph: { min: 6.8, max: 8.0 },
    adultLengthCm: 4,
    bodyMassMg: 500,
    dailyFoodMg: 15,
    o2UseMgPerHour: 0.15,
    hardiness: 0.7,
    minGroup: 0,
    susceptibleToIch: true,
    medicationSensitive: false,
    birthLengthCm: 0.7,
    daysToAdult: 60,
    mouthRatio: 0.4,
    juvenilePredationPerDay: 0.25,
    finNipPerDay: 0,
    longFinnedMales: true,
    // 卵胎生：母魚約 4 週生一胎，每胎約 20 尾。
    breeding: { gestationDays: 28, broodMean: 20, broodMin: 4, broodMax: 40 },
  },
  zebrafish: {
    id: 'zebrafish',
    name: '斑馬魚',
    temp: { min: 18, max: 26 },
    ph: { min: 6.5, max: 7.8 },
    adultLengthCm: 4,
    bodyMassMg: 600,
    dailyFoodMg: 18,
    o2UseMgPerHour: 0.18,
    hardiness: 0.8,
    minGroup: 6,
    susceptibleToIch: true,
    medicationSensitive: false,
    birthLengthCm: 0.4,
    daysToAdult: 75,
    mouthRatio: 0.4,
    juvenilePredationPerDay: 0.25,
    // 輕微咬鰭：只針對長鰭魚，群游數量不足時加倍。
    finNipPerDay: 0.08,
    longFinnedMales: false,
    // 斑馬魚撒卵且吃卵很兇，Phase 0 先不做（需要產卵盒）。
    breeding: null,
  },
  cherry_shrimp: {
    id: 'cherry_shrimp',
    name: '櫻花蝦',
    temp: { min: 18, max: 28 },
    ph: { min: 6.5, max: 8.0 },
    adultLengthCm: 2,
    bodyMassMg: 150,
    dailyFoodMg: 2,
    o2UseMgPerHour: 0.03,
    hardiness: 0.5,
    minGroup: 0,
    susceptibleToIch: false,
    medicationSensitive: true,
    birthLengthCm: 0.15,
    daysToAdult: 50,
    mouthRatio: 0,
    juvenilePredationPerDay: 0.15,
    finNipPerDay: 0,
    longFinnedMales: false,
    // 抱卵約 30 天，孵出 10–30 隻仔蝦。
    breeding: { gestationDays: 30, broodMean: 20, broodMin: 5, broodMax: 30 },
  },
};

export type PlantSpeciesId = 'anubias' | 'rotala';

export interface PlantSpecies {
  id: PlantSpeciesId;
  name: string;
  /** 陰性草（低光）或陽性草（高光）。 */
  lightType: 'low' | 'high';
  /** 光照達到此 PAR 時光合作用飽和。 */
  lightSaturationPar: number;
  /** 光照超過此 PAR 而生長跟不上時，葉面開始長藻。 */
  lightTolerancePar: number;
  /** 低於此 PAR 時光合作用抵不過呼吸作用，會逐漸溶葉。 */
  compensationPar: number;
  /** 需要多少 CO₂（mg/L）才能長到全速。陰性草只需空氣中的量。 */
  co2HalfSaturation: number;
  /** 最大生長率（每小時生物量增加比例）。 */
  maxGrowthPerHour: number;
  /** 每株最大生物量（g），超過才能修剪出插枝。 */
  maxBiomassG: number;
  /** 一份插枝的重量（g）。 */
  cuttingMassG: number;
}

export const PLANT_SPECIES: Record<PlantSpeciesId, PlantSpecies> = {
  anubias: {
    id: 'anubias',
    name: '榕',
    lightType: 'low',
    lightSaturationPar: 30,
    lightTolerancePar: 70,
    compensationPar: 8,
    co2HalfSaturation: 0.3,
    maxGrowthPerHour: 0.0015,
    maxBiomassG: 20,
    cuttingMassG: 4,
  },
  rotala: {
    id: 'rotala',
    name: '紅蝴蝶',
    lightType: 'high',
    lightSaturationPar: 110,
    lightTolerancePar: 300,
    compensationPar: 50,
    co2HalfSaturation: 6,
    maxGrowthPerHour: 0.015,
    maxBiomassG: 15,
    cuttingMassG: 1,
  },
};
