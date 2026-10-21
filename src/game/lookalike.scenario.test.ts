import { describe, expect, it } from 'vitest';
import { economy, takeLookalike } from '../sim';
import { seriousPlayer } from './serious-player';

/**
 * G2 驗收（polish-to-9.md）：36 天劇本裡，「長得像誰」比較卡至少出現 1 次，自己選育的魚被收購的慶祝至少 1 次。
 * 用認真玩家（禮服、接訂單），每天早上看一次報告。
 */
describe('長得像誰劇本（G2）', () => {
  it('seed 1～3：36 天內都出現比較卡和第一次選育收購', () => {
    for (const seed of [1, 2, 3]) {
      let cardDay = 0;
      let saleDay = 0;
      seriousPlayer(seed, 3, true, {
        days: 36,
        onDay: (tanks, d) => {
          if (!cardDay && takeLookalike(tanks)) cardDay = d;
          if (!saleDay && economy(tanks[0]).firstBredSale) saleDay = d;
        },
      });
      expect(cardDay, `seed ${seed} 比較卡`).toBeGreaterThan(0);
      expect(saleDay, `seed ${seed} 慶祝`).toBeGreaterThan(0);
    }
  }, 180_000);
});
