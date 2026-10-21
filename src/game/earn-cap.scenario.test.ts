import { describe, expect, it } from 'vitest';
import { earnCap, economy, type TankState } from '../sim';
import { seriousPlayer } from './serious-player';

/**
 * 錢的範圍檢查（L2，#76）不能擋到正常玩家：認真玩家 120 天（賣魚、交單、修剪插枝、加缸、目標獎勵），
 * 每天、每 7 天、每 30 天上傳一次，多出來的錢都在 earnCap 以內；把錢改大就會超出。
 */

const snap = (tanks: TankState[]): TankState[] => JSON.parse(JSON.stringify(tanks)) as TankState[];

describe('錢的範圍檢查（L2，#76）', () => {
  for (const strain of [2, 3]) {
    it(`認真玩家 120 天（品系 ${strain}）：每天、每週、每月上傳都不會被擋`, () => {
      const days: TankState[][] = [];
      seriousPlayer(1, strain, true, { onDay: (tanks) => days.push(snap(tanks)) });
      // 腳本在第 10 天直接加 800 代替新手任務獎勵（遊戲裡是一個一個任務領，會記在 questRewards），這段不算
      const bonus = (a: number, b: number) => (a < 9 && b >= 9 ? 800 : 0);
      let tightest = Infinity;
      for (const step of [1, 7, 30]) {
        for (let a = 0; a + step < days.length; a += step) {
          const b = a + step;
          const gained = economy(days[b][0]).coins - economy(days[a][0]).coins - bonus(a, b);
          const cap = earnCap(days[a], days[b]);
          expect(gained, `第 ${a + 1}～${b + 1} 天：${JSON.stringify(cap)}`).toBeLessThanOrEqual(cap.total);
          if (gained > 0) tightest = Math.min(tightest, cap.total / gained);
        }
      }
      console.log(`品系 ${strain}：上限最緊時是實際收入的 ${tightest.toFixed(1)} 倍`);
    }, 120_000);
  }

  it('把錢改大：隔一天多 1 萬、隔一週多 3 萬、隔一個月多 15 萬都會超出', () => {
    const days: TankState[][] = [];
    seriousPlayer(1, 3, true, { days: 40, onDay: (tanks) => days.push(snap(tanks)) });
    for (const [a, b, extra] of [[20, 21, 10_000], [30, 37, 30_000], [9, 39, 150_000]]) {
      const cap = earnCap(days[a], days[b]).total;
      expect(economy(days[b][0]).coins + extra - economy(days[a][0]).coins).toBeGreaterThan(cap);
    }
  }, 120_000);
});
