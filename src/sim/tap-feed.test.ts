import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, cloudiness, economy, mealMg, OVERFED_MEALS, simulate, tapFeed, TAP_FEED_MEALS } from '.';

const tank = () => {
  const s = newGameState(1);
  for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false });
  return s;
};

describe('點水面餵食（P5）', () => {
  it('點一下撒三分之一餐，記帳、記下餵食時間', () => {
    const s = tank();
    const before = economy(s).meals ?? 0;
    const r = tapFeed(s);
    expect(r.mg).toBeCloseTo(mealMg(s) * TAP_FEED_MEALS);
    expect(s.lastFedHours).toBe(s.hours);
    expect((economy(s).meals ?? 0) - before).toBeGreaterThan(0);
    expect(r.overfed).toBe(false);
  });

  it('點太多下：提醒餵太多', () => {
    const s = tank();
    let r = tapFeed(s);
    for (let i = 0; i < 8; i++) r = tapFeed(s);
    expect(r.meals).toBeGreaterThan(OVERFED_MEALS);
    expect(r.overfed).toBe(true);
  });

  it('沒有魚就什麼都不做', () => {
    const s = newGameState(1);
    expect(tapFeed(s)).toEqual({ mg: 0, meals: 0, overfed: false });
    expect(s.water.foodMg).toBe(0);
  });

  it('正常餵水是清的；一次餵三餐，當天就看得出水變濁', () => {
    const normal = tank();
    const over = tank();
    for (let d = 0; d < 2; d++) {
      for (let m = 0; m < 2; m++) {
        for (let t = 0; t < 3; t++) tapFeed(normal);
        for (let t = 0; t < 9; t++) tapFeed(over);
        simulate(normal, 12);
        simulate(over, 12);
      }
    }
    expect(cloudiness(normal)).toBeLessThan(0.02);
    expect(cloudiness(over)).toBeGreaterThan(0.1);
  });
});
