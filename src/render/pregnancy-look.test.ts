import { describe, expect, it } from 'vitest';
import { bellyScaleY, pregnancyStage, PREGNANCY_STEPS } from './pregnancy-look';

describe('懷孕母魚分 3 段（polish-to-9.md §12.1）', () => {
  it('照懷孕程度分段：0.3 肚子微圓、0.7 胎斑變黑、0.88 肚子方方的', () => {
    expect(PREGNANCY_STEPS).toEqual([0.3, 0.7, 0.88]);
    expect([0, 0.29, 0.3, 0.69, 0.7, 0.87, 0.88, 1].map(pregnancyStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('越後面肚子撐得越開，沒懷孕不變形', () => {
    expect(bellyScaleY(0)).toBe(1);
    expect(bellyScaleY(1)).toBeGreaterThan(1);
    expect(bellyScaleY(2)).toBeGreaterThan(bellyScaleY(1));
    expect(bellyScaleY(3)).toBeGreaterThan(bellyScaleY(2));
  });
});
