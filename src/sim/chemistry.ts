/**
 * 水化學公式。全部是純函式，單位：濃度 mg/L、溫度 °C、KH 為 dKH。
 */

/** 總氨（TAN）中有毒的游離氨 NH₃ 所佔比例。pH 與溫度越高，毒性越強（Emerson et al., 1975）。 */
export function freeAmmoniaFraction(pH: number, tempC: number): number {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15);
  return 1 / (Math.pow(10, pKa - pH) + 1);
}

/** 淡水在一大氣壓下的飽和溶氧（mg/L）。水溫越高，溶氧越低。 */
export function oxygenSaturation(tempC: number): number {
  const t = tempC;
  return 14.62 - 0.3898 * t + 0.006969 * t * t - 0.00005897 * t * t * t;
}

/** 與空氣平衡時的溶解 CO₂（mg/L），約 0.5–1 mg/L。 */
export function co2Equilibrium(tempC: number): number {
  return 0.9 - 0.012 * tempC;
}

/**
 * 由 KH 與 CO₂ 推算 pH（水族界常用的 KH/pH/CO₂ 關係：CO₂ = 3 × KH × 10^(7−pH)）。
 * KH 越低，同樣的 CO₂ 讓 pH 掉得越多。
 */
export function phFromCo2(khDegrees: number, co2MgL: number): number {
  const kh = Math.max(khDegrees, 0.05);
  const co2 = Math.max(co2MgL, 0.05);
  return clamp(7 + Math.log10((3 * kh) / co2), 4, 9.5);
}

/** 硝化作用每氧化 1 mg 氨氮消耗約 7.14 mg CaCO₃ 的鹼度；1 dKH = 17.86 mg/L CaCO₃。 */
export const KH_CONSUMED_PER_MG_TAN = 7.14 / 17.86;

/** 每氧化 1 mg 氨氮約耗氧 4.57 mg（亞硝化 3.43 + 硝化 1.14）。 */
export const O2_PER_MG_TAN_TO_NO2 = 3.43;
export const O2_PER_MG_NO2_TO_NO3 = 1.14;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 生物反應速率的溫度係數（Q10 ≈ 2，以 25°C 為 1）。 */
export function temperatureFactor(tempC: number): number {
  return Math.pow(2, (tempC - 25) / 10);
}
