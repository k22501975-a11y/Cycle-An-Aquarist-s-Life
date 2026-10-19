import { describe, expect, it } from 'vitest';
import { SETUP_SECONDS, setupLook, setupStepAt } from './setup-show';

describe('開缸演出（F1-b）', () => {
  it('依序倒沙、注水、裝設備、開燈', () => {
    const steps: string[] = [];
    for (let t = 0; t < SETUP_SECONDS + 0.5; t += 0.05) {
      const s = setupStepAt(t, t + 0.05);
      if (s) steps.push(s);
    }
    expect(steps).toEqual(['sand', 'water', 'gear', 'light', 'done']);
  });

  it('一開始是空缸，最後沙倒滿、水注滿、水變清、設備裝好、燈亮', () => {
    const start = setupLook(0);
    expect([start.sand, start.water, start.gear, start.light]).toEqual([0, 0, 0, 0]);
    const end = setupLook(SETUP_SECONDS);
    expect(end.sand).toBe(1);
    expect(end.water).toBe(1);
    expect(end.milk).toBeLessThan(0.01);
    expect(end.gear).toBe(1);
    expect(end.light).toBe(1);
  });

  it('剛注水時水是濁的，之後慢慢變清', () => {
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => setupLook(2.6 + i * 0.1).milk));
    expect(peak).toBeGreaterThan(0.5);
    expect(setupLook(7.6).milk).toBeLessThan(peak / 3);
  });
});
