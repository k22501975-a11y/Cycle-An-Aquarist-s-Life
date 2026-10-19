import { describe, expect, it } from 'vitest';
import { keepInRect, nurseryRect, pxPerCm, sceneBounds } from './layout';

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

describe('育幼盒的框（#187）', () => {
  const b = { width: 1000, height: 600, surface: 60, bottom: 520 };
  it('在右上角，上緣露出水面一點', () => {
    const r = nurseryRect(b);
    expect(r.x + r.w).toBeLessThan(b.width);
    expect(r.x).toBeGreaterThan(b.width / 2);
    expect(r.y).toBeLessThan(b.surface);
    expect(r.y + r.h).toBeLessThan((b.surface + b.bottom) / 2);
  });
  it('游出框的魚拉回來並掉頭', () => {
    const r = nurseryRect(b);
    const s = { x: 10, y: 400, vx: -5, vy: 3 };
    expect(keepInRect(s, r, b.surface, 4)).toBe(true);
    expect(s.x).toBeGreaterThanOrEqual(r.x);
    expect(s.y).toBeLessThanOrEqual(r.y + r.h);
    expect(s.vx).toBeGreaterThan(0);
    const inside = { x: r.x + r.w / 2, y: b.surface + r.h / 2, vx: 1, vy: 0 };
    expect(keepInRect(inside, r, b.surface, 4)).toBe(false);
  });
});
