import { describe, expect, it } from 'vitest';
import { MAX_ASPECT, MIN_ASPECT, tankRect } from './layout';

describe('橫向水缸版面', () => {
  it('橫向手機：水缸幾乎填滿，維持寬比高長', () => {
    const r = tankRect(760, 330);
    expect(r.width / r.height).toBeGreaterThanOrEqual(MIN_ASPECT);
    expect(r.width / r.height).toBeLessThanOrEqual(MAX_ASPECT + 1e-9);
    expect(r.height).toBeGreaterThan(250);
  });

  it('直向手機：水缸仍是橫的寬缸，不會被拉成直的', () => {
    const r = tankRect(374, 640);
    expect(r.width / r.height).toBeCloseTo(MIN_ASPECT);
    expect(r.width).toBeGreaterThan(340);
    expect(r.y + r.height).toBeLessThan(640);
  });

  it('超寬螢幕：寬度受限，置中', () => {
    const r = tankRect(2400, 500);
    expect(r.width / r.height).toBeCloseTo(MAX_ASPECT);
    expect(r.x).toBeCloseTo((2400 - r.width) / 2);
  });
});
