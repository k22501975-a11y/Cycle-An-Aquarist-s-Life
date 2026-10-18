import { describe, expect, it } from 'vitest';
import { sickLook } from './fish-motion';

describe('生病的動作語言', () => {
  it('健康的魚沒有任何變化', () => {
    expect(sickLook([], 1, 0, 1)).toEqual({ dim: null, thin: 1, flash: 0 });
  });

  it('越虛弱顏色越淡', () => {
    const weak = sickLook([], 0.2, 0, 1).dim!;
    const mild = sickLook([], 0.5, 0, 1).dim!;
    // 色調越小越暗淡（以綠色通道比較）
    expect((weak >> 8) & 255).toBeLessThan((mild >> 8) & 255);
    expect(sickLook(['lethargic'], 1, 0, 1).dim).not.toBeNull();
  });

  it('消瘦時身體變扁', () => {
    expect(sickLook(['thin'], 1, 0, 1).thin).toBeLessThan(1);
  });

  it('磨身只在短暫的瞬間發生', () => {
    let flashing = 0;
    for (let t = 0; t < 50; t += 0.05) if (sickLook(['flashing'], 1, t, 3).flash > 0) flashing++;
    const frac = flashing / 1000;
    expect(frac).toBeGreaterThan(0.05);
    expect(frac).toBeLessThan(0.15);
  });
});
