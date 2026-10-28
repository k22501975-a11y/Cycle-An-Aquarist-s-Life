import { isShrimpSpecies } from './species';
import type { TankState } from './state';

/**
 * 大窩生在小缸（polish-to-9.md §10 補充，企劃 2026-10-28 選 3）：一窩小魚比缸大很多時，
 * 小魚吃的、拉的讓有機物一兩天內暴增，KH 被吃光、pH 掉下來，硝化菌處理不了，氨一晚就衝上去（midgame-late 種子 2）。
 * 生之前早上報告先預告、生的那兩天任務卡叫玩家每天換三成水。
 */

/** 每公升幾尾以上就算「大窩」（20L 缸 10 尾、40L 缸 20 尾）。 */
export const BIG_BROOD_PER_L = 0.5;
/** 生完幾小時內算「生產那幾天」（任務卡每天叫換一次水）。 */
export const BROOD_WATER_HOURS = 48;

/** n 尾對這缸來說算不算大窩。 */
export const bigBrood = (t: TankState, n: number) => n >= t.equipment.tank.volumeL * BIG_BROOD_PER_L;

/**
 * 最近 BROOD_WATER_HOURS 內生在這缸的大窩、今天（遊戲日）還沒換過水：回傳幾尾、缸幾公升、是不是生的當天。
 * 沒有回 null。
 */
export function freshBigBrood(t: TankState): { n: number; liters: number; today: boolean } | null {
  const since = t.hours - BROOD_WATER_HOURS;
  const fry = t.fish.filter((f) => f.alive && (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && (f.bornHours ?? -Infinity) >= since);
  if (!bigBrood(t, fry.length)) return null;
  const day = (h: number) => Math.floor(h / 24);
  if (t.lastWaterChangeHours !== undefined && day(t.lastWaterChangeHours) === day(t.hours)) return null;
  const born = Math.min(...fry.map((f) => f.bornHours!));
  return { n: fry.length, liters: t.equipment.tank.volumeL, today: t.hours - born < 24 };
}
