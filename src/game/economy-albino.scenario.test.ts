import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { newTankCost } from '../sim';
import { seriousPlayer } from './serious-player';

describe('經濟劇本：認真玩家養白子全紅 120 天，只賣魚（mvp.md §4.3）', () => {
  it('不靠賣魚第 21 天就買得起第二缸；賣魚收入第 60 天 ≥150、第 120 天 ≥900，一路成長', () => {
    const run = seriousPlayer(1, 2);
    expect(run.coins21).toBeGreaterThanOrEqual(newTankCost([newGameState(1)], 'nano20'));
    expect(run.tanks).toBeGreaterThanOrEqual(2);
    expect(run.income[60]).toBeGreaterThanOrEqual(150);
    expect(run.income[120]).toBeGreaterThanOrEqual(900);
    expect(run.income[120]).toBeGreaterThan(run.income[60] * 3);
  }, 120_000);
});
