import { describe, expect, it } from 'vitest';
import { addFish, computeStressors, createTank, driftAcclimation, FILTERS, habitStress, HEATERS, LIGHTS, simulate, TANKS, type CreateTankOptions, type TankState } from './index';

const MATURE: CreateTankOptions = { tank: TANKS.std90, filter: FILTERS.canister, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true };

/** 把缸的水固定在某個 pH（像水草泥缸）。 */
function setPh(s: TankState, ph: number) {
  s.water.ph = ph;
  s.water.phAvg = ph;
}

describe('水質適應（design/acclimation.md）', () => {
  it('店裡的孔雀魚放進酸性水草缸：一開始緊迫，一兩週後習慣了就沒事', () => {
    const s = createTank({ ...MATURE, seed: 501 });
    const f = addFish(s, 'guppy', { carriesIch: false });
    setPh(s, 6.3);
    const before = habitStress(s, f);
    expect(before).toBeGreaterThan(0.5);
    for (let h = 0; h < 24 * 14; h++) {
      setPh(s, 6.3);
      driftAcclimation(s, f, 1);
    }
    expect(f.acclimated!.ph).toBeLessThan(6.8);
    expect(habitStress(s, f)).toBe(0);
  });

  it('教科書範圍外但在存活範圍內不算壓力；超出存活範圍才撐不住', () => {
    const s = createTank({ ...MATURE, seed: 502 });
    const f = addFish(s, 'guppy', { carriesIch: false });
    f.acclimated = { ph: 6.4, gh: 6, tempC: 25 };
    setPh(s, 6.4);
    expect(computeStressors(s, f).ph).toBe(0);
    setPh(s, 5.4);
    f.acclimated.ph = 5.8;
    expect(computeStressors(s, f).ph).toBeGreaterThan(0.9);
  });

  it('沒對水直接倒進差很多的缸會休克，慢慢滴水就沒事', () => {
    const a = createTank({ ...MATURE, seed: 503 });
    const b = createTank({ ...MATURE, seed: 503 });
    setPh(a, 5.9);
    setPh(b, 5.9);
    const dumped = addFish(a, 'guppy', { carriesIch: false, drip: false });
    const dripped = addFish(b, 'guppy', { carriesIch: false, drip: true });
    expect(dumped.stress).toBeGreaterThan(dripped.stress + 0.3);
    expect(dumped.health).toBeLessThan(dripped.health - 0.2);
  });

  it('自家繁殖的小魚習慣出生缸的水', () => {
    const s = createTank({ ...MATURE, seed: 504 });
    const mom = addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: true });
    mom.pregnancy = 0.99;
    simulate(s, 48);
    const fry = s.fish.filter((f) => f !== mom);
    expect(fry.length).toBeGreaterThan(0);
    for (const f of fry) expect(Math.abs(f.acclimated!.ph - s.water.phAvg)).toBeLessThan(0.15);
  });
});
