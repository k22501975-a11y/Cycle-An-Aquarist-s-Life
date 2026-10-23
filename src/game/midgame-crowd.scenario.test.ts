import { describe, expect, it } from 'vitest';
import { midgamePlayer } from './midgame-player';

/**
 * 擠缸都不處理（design/midgame.md §7.4，#338）：120 天劇本，C14 每次都選「先多換水」。
 * - 第一尾擠缸死魚之前，至少已經提醒過 2 次（早上報告的擠缸行或 C14）
 * - 一天最多擠死 2 尾
 */
describe('擠缸都不處理（midgame.md §7.4）', () => {
  it('seed 1：擠死魚之前提醒過兩次，一天最多死 2 尾', () => {
    const nights = midgamePlayer(1, 120, { neglectCrowd: true });
    const log = nights.filter((n) => n.day >= 60).map((n) => `${n.day}${n.choice === 'C14' ? '[C14]' : ''}:${n.crowd.join('/')}${n.crowdDeaths ? `†${n.crowdDeaths}` : ''}`).join(' ');
    const first = nights.findIndex((n) => n.crowdDeaths > 0);
    if (first >= 0) {
      const notices = nights.slice(0, first + 1).filter((n) => n.choice === 'C14' || /\bcrowd\b/.test(n.line)).length;
      expect(notices, log).toBeGreaterThanOrEqual(2);
    }
    expect(Math.max(0, ...nights.map((n) => n.crowdDeaths)), log).toBeLessThanOrEqual(2);
  }, 600_000);
});
