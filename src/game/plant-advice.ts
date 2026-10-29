import { buyPlant, DENSE_COVER, economy, matureCover, PLANT_PRICES, reserveShort, sellTub, spend, trimToCover, type TankState } from '../sim';

/**
 * 劇本玩家照早上報告的水草提示做（polish-to-9.md §13.5，架構同意：跟照報告買自動餵食器同一種量法）：
 * 「種水草 ›」就買莫絲小苗，買到長成後夠密（≥ DENSE_COVER），照 §11 買完手上要剩 BUY_RESERVE（reserveShort）；「修剪 ›」就剪回約 65%。
 * 錢、插枝都照實算。
 */

/** 照「種水草 ›」補莫絲：回傳買了幾株。 */
export function plantUp(tanks: TankState[], tank: number): number {
  const t = tanks[tank];
  if (!t) return 0;
  const home = tanks[0];
  let n = 0;
  while (matureCover(t) < DENSE_COVER && reserveShort(economy(home).coins, PLANT_PRICES.moss) === 0 && spend(home, PLANT_PRICES.moss)) {
    buyPlant(t, 'moss');
    n++;
  }
  return n;
}

/** 照「修剪 ›」剪回約 65%：回傳剪下幾段插枝（沒長太密是 0）。 */
export function trimDense(tanks: TankState[], tank: number): number {
  const t = tanks[tank];
  return t ? (trimToCover(t)?.cuttings ?? 0) : 0;
}

/** 早上報告的每一行：有水草提示的照著做；收納箱的小魚長到能賣就撈出來賣（§13.7）。 */
export function followPlantAdvice(tanks: TankState[], items: ReadonlyArray<{ action?: string; tank: number }>): void {
  for (const i of items) {
    if (i.action === 'shop_plants') plantUp(tanks, i.tank);
    else if (i.action === 'trim_dense') trimDense(tanks, i.tank);
    else if (i.action === 'sell_tub') sellTub(tanks, i.tank);
  }
}
