import { describe, expect, it } from 'vitest';
import { biteKick, BITE_SECONDS, pickEaten, ripple, scatterPellets, stepPellet } from './feeding';

const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();

describe('餵食演出', () => {
  it('一把飼料落在撒下去的位置附近', () => {
    const ps = scatterPellets(20, 300, 50, 40, rand);
    expect(ps).toHaveLength(20);
    for (const p of ps) {
      expect(Math.abs(p.x - 300)).toBeLessThanOrEqual(40);
      expect(p.floatT).toBeGreaterThan(0);
    }
  });

  it('飼料先浮在水面，漂完才開始沉，沉到底就停', () => {
    const [p] = scatterPellets(1, 100, 50, 0, rand);
    p.floatT = 1;
    stepPellet(p, 0.5, 50, 300, 1);
    expect(p.y).toBeLessThan(55);
    for (let i = 0; i < 20; i++) stepPellet(p, 0.1, 50, 300, 1);
    expect(p.y).toBeGreaterThan(55);
    for (let i = 0; i < 400; i++) stepPellet(p, 0.1, 50, 300, 1);
    expect(p.y).toBe(298);
  });

  it('嘴邊有飼料就算那條魚吃的，沒魚碰得到就拿掉最靠底的', () => {
    const food = [{ x: 10, y: 10 }, { x: 100, y: 200 }, { x: 50, y: 52 }];
    expect(pickEaten(food, [{ x: 200, y: 200, reach: 5 }, { x: 52, y: 50, reach: 10 }])).toEqual({ food: 2, eater: 1 });
    expect(pickEaten(food, [{ x: 500, y: 500, reach: 10 }])).toEqual({ food: 1, eater: null });
  });

  it('咬一口是短短往前一衝再回來', () => {
    expect(biteKick(-1)).toBe(0);
    expect(biteKick(BITE_SECONDS / 2)).toBeCloseTo(1);
    expect(biteKick(BITE_SECONDS)).toBe(0);
  });

  it('漣漪越擴越大、越來越淡', () => {
    const a = ripple(0.1, 40), b = ripple(0.8, 40);
    expect(b.r).toBeGreaterThan(a.r);
    expect(b.alpha).toBeLessThan(a.alpha);
    expect(ripple(5, 40).alpha).toBe(0);
  });
});
