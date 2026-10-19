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

  it('每欄掃一次的結果跟逐點往上找一樣', () => {
    const w = 7;
    const h = 9;
    const make = () => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        d[i * 4] = (i * 37) % 256;
        d[i * 4 + 1] = (i * 91) % 256;
        d[i * 4 + 2] = (i * 53) % 256;
        d[i * 4 + 3] = [0, 40, 100, 200, 255][(i * 7 + (i >> 3)) % 5];
      }
      return d;
    };
    // 舊版的寫法：每個像素往上找第一個透明的
    const naive = (data: Uint8ClampedArray, width: number, strength: number) => {
      const alphaAt = (x: number, y: number) => (x < 0 || y < 0 ? 0 : data[(y * w + x) * 4 + 3]);
      const lit = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (alphaAt(x, y) < 128) continue;
          for (let d = 1; d <= width; d++)
            if (alphaAt(x, y - d) < 64) {
              lit[y * w + x] = 1 - (d - 1) / width;
              break;
            }
        }
      for (let i = 0; i < lit.length; i++) {
        const k = lit[i] * strength;
        if (k <= 0) continue;
        const p = i * 4;
        data[p] = Math.round(data[p] + (210 - data[p]) * k);
        data[p + 1] = Math.round(data[p + 1] + (245 - data[p + 1]) * k);
        data[p + 2] = Math.round(data[p + 2] + (255 - data[p + 2]) * k);
      }
    };
    for (const width of [1, 2, 4]) {
      const a = make();
      const b = make();
      rimLight(a, w, h, width, 0.45);
      naive(b, width, 0.45);
      expect([...a]).toEqual([...b]);
    }
  });
});
