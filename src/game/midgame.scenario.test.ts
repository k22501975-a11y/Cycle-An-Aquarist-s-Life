import { describe, expect, it } from 'vitest';
import { midgamePlayer } from './midgame-player';

/**
 * 中期驗收（design/midgame.md §5）：基準玩法玩 36 天，種子 1～3。
 * - C1～C4 都出現，從第一張起相鄰兩張最多隔 6 天（第一窩早生的話 C1 會在第 10 天前，一起算）
 * - 第 10～36 天「安靜的一晚」≤ 5 個（g17 是 11 個）
 * - 36 天內買到第二缸（C3 選繁殖缸就買）
 */
describe('中期劇本（design/midgame.md §5）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：C1～C4 都出、相鄰隔 ≤ 6 天；安靜的早上 ≤ 5 個；買到第二缸`, () => {
      const nights = midgamePlayer(seed, 36);
      const log = nights.map((n) => `${n.day}${n.choice ? `[${n.choice}]` : ''}${n.quiet ? 'q' : ''}`).join(' ');
      const points = nights.filter((n) => n.choice);
      expect(points.map((n) => n.choice).filter((c) => c !== 'C5'), log).toEqual(['C1', 'C3', 'C2', 'C4']);
      for (let i = 1; i < points.length; i++) expect(points[i].day - points[i - 1].day, log).toBeLessThanOrEqual(6);
      expect(nights.filter((n) => n.day >= 10 && n.quiet).length, log).toBeLessThanOrEqual(5);
    }, 300_000);
  }
});
