import { describe, expect, it } from 'vitest';
import { midgamePlayer } from './midgame-player';

/**
 * 中期驗收（design/midgame.md §5）：基準玩法玩 36 天，種子 1～3。
 * - C1～C4 都出現，這四張相鄰最多隔 6 天（第一窩早生的話 C1 會在第 10 天前，一起算）
 * - 第 10～36 天「安靜的一晚」≤ 5 個（g17 是 11 個）
 * - C5（交單還是留著）36 天內出現
 * - 第二缸（#305）：第 25 天前買到（C3 選繁殖缸就買）；養好了出 C6，搬過去之後繁殖缸裡有魚
 */
describe('中期劇本（design/midgame.md §5）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：C1～C4 都出、相鄰隔 ≤ 6 天；安靜的早上 ≤ 5 個；第二缸 25 天內買到、魚搬進繁殖缸`, () => {
      const nights = midgamePlayer(seed, 36);
      const log = nights.map((n) => `${n.day}${n.choice ? `[${n.choice}]` : ''}${n.orderChoice ? `{${n.orderChoice}}` : ''}${n.quiet ? 'q' : ''}`).join(' ');
      const points = nights.filter((n) => n.choice);
      const order = points.map((n) => n.choice).filter((c) => c !== 'C5');
      expect(order.filter((c) => c !== 'C6'), log).toEqual(['C1', 'C3', 'C2', 'C4']);
      expect(order.indexOf('C6'), log).toBeGreaterThan(order.indexOf('C3'));
      // 驗收是 C1～C4 這條主線相鄰隔 ≤ 6 天（C6 搬缸、C5 交單是插進來的，不算在主線）
      const main = points.filter((n) => n.choice !== 'C5' && n.choice !== 'C6');
      for (let i = 1; i < main.length; i++) expect(main[i].day - main[i - 1].day, log).toBeLessThanOrEqual(6);
      expect(nights.filter((n) => n.day >= 10 && n.quiet).length, log).toBeLessThanOrEqual(5);
      expect(nights.find((n) => n.tanks >= 2)!.day, log).toBeLessThanOrEqual(25);
      // C5 交單還是留著（#318）：36 天內一定要出現（早上的卡或交單時的卡）
      expect(nights.some((n) => n.choice === 'C5' || n.orderChoice === 'C5'), log).toBe(true);
      const moved = nights.find((n) => n.choice === 'C6')!.day;
      expect(nights.filter((n) => n.day > moved).every((n) => n.inBreeding > 0), log).toBe(true);
    }, 300_000);
  }
});
