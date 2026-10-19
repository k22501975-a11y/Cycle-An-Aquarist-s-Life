import { describe, expect, it } from 'vitest';
import { FpsMeter, formatFps } from './fps-meter';

describe('開發用幀率顯示', () => {
  it('看最近 1 秒：幀率、平均和最差的幀時間、每幀更新時間', () => {
    const m = new FpsMeter();
    let t = 0;
    for (let i = 0; i < 60; i++) {
      const ms = i === 30 ? 50 : 16;
      t += ms;
      m.add(ms, 3, t);
    }
    const s = m.stats();
    expect(s.fps).toBeGreaterThan(50);
    expect(s.fps).toBeLessThan(62);
    expect(s.worstMs).toBe(50);
    expect(s.jsMs).toBeCloseTo(3);
    expect(formatFps(s)).toMatch(/^\d+ fps/);
  });

  it('超過 1 秒的舊幀不算', () => {
    const m = new FpsMeter();
    m.add(400, 1, 400);
    for (let t = 1500; t <= 2500; t += 20) m.add(20, 2, t);
    expect(m.stats().worstMs).toBe(20);
    expect(Math.round(m.stats().fps)).toBe(50);
  });

  it('還沒有資料時是 0，不會除以零', () => {
    expect(new FpsMeter().stats()).toEqual({ fps: 0, avgMs: 0, worstMs: 0, jsMs: 0 });
  });
});
