import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { newTankCost } from '../sim';
import { seriousPlayer } from './serious-player';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** 驗收（mvp.md §4.3 劇本驗收方式）：seed 1～3 的中位數達到門檻，每個種子都不低於門檻的 80%。 */
function meets(values: number[], threshold: number): void {
  expect(median(values)).toBeGreaterThanOrEqual(threshold);
  for (const v of values) expect(v).toBeGreaterThanOrEqual(threshold * 0.8);
}

describe('經濟劇本：認真玩家養禮服 120 天，只賣魚（mvp.md §4.3）', () => {
  it('不靠賣魚第 21 天就買得起第二缸；賣魚收入第 60 天 ≥150、第 120 天 ≥900（seed 1～3 中位數），一路成長', () => {
    const runs = [1, 2, 3].map((seed) => seriousPlayer(seed, 3));
    const nano = newTankCost([newGameState(1)], 'nano20');
    for (const run of runs) {
      expect(run.coins21).toBeGreaterThanOrEqual(nano);
      expect(run.tanks).toBeGreaterThanOrEqual(2);
      expect(run.income[120]).toBeGreaterThan(run.income[60] * 3);
    }
    meets(runs.map((r) => r.income[60]), 150);
    meets(runs.map((r) => r.income[120]), 900);
  }, 360_000);
});
