import { describe, expect, it } from 'vitest';
import { cornerRect, pickCorner } from './dodge';

// 直向手機：390 寬，水缸可用區域從狀態列下方到按鈕列上方。
const area = { x: 0, y: 110, w: 390, h: 560 };
const W = 180;
const H = 130;

describe('pickCorner', () => {
  it('沒擋到魚就留在原本的角落', () => {
    expect(pickCorner('top-right', { x: 60, y: 400 }, area, W, H)).toBe('top-right');
  });

  it('魚游到右上角卡片底下時，卡片換到左上', () => {
    const r = cornerRect('top-right', area, W, H, 14);
    expect(pickCorner('top-right', { x: r.x + r.w / 2, y: r.y + r.h / 2 }, area, W, H)).toBe('top-left');
  });

  it('魚在上方正中間、兩個上角都擋到時，卡片移到下方', () => {
    const narrow = { x: 0, y: 110, w: 340, h: 560 };
    expect(pickCorner('top-right', { x: 170, y: 170 }, narrow, W, H)).toMatch(/^bottom/);
  });

  it('沒有選魚時不動', () => {
    expect(pickCorner('bottom-left', null, area, W, H)).toBe('bottom-left');
  });

  it('角落的位置貼齊可用區域', () => {
    expect(cornerRect('bottom-left', area, W, H, 14)).toEqual({ x: 14, y: 110 + 560 - H, w: W, h: H });
  });
});
