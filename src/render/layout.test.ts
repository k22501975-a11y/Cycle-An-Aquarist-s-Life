import { describe, expect, it } from 'vitest';
import { pxPerCm, sceneBounds } from './layout';

describe('全螢幕水缸版面', () => {
  it('魚的活動範圍避開上方狀態列與下方按鈕列', () => {
    const b = sceneBounds(844, 390, { top: 44, bottom: 70 });
    expect(b.surface).toBeGreaterThanOrEqual(44);
    expect(b.bottom).toBeLessThan(390 - 70);
    expect(b.bottom - b.surface).toBeGreaterThan(200);
  });

  it('很矮的畫面：仍然留一段可以游的水', () => {
    const b = sceneBounds(600, 200, { top: 80, bottom: 80 });
    expect(b.bottom - b.surface).toBeGreaterThanOrEqual(60);
  });

  it('換大缸：鏡頭拉遠，同樣的畫面每公分的像素變少（魚看起來變小）', () => {
    const b = sceneBounds(1280, 720, { top: 90, bottom: 120 });
    const small = pxPerCm(b, { w: 36, h: 22 });
    const std = pxPerCm(b, { w: 45, h: 30 });
    const big = pxPerCm(b, { w: 60, h: 38 });
    expect(small).toBeGreaterThan(std);
    expect(std).toBeGreaterThan(big);
  });
});
