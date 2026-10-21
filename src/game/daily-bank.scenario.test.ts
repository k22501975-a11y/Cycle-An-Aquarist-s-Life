import { describe, expect, it } from 'vitest';
import { doAllDaily, everythingTank } from './daily-player';
import { CHEST_CAP_DAY, CHEST_COINS_CAP, claimDaily, DAILY_CATEGORY, DAILY_GAP_DAYS, DAILY_IDS, dailyTasks, economy, simulate, type DailyTaskId } from '../sim';

/** 每日小事題庫驗收（polish-to-9.md U6）：劇本跑 30 天，統計每題出現次數，同題間隔 ≥ 3 天。 */
describe('每日小事題庫劇本（U6）', () => {
  it('seed 1～3 跑 30 天：同一題間隔至少 3 天，每天都有題目，四類都出過', () => {
    for (const seed of [1, 2, 3]) {
      const s = everythingTank(seed);
      const tanks = [s];
      const seen = new Map<DailyTaskId, number[]>();
      for (let d = 0; d < 30; d++) {
        simulate(s, 24);
        // 每天補回會被做掉的條件（螺卵、死螺、母魚快生、水位），讓題庫一直夠大
        s.snails!.clutches.push({ id: 100 + d, hour: s.hours, eggs: 80, color: 'gold' });
        s.snails!.snails.push({ id: 100 + d, kind: 'apple', alive: false, hunger: 0, ageDays: 30 } as never);
        s.snails!.pests.bladder = Math.max(s.snails!.pests.bladder, 20);
        economy(s).cuttings.moss = 2;
        doAllDaily(tanks);
        const today = dailyTasks(tanks)!;
        expect(today.tasks.length, `seed ${seed} 第 ${d} 天`).toBeGreaterThan(0);
        for (const t of today.tasks) seen.set(t.id, [...(seen.get(t.id) ?? []), today.day]);
        claimDaily(tanks);
      }
      for (const [id, days] of seen) for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1], `seed ${seed} ${id} ${days.join(',')}`).toBeGreaterThanOrEqual(DAILY_GAP_DAYS);
      expect(new Set([...seen.keys()].map((id) => DAILY_CATEGORY[id])).size).toBe(4);
      expect(seen.size, [...seen.keys()].join(',')).toBeGreaterThanOrEqual(12);
      expect(DAILY_IDS.length).toBeGreaterThanOrEqual(20);
    }
  }, 60_000);

  it(`寶箱魚幣（polish-to-9.md §4）：seed 1～3 每天開寶箱到第 ${CHEST_CAP_DAY} 天，魚幣累計的中位數 ≤ ${CHEST_COINS_CAP}`, () => {
    const totals: number[] = [];
    for (const seed of [1, 2, 3]) {
      const s = everythingTank(seed);
      const tanks = [s];
      let coins = 0;
      // 算到遊戲裡的第 60 天（含）
      while (Math.floor((s.hours + 24) / 24) <= CHEST_CAP_DAY) {
        const d = Math.floor(s.hours / 24);
        simulate(s, 24);
        s.snails!.clutches.push({ id: 100 + d, hour: s.hours, eggs: 80, color: 'gold' });
        s.snails!.pests.bladder = Math.max(s.snails!.pests.bladder, 20);
        doAllDaily(tanks);
        coins += claimDaily(tanks)?.coins ?? 0;
      }
      expect(economy(s).chestCoins ?? 0).toBe(coins);
      totals.push(coins);
    }
    const median = [...totals].sort((a, b) => a - b)[1];
    console.log(`寶箱魚幣到第 ${CHEST_CAP_DAY} 天：seed 1～3 = ${totals.join('、')}，中位數 ${median}`);
    expect(median).toBeLessThanOrEqual(CHEST_COINS_CAP);
    for (const c of totals) expect(c).toBeLessThanOrEqual(CHEST_COINS_CAP);
  }, 120_000);
});
