import { describe, expect, it } from 'vitest';
import { casualPlayer } from './serious-player';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * 一般玩家（遊戲性評測 g3）：不用產卵盒、不修剪、能賣就賣。只賣給店家 90 天才一兩百元；
 * 有看訂單板、交得出來就交的話，前期的中魚單就能帶來收入（M21）。
 * 驗收照 mvp.md §4.3 劇本驗收方式：三個種子的中位數達到門檻，每個種子都不低於門檻的 80%（單一種子的結果起伏大）。
 */
describe('經濟劇本：一般玩家 90 天，有沒有接訂單（g3）', () => {
  it('seed 7、42、99：接訂單第 90 天累計中位數 ≥450，每個種子都是只賣魚的 2 倍以上', () => {
    const sums = [7, 42, 99].map((seed) => {
      const sell = casualPlayer(seed, false);
      const take = casualPlayer(seed, true);
      const sum = take.income[90] + take.orders[90];
      expect(sum).toBeGreaterThan(sell.income[90] * 2);
      return sum;
    });
    expect(median(sums)).toBeGreaterThanOrEqual(450);
    for (const s of sums) expect(s).toBeGreaterThanOrEqual(450 * 0.8);
  }, 180_000);
});
