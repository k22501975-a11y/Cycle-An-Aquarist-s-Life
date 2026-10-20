import { describe, expect, it } from 'vitest';
import { chooseIdle, idleWeights, stepIdle, type IdleScene } from './idle';

const scene: IdleScene = { surface: 20, bottom: 400, width: 800, scale: 1, plants: [200, 600], floorAt: () => 390 };
const SHY = { activity: 0.8, hide: 0.8, approach: 0.05 };
const LAZY = { activity: 0.6, hide: 0.4, approach: 0.2 };
const CURIOUS = { activity: 1.05, hide: 0.25, approach: 0.9 };

function seq(...xs: number[]) {
  let i = 0;
  return () => xs[i++ % xs.length];
}

describe('魚的待機行為（V1）', () => {
  it('個性決定最常做哪一種：膽小躲草邊、懶散趴底、好奇去水面啄', () => {
    const top = (m: typeof SHY) => Object.entries(idleWeights(m, true)).sort((a, b) => b[1] - a[1])[0][0];
    expect(top(SHY)).toBe('plant');
    expect(top(LAZY)).toBe('rest');
    expect(top(CURIOUS)).toBe('peck');
  });

  it('沒有水草就不會選草邊', () => {
    for (let r = 0; r < 1; r += 0.05) expect(chooseIdle(SHY, false, r)).not.toBe('plant');
  });

  it('游到位置後停下來；在水面會一下一下地啄；時間到就結束', () => {
    const s = { x: 400, y: 200, id: 1 } as Parameters<typeof stepIdle>[0];
    // 第一格：開始（rand 0 → 一定開始、選第一種＝草邊以外看比重；這裡用好奇的魚，選 peck）
    const rand = seq(0, 0.5, 0.5, 0.5, 0.5);
    const first = stepIdle(s, { ...CURIOUS, hide: 0 }, 20, 6, { ...scene, plants: [] }, 0.016, rand);
    expect(s.idle?.kind).toBe('peck');
    expect(first?.settled).toBe(false);
    // 直接放到目標上
    s.x = s.idle!.x;
    s.y = s.idle!.y;
    let pecks = 0;
    let settled = 0;
    for (let i = 0; i < 120; i++) {
      const st = stepIdle(s, CURIOUS, 20, 6, scene, 1 / 30, () => 0.5);
      if (st?.settled) settled++;
      if (st?.peck) pecks++;
    }
    expect(settled).toBeGreaterThan(60);
    expect(pecks).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 400 && s.idle; i++) stepIdle(s, CURIOUS, 20, 6, scene, 1 / 30, () => 0.5);
    expect(s.idle).toBeUndefined();
  });

  it('休息的位置在底沙上方、啄的位置在水面下', () => {
    const s = { x: 400, y: 200, id: 2 } as Parameters<typeof stepIdle>[0];
    stepIdle(s, LAZY, 20, 6, { ...scene, plants: [] }, 0.016, seq(0, 0.99, 0.5, 0.5));
    expect(s.idle?.kind).toBe('rest');
    expect(s.idle!.y).toBeGreaterThan(370);
    expect(s.idle!.y).toBeLessThan(390);
  });
});
