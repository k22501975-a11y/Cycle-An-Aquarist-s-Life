import { describe, expect, it } from 'vitest';
import { cuttingsFromDrop, inferFraction, kitColor, TEST_SECONDS, tubeFrame, waterChangeFrame, WATER_CHANGE_SECONDS } from './ops-fx';

describe('操作演出', () => {
  it('換水：先抽水讓水位下降，停一下，再加水回滿', () => {
    expect(waterChangeFrame(0).siphon).toBe(true);
    expect(waterChangeFrame(0.75).drop).toBeGreaterThan(0.3);
    expect(waterChangeFrame(1.8)).toEqual({ drop: 1, siphon: false, pour: false });
    expect(waterChangeFrame(2.8).pour).toBe(true);
    expect(waterChangeFrame(WATER_CHANGE_SECONDS).drop).toBe(0);
  });

  it('從硝酸鹽的變化反推換水比例', () => {
    expect(inferFraction(40, 30, 0)).toBeCloseTo(0.25);
    expect(inferFraction(5, 5, 5)).toBe(0.3);
    expect(inferFraction(40, 0, 0)).toBe(0.8);
  });

  it('測試劑顏色：氨越高越綠、硝酸鹽越高越紅', () => {
    expect(kitColor('ammonia', 0)).toBe(0xe9dc4a);
    expect(kitColor('ammonia', 8)).toBe(0x2f8a4a);
    expect(kitColor('nitrate', 200)).toBe(0xa81e2a);
    const mid = kitColor('nitrate', 10);
    expect(mid).not.toBe(0xf0d84a);
    expect(mid).not.toBe(0xf08a3a);
  });

  it('試管：先裝水、再變色，最後淡出', () => {
    expect(tubeFrame(0.3).tint).toBe(0);
    expect(tubeFrame(2.5)).toMatchObject({ fill: 1, tint: 1, alpha: 1 });
    expect(tubeFrame(TEST_SECONDS).alpha).toBe(0);
  });

  it('修剪：剪下的量換算成插枝數，慢慢長小的變化不算', () => {
    expect(cuttingsFromDrop(20, 12, 4)).toBe(2);
    expect(cuttingsFromDrop(20, 19.9, 4)).toBe(0);
    expect(cuttingsFromDrop(100, 0, 4)).toBe(5);
  });
});
