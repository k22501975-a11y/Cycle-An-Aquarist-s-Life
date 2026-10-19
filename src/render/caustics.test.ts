import { describe, expect, it } from 'vitest';
import { causticsField } from './scenery';

describe('焦散網紋（畫面評測 V17）', () => {
  const N = 64;
  const f = causticsField(N, 4);

  it('是細細的網：大部分地方是暗的，亮線佔一小部分', () => {
    const bright = f.filter((v) => v > 0.5).length / f.length;
    expect(bright).toBeGreaterThan(0.03);
    expect(bright).toBeLessThan(0.3);
  });

  it('左右、上下接得起來（可以無縫拼接）', () => {
    let diff = 0;
    for (let y = 0; y < N; y++) diff += Math.abs(f[y * N] - f[y * N + N - 1]);
    for (let x = 0; x < N; x++) diff += Math.abs(f[x] - f[(N - 1) * N + x]);
    // 邊上相鄰兩點的差，跟圖內相鄰兩點的平均差差不多，不會有一條接縫
    let inner = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) inner += Math.abs(f[y * N + x] - f[y * N + x + 1]);
    expect(diff / (2 * N)).toBeLessThan((inner / (N * (N - 1))) * 2.5);
  });
});
