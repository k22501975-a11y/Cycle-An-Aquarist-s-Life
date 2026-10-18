/**
 * 可序列化的種子亂數（mulberry32）。
 * 狀態只是一個整數，存在 TankState 裡，存檔、讀檔、伺服器重算都能得到相同結果。
 */
export interface RngState {
  seed: number;
}

export function nextRandom(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) | 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 在 dtHours 內以每小時 ratePerHour 的機率發生（Poisson 近似）。 */
export function chance(rng: RngState, ratePerHour: number, dtHours: number): boolean {
  if (ratePerHour <= 0) return false;
  return nextRandom(rng) < 1 - Math.exp(-ratePerHour * dtHours);
}
