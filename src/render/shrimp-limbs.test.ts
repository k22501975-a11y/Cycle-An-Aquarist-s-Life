import { describe, expect, it } from 'vitest';
import { clawPose, clawRate, pleopods } from './shrimp-limbs';

describe('蝦的小螯和腹足', () => {
  it('螯伸到前下方的底沙夾一下再收回嘴邊', () => {
    const start = clawPose(0, 2, 0);
    const out = clawPose(0.45 / 2, 2, 0);
    const back = clawPose(0.99 / 2, 2, 0);
    expect(out.tip.y).toBeGreaterThan(start.tip.y + 0.2);
    expect(back.tip.y).toBeLessThan(out.tip.y - 0.2);
  });

  it('兩支螯輪流：一支伸出去時另一支在嘴邊', () => {
    const t = 0.45 / 2;
    expect(clawPose(t, 2, 0).tip.y - clawPose(t, 2, 1).tip.y).toBeGreaterThan(0.15);
  });

  it('夾緊的時候鉗子是閉的，伸出去的時候是張開的', () => {
    expect(clawPose(0.2 / 2, 2, 0).open).toBe(1);
    expect(clawPose(0.6 / 2, 2, 0).open).toBe(0);
  });

  it('抱著飼料吃夾得最快，走路時幾乎不夾', () => {
    expect(clawRate(true, 0).rate).toBeGreaterThan(clawRate(false, 0).rate);
    expect(clawRate(false, 1).reach).toBeLessThan(0.5);
  });

  it('抱蛋母蝦的腹足會搧，平常不動', () => {
    const a = pleopods(0, true)[0].to, b = pleopods(0.06, true)[0].to;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.01);
    expect(pleopods(0, false)[0].to).toEqual(pleopods(0.3, false)[0].to);
  });
});
