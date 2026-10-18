import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, HEATERS, lifeFraction, LIGHTS, normalizeState, observeSymptoms, simulate, TANKS, type CreateTankOptions } from './index';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
};

const fed = (st: { fish: { hunger: number }[] }) => st.fish.forEach((f) => (f.hunger = 0));

describe('壽命與老死', () => {
  it('店裡買的魚是剛長大到幾個月大', () => {
    const s = createTank({ ...STARTER, seed: 2 });
    const f = addFish(s, 'guppy', { carriesIch: false });
    expect(f.ageDays).toBeGreaterThanOrEqual(60);
    expect(f.ageDays).toBeLessThan(100);
  });

  it('25°C 下年齡一天加一天', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 3, matureMedia: true });
    const f = addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
    const start = f.ageDays;
    simulate(s, 24 * 10, fed);
    expect(f.ageDays - start).toBeGreaterThan(9.5);
    expect(f.ageDays - start).toBeLessThan(10.8);
  });

  it('水溫偏高時老得比較快', () => {
    const run = (target: number) => {
      const s = createTank({ ...STARTER, roomTempC: 22, seed: 4, matureMedia: true });
      s.equipment.heater!.targetC = target;
      const f = addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
      const start = f.ageDays;
      simulate(s, 24 * 10, fed);
      return f.ageDays - start;
    };
    expect(run(28)).toBeGreaterThan(run(24) * 1.1);
  });

  it('年紀大了看得出來，超過壽命後幾週內老死', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 5, matureMedia: true });
    const f = addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
    f.stress = 0;
    f.ageDays = 700 * f.constitution;
    expect(observeSymptoms(s, f)).toContain('elderly');
    simulate(s, 24 * 60, fed);
    expect(f.alive).toBe(false);
    expect(s.events.some((e) => e.type === 'fish_died' && e.cause === 'old_age')).toBe(true);
  });

  it('壯年的魚在好水裡不會老死', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 6, matureMedia: true });
    const f = addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
    simulate(s, 24 * 60, fed);
    expect(f.alive).toBe(true);
    expect(lifeFraction(f)).toBeLessThan(0.5);
  });

  it('太老的母魚不再懷孕', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 7, matureMedia: true });
    const mom = addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
    addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
    mom.ageDays = 0.92 * 730 * mom.constitution;
    simulate(s, 24 * 10, fed);
    expect(mom.pregnancy).toBe(0);
  });

  it('舊存檔沒有年齡時依體長推估', () => {
    const s = createTank({ ...STARTER, seed: 8 });
    const adult = addFish(s, 'guppy', { carriesIch: false });
    const fry = addFish(s, 'guppy', { carriesIch: false });
    fry.lengthCm = 1;
    delete (adult as { ageDays?: number }).ageDays;
    delete (fry as { ageDays?: number }).ageDays;
    normalizeState(s);
    expect(adult.ageDays).toBe(60);
    expect(fry.ageDays).toBeLessThan(30);
  });
});
