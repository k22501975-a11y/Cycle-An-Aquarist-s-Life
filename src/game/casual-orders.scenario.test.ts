import { describe, expect, it } from 'vitest';
import { casualPlayer } from './serious-player';

/**
 * 一般玩家（遊戲性評測 g3）：不用產卵盒、不修剪、能賣就賣。只賣給店家 90 天才一兩百元；
 * 有看訂單板、交得出來就交的話，前期的中魚單就能帶來收入（M21）。
 */
describe('經濟劇本：一般玩家 90 天，有沒有接訂單（g3）', () => {
  for (const seed of [7, 42, 99]) {
    it(`seed ${seed}：接訂單第 90 天累計 ≥450，是只賣魚的 2 倍以上`, () => {
      const sell = casualPlayer(seed, false);
      const take = casualPlayer(seed, true);
      const sum = take.income[90] + take.orders[90];
      expect(sum).toBeGreaterThanOrEqual(450);
      expect(sum).toBeGreaterThan(sell.income[90] * 2);
    }, 60_000);
  }
});
