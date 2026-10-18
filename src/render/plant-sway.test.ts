import { describe, expect, it } from 'vitest';
import { plantSway } from './plant-sway';

describe('水草搖擺', () => {
  it('根部不動', () => {
    for (const phase of [0, 1, 2, 3]) expect(plantSway(0, phase, 20)).toBeCloseTo(0);
  });

  it('越往上擺得越多', () => {
    const peak = (h: number) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(plantSway(h, i * 0.05, 20))));
    expect(peak(0.3)).toBeLessThan(peak(0.6));
    expect(peak(0.6)).toBeLessThan(peak(1));
  });

  it('頂端最大位移不超過幅度的 1.25 倍', () => {
    for (let i = 0; i < 200; i++) expect(Math.abs(plantSway(1, i * 0.05, 20))).toBeLessThanOrEqual(25);
  });
});
