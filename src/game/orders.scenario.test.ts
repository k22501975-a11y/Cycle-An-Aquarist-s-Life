import { describe, expect, it } from 'vitest';
import { type TankState } from '../sim';
import { takeChoice } from '../sim/choices';
import { chooseRecommended } from './midgame-player';
import { seriousPlayer } from './serious-player';

/** 早上出選擇卡就照推薦選（midgame.md C1～C5：保留第一窩、留種、C5 交單都會跑到）。 */
const followChoices = (tanks: TankState[]) => {
  const card = takeChoice(tanks);
  if (card) chooseRecommended(tanks, card);
};

/** 企劃定的感受目標：賣魚加訂單第 60 天 ≥800、第 120 天 ≥3,000（mvp.md §4.3）。 */
function check(strain: number, choices = false): void {
  const run = seriousPlayer(1, strain, true, choices ? { onDay: followChoices } : {});
  const sum = (d: number) => run.income[d] + run.orders[d];
  expect(sum(60)).toBeGreaterThanOrEqual(800);
  expect(sum(120)).toBeGreaterThanOrEqual(3000);
}

describe('經濟劇本：認真玩家 120 天、有接訂單（M21）', () => {
  it('養禮服', () => check(3), 120_000);
  it('養全紅白子', () => check(2), 120_000);
  it('養禮服，早上的選擇卡照推薦選', () => check(3, true), 120_000);
  it('養全紅白子，早上的選擇卡照推薦選', () => check(2, true), 120_000);
  // 擠缸改了之後最接近門檻的一組（midgame.md §7.7）：之後的改動要守住離 §4.3 門檻至少還有 300 元
  it('養全紅白子、種子 3，照推薦選：第 120 天離門檻至少還有 300 元', () => {
    const run = seriousPlayer(3, 2, true, { onDay: followChoices });
    expect(run.income[120] + run.orders[120]).toBeGreaterThanOrEqual(3000 + 300);
  }, 120_000);
});
