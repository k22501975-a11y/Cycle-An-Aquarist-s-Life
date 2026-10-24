import { describe, expect, it } from 'vitest';
import { strainFacts, strainRun } from './strain-fixing-run';

/**
 * 固定品系 300 天劇本（strain-fixing.md §3、§5、§7，#344、#351），種子 3，照推薦選。種子 1～3 各一個檔，平行跑。
 * - 開獎那窩就有白子紅蛇王（一鍵買的紅蛇王帶白子），第二代穩定度比第一代高
 * - C18 取名（40%）≤ 第 200 天至少 2 個種子（種子 1、3）；品系完成（75%）≤ 第 360 天至少 2 個種子（種子 2、3），兩條分開算（企劃 2026-10-24）
 * - 種魚不餓死（midgame.md §7.9）
 * - 第 80～200 天：懷孕期間相鄰的卡或里程碑 ≤ 7 天，其他 ≤ 6 天；一天最多一張
 * - 擠缸死魚 ≤ 2 尾；第 260 天金幣 ≥ 第 120 天 − 這段買缸花的一半（缸算半價的資產，§9），第 120～260 天隨時 ≥ 300
 * - 尾鰭：每個種子第一代到最新一代少 ≤ 20 分；中位數 ≤ 15（§6 第 3 點）：分檔平行跑算不了中位數，改成種子 1、3 ≤ 15、種子 2 ≤ 20，中位數就一定 ≤ 15
 */
describe('固定品系 300 天劇本（strain-fixing.md §7）', () => {
  it('種子 3', () => {
    const run = strainRun(3);
    const f = strainFacts(run);
    expect(f.revealDream, f.log).toBeGreaterThan(0);
    expect(f.gen2, f.log).toBeGreaterThan(f.gen1);
    expect(run.namedDay, f.log).toBeLessThanOrEqual(200);
    expect(run.doneDay, f.log).toBeLessThanOrEqual(360);
    expect(f.tailDrop, f.log).toBeLessThanOrEqual(15);
    expect(f.gaps, f.log).toEqual([]);
    expect(f.doubleCards, f.log).toEqual([]);
    expect(f.breederStarved, f.log).toBe(0);
    expect(f.crowdDeaths, f.log).toBeLessThanOrEqual(2);
    expect(f.coins260, f.log).toBeGreaterThanOrEqual(f.coins120 - f.tankSpend / 2);
    expect(f.minCoins, f.log).toBeGreaterThanOrEqual(300);
    expect(f.tailDrop, f.log).toBeLessThanOrEqual(20);
  }, 1_200_000);
});
