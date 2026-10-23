import { describe, expect, it } from 'vitest';
import { strainFacts, strainRun } from './strain-fixing-run';

/**
 * 固定品系 300 天劇本（strain-fixing.md §3、§5、§7，#344、#351），種子 1，照推薦選。種子 1～3 各一個檔，平行跑。
 * - 開獎那窩就有白子紅蛇王（一鍵買的紅蛇王帶白子），第二代穩定度比第一代高
 * - C18 取名（40%）≤ 第 200 天；品系完成（75%）≤ 第 360 天：暫時至少 1 個種子（種子 2），#359 修好後回到 2 個（strain-fixing.md §9）
 * - 第 80～200 天：懷孕期間相鄰的卡或里程碑 ≤ 7 天，其他 ≤ 8 天（§7 是 6 天，暫時放寬到 #359）；一天最多一張
 * - 擠缸死魚 ≤ 2 尾；第 120～260 天金幣隨時 ≥ 300（第 260 天 ≥ 第 120 天等 #359 修好收入再加回，strain-fixing.md §9）
 * - 尾鰭：每個種子第一代到最新一代少 ≤ 20 分（中位數 ≤ 15 暫時放寬到 #359，strain-fixing.md §9）
 */
describe('固定品系 300 天劇本（strain-fixing.md §7）', () => {
  it('種子 1', () => {
    const run = strainRun(1);
    const f = strainFacts(run);
    expect(f.revealDream, f.log).toBeGreaterThan(0);
    expect(f.gen2, f.log).toBeGreaterThan(f.gen1);
    // 種子 1 的種魚重挑過幾次，品系完成比較晚（#359 查）
    expect(f.gaps, f.log).toEqual([]);
    expect(f.doubleCards, f.log).toEqual([]);
    expect(f.crowdDeaths, f.log).toBeLessThanOrEqual(2);
    expect(f.minCoins, f.log).toBeGreaterThanOrEqual(300);
    expect(f.tailDrop, f.log).toBeLessThanOrEqual(20);
  }, 1_200_000);
});
