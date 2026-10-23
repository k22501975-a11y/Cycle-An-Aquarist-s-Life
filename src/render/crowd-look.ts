/**
 * 缸太擠的畫面（midgame.md §7.1）：魚量到建議量的 80% 水開始有一點悶，幾尾魚待在上層；
 * 超過 100% 水變混、一大半的魚擠到水面張嘴喘氣（現實缺氧的樣子），水面一圈一圈的小漣漪。
 * crowdingRatio（sim）1 就是 100%。
 */

/** 開始看得出來（同 C14 的 CROWD_WARN）、太擠了。 */
export const CROWD_SHOWS = 0.8;
export const CROWD_FULL = 1;

export interface CrowdLook {
  /** 0 沒事、1 快滿了（≥80%）、2 太擠了（≥100%）。 */
  level: 0 | 1 | 2;
  /** 水裡那層灰綠混濁的濃度（0～0.22）。 */
  murk: number;
  /** 有幾成的魚擠到水面喘氣。 */
  gasp: number;
}

export function crowdLook(ratio: number): CrowdLook {
  if (!(ratio >= CROWD_SHOWS)) return { level: 0, murk: 0, gasp: 0 };
  if (ratio < CROWD_FULL) {
    const k = (ratio - CROWD_SHOWS) / (CROWD_FULL - CROWD_SHOWS);
    return { level: 1, murk: 0.08 * k, gasp: 0.15 * k };
  }
  const over = Math.min(1, (ratio - CROWD_FULL) / 0.3);
  return { level: 2, murk: 0.1 + 0.12 * over, gasp: 0.4 + 0.45 * over };
}

/** 這尾魚算不算在喘的那幾成：照編號固定挑，同一尾不會一下喘一下不喘。 */
export function gaspsAtSurface(fishId: number, share: number): boolean {
  return share > 0 && ((fishId * 0.618034) % 1) < share;
}
