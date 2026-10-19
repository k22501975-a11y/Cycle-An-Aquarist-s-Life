import { describe, expect, it } from 'vitest';
import { quantizeTone, rimLight, toneImage, toneRGB } from './tone';

describe('色調烘進貼圖（I1）', () => {
  it('不調色時顏色不變；飽和度 -1 變灰；提高飽和度讓主色更突出', () => {
    expect(toneRGB(0.8, 0.3, 0.1, 0, 1)).toEqual([0.8, 0.3, 0.1]);
    const [r, g, b] = toneRGB(0.8, 0.3, 0.1, -1, 1);
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

describe('邊緣光', () => {
  it('只有身體上緣變亮，裡面和透明的地方不動', () => {
    // 4×4：上面一行透明，下面三行不透明的灰
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) data.set([100, 100, 100, 255], (y * w + x) * 4);
    rimLight(data, w, h, 1, 0.5);
    expect(data[(1 * w + 1) * 4 + 2]).toBeGreaterThan(100);
    expect(data[(3 * w + 1) * 4 + 2]).toBe(100);
    expect(data[(0 * w + 1) * 4 + 3]).toBe(0);
  });
});
