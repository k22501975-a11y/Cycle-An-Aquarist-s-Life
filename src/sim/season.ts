/**
 * 季節與室溫（temperature.md §1）：季節跟著現實日曆走，不隨遊戲時間加速；
 * 室溫依地區、月份決定，冷氣房夏天固定在 26～27°C。
 */

export type Region = 'north' | 'central' | 'south';

export const REGION_LABELS: Record<Region, string> = { north: '台灣北部', central: '台灣中部', south: '台灣南部' };

/** 各月份（1～12 月）沒開冷氣的室內日平均溫度。北部依設計文件的表；中南部冬天較暖。 */
const MONTHLY_MEAN: Record<Region, number[]> = {
  north: [16, 16.5, 19.5, 22.5, 25.5, 27.5, 31.5, 31.5, 28.5, 26, 21.5, 17.5],
  central: [17, 17.5, 20.5, 23.5, 26.5, 28, 31.5, 31.5, 29, 26.5, 23, 19],
  south: [19, 20, 22.5, 25, 27.5, 28.5, 31, 31, 29.5, 27.5, 24.5, 21],
};

/** 日夜溫差（±°C）：春天和初冬溫差大。 */
const MONTHLY_SWING = [2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3];

/** 冷氣房夏天的室溫。 */
export const AIR_CONDITIONED_C = 26.5;

export interface RoomClimate {
  meanC: number;
  swingC: number;
}

/**
 * 某個時間點的室溫。
 * @param month 0～12 的小數月份（0 = 1 月 1 日、11.5 = 12 月中）。
 */
export function roomClimate(month: number, region: Region = 'north', airConditioned = false): RoomClimate {
  const table = MONTHLY_MEAN[region];
  // 表上的數字代表月中，前後線性內插
  const m = (((month - 0.5) % 12) + 12) % 12;
  const i = Math.floor(m);
  const t = m - i;
  const lerp = (arr: number[]) => arr[i] * (1 - t) + arr[(i + 1) % 12] * t;
  let meanC = lerp(table);
  let swingC = lerp(MONTHLY_SWING);
  if (airConditioned && meanC > AIR_CONDITIONED_C) {
    meanC = AIR_CONDITIONED_C;
    swingC = 0.5;
  }
  return { meanC: Math.round(meanC * 10) / 10, swingC };
}

/** 這個地區一年裡最冷的室溫（最冷那個月的平均減日夜溫差）：救急買的加熱棒要撐到這裡才算撐得過冬天。 */
export function coldestRoomC(region: Region = 'north'): number {
  return Math.min(...MONTHLY_MEAN[region].map((c, i) => c - MONTHLY_SWING[i]));
}

export function seasonName(month: number): string {
  const m = Math.floor((((month % 12) + 12) % 12)) + 1;
  if (m <= 2) return '冬天';
  if (m <= 4) return '春天';
  if (m <= 6) return '梅雨季';
  if (m <= 8) return '夏天';
  if (m <= 10) return '秋天';
  return '初冬';
}

/** 現實日期 → 小數月份。 */
export function monthOf(date: Date): number {
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getMonth() + (date.getDate() - 1 + date.getHours() / 24) / days;
}
