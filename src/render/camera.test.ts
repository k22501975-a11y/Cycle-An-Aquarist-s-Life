import { describe, expect, it } from 'vitest';
import { clampPan, fitCamera, maxSpan, zoomAt } from './camera';

describe('大缸鏡頭', () => {
  it('90 cm 以下整缸塞進畫面，不能滑；越大的缸可以拉越近', () => {
    expect(maxSpan(60)).toBe(1);
    expect(maxSpan(90)).toBe(1.5);
    expect(maxSpan(120)).toBe(2);
    expect(maxSpan(240)).toBe(2.5);
  });

  it('滑動不會超出缸的兩端', () => {
    expect(clampPan(-50, 2, 1000)).toBe(0);
    expect(clampPan(5000, 2, 1000)).toBe(1000);
    expect(clampPan(300, 1, 1000)).toBe(0);
  });

  it('雙指縮放時手指底下的東西留在原地', () => {
    const cam = { span: 2, pan: 500 };
    const out = zoomAt(cam, 0.75, 400, 1000, 2);
    const before = (cam.pan + 400) / (cam.span * 1000);
    const after = (out.pan + 400) / (out.span * 1000);
    expect(out.span).toBe(1.5);
    expect(after).toBeCloseTo(before, 5);
  });

  it('縮放有上下限', () => {
    expect(zoomAt({ span: 2, pan: 0 }, 2, 0, 1000, 2).span).toBe(2);
    expect(zoomAt({ span: 1.25, pan: 0 }, 0.5, 0, 1000, 2).span).toBe(1);
  });

  it('換成大缸時預設拉近、對準中間；畫面改變時保留目前位置', () => {
    expect(fitCamera({ span: 1, pan: 0 }, 120, 1000, true)).toEqual({ span: 2, pan: 500 });
    expect(fitCamera({ span: 1.5, pan: 200 }, 120, 1000, false)).toEqual({ span: 1.5, pan: 200 });
    expect(fitCamera({ span: 2, pan: 900 }, 60, 1000, false)).toEqual({ span: 1, pan: 0 });
  });
});
