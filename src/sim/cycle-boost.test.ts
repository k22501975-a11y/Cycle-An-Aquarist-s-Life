import { describe, expect, it } from 'vitest';
import { addBottledBacteria, createTank, FILTERS, HEATERS, LIGHTS, simulate, TANKS, transferMedia, waterChange, type TankState } from '.';
import { price } from './economy';

const tank = (mature = false) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, tap: { kh: 6 }, matureMedia: mature, seed: 3 });

/** 無魚養水：每天補氨，直到補進去的氨一天內處理完。回傳花了幾天。 */
function daysToCycle(s: TankState, limit = 80): number {
  for (let day = 1; day <= limit; day++) {
    if (s.water.tan < 1) s.water.tan = 1;
    simulate(s, 24);
    if (day % 7 === 0) waterChange(s, 0.5, { tempC: s.water.tempC });
    if (s.water.tan < 0.25 && s.water.no2 < 0.25) return day;
  }
  return limit;
}

describe('養水加速', () => {
  it('硝化菌液：養水時間縮短到一半以下，但不是倒下去就好', () => {
    const base = daysToCycle(tank());
    const boosted = tank();
    addBottledBacteria(boosted);
    const fast = daysToCycle(boosted);
    // 基本養水 3～7 天、加菌液 1～3 天：比例約三分之一
    expect(fast).toBeLessThan(base * 0.4);
    expect(fast).toBeGreaterThan(1);
    expect(price('care:bacteria')).toBe(30);
  });

  it('從自己的舊缸分濾材：比菌液還快，舊缸少一些菌', () => {
    const old = tank(true);
    const before = old.bacteria.aob;
    const fresh = tank();
    expect(transferMedia(old, fresh)).not.toBeNull();
    expect(old.bacteria.aob).toBeLessThan(before);
    const bottled = tank();
    addBottledBacteria(bottled);
    // 每天補 1 ppm 氨是很重的負擔；真的放少量魚時比這更快
    expect(daysToCycle(fresh)).toBeLessThan(daysToCycle(bottled));
    expect(daysToCycle(fresh)).toBeLessThanOrEqual(daysToCycle(tank()) * 0.2);
  });

  it('舊缸也還沒養好就分不出來', () => {
    expect(transferMedia(tank(), tank())).toBeNull();
  });
});
