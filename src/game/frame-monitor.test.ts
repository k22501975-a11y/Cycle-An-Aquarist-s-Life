import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, FrameMonitor, lowerQuality, WINDOW_MS } from './frame-monitor';

const run = (m: FrameMonitor, frameMs: number, ms: number, start = 0) => {
  let t = start;
  let fired = 0;
  while (t < start + ms) {
    t += frameMs;
    if (m.sample(frameMs, t)) fired++;
  }
  return fired;
};

describe('自動降畫質', () => {
  it('順的時候不動', () => {
    expect(run(new FrameMonitor(), 1000 / 60, 60_000)).toBe(0);
    expect(run(new FrameMonitor(), 1000 / 45, 60_000)).toBe(0);
  });

  it('連續卡 8 秒才降一級，之後冷卻一段時間', () => {
    const m = new FrameMonitor();
    expect(run(m, 1000 / 25, WINDOW_MS * 0.9)).toBe(0);
    expect(run(m, 1000 / 25, WINDOW_MS * 0.2, WINDOW_MS * 0.9)).toBe(1);
    expect(run(m, 1000 / 25, COOLDOWN_MS * 0.9, WINDOW_MS * 1.1)).toBe(0);
  });

  it('偶爾一個長幀（切到背景、補算）不算', () => {
    const m = new FrameMonitor();
    let t = 0;
    for (let i = 0; i < 20; i++) {
      t += 4000;
      expect(m.sample(4000, t)).toBe(false);
    }
  });

  it('高 → 中 → 低，低就不能再降', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });
});
