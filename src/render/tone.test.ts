import { describe, expect, it } from 'vitest';
import { quantizeTone, toneImage, toneRGB } from './tone';

describe('色調烘進貼圖（I1）', () => {
  it('不調色時顏色不變；飽和度 -1 變灰；提高飽和度讓主色更突出', () => {
    expect(toneRGB(0.8, 0.3, 0.1, 0, 1)).toEqual([0.8, 0.3, 0.1]);
    const [r, g, b] = toneRGB(0.8, 0.3, 0.1, -1.5, 1);
    expect(Math.abs(r - g)).toBeLessThan(0.01);
    expect(Math.abs(g - b)).toBeLessThan(0.01);
    const vivid = toneRGB(0.8, 0.3, 0.1, 0.4, 1);
    expect(vivid[0] - vivid[1]).toBeGreaterThan(0.5);
    expect(toneRGB(0.5, 0.5, 0.5, 0, 1.1)[0]).toBeCloseTo(0.55);
  });

  it('透明像素不動、結果夾在 0–255', () => {
    const data = new Uint8ClampedArray([255, 10, 10, 255, 1, 2, 3, 0]);
    toneImage(data, 0.5, 1.2);
    expect(data[0]).toBe(255);
    expect([...data.slice(4)]).toEqual([1, 2, 3, 0]);
  });

  it('色調量化：很接近的值共用同一張圖', () => {
    expect(quantizeTone(0.43, 1.031)).toEqual(quantizeTone(0.41, 1.039));
  });
});
