import { describe, expect, it } from 'vitest';
import { celebrateFrame, CELEBRATE_SECONDS, sparkleAlpha, sparkleBurst } from './celebrate';

describe('生小魚的慶祝特寫', () => {
  it('暗下來、停住、再亮回來', () => {
    expect(celebrateFrame(0).spot).toBe(0);
    expect(celebrateFrame(2).spot).toBe(1);
    expect(celebrateFrame(CELEBRATE_SECONDS - 0.3).spot).toBeLessThan(0.5);
    expect(celebrateFrame(CELEBRATE_SECONDS).spot).toBe(0);
  });

  it('光環擴散一次就消失', () => {
    expect(celebrateFrame(0.8).ringAlpha).toBeGreaterThan(0);
    expect(celebrateFrame(0.8).ring).toBeLessThan(celebrateFrame(1.5).ring);
    expect(celebrateFrame(2).ringAlpha).toBe(0);
  });

  it('亮點往上飄、最後淡掉', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const sp = sparkleBurst(20, 100, 100, 50, rand);
    expect(sp).toHaveLength(20);
    for (const s of sp) {
      expect(s.vy).toBeLessThan(0);
      expect(sparkleAlpha({ ...s, t: s.life })).toBe(0);
      expect(sparkleAlpha({ ...s, t: 0.3 })).toBeGreaterThan(0);
    }
  });
});
