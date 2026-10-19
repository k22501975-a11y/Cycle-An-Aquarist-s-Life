import { describe, expect, it } from 'vitest';
import { addFish, buyQuarantine, createTank, rescueFryToBox, simulate, FILTERS, FISH_SPECIES, HEATERS, LIGHTS, splitAdvice, splitGroup, splitTank, TANKS, type CreateTankOptions, type TankState } from './index';
import { createFish } from './processes/population';

const MATURE: CreateTankOptions = { tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true };

function brood(s: TankState, n: number, lengthCm: number, sex?: 'male' | 'female') {
  for (let i = 0; i < n; i++) {
    const f = createFish(s, 'guppy', { lengthCm, ageDays: 20, sex });
    f.generation = 1;
    s.fish.push(f);
  }
}

describe('分缸提示（design/growth.md §4.1）', () => {
  it('成魚和仔魚混養：提醒把仔魚撈走，依大小分', () => {
    const s = createTank({ ...MATURE, seed: 401 });
    addFish(s, 'guppy', { carriesIch: false, sex: 'female' });
    brood(s, 6, FISH_SPECIES.guppy.birthLengthCm);
    const a = splitAdvice(s).find((x) => x.reason === 'fry_with_adults')!;
    expect(a.plan).toBe('by_size');
    expect(a.tone).toBe('bad');
    expect(splitGroup(s, 'by_size')).toHaveLength(6);
  });

  it('小魚轉色後公母混著：提醒公母分開，移走年輕公魚', () => {
    const s = createTank({ ...MATURE, seed: 402 });
    brood(s, 3, 2.8, 'male');
    brood(s, 3, 2.8, 'female');
    const a = splitAdvice(s).find((x) => x.reason === 'sexes_mixed')!;
    expect(a.plan).toBe('by_sex');
    expect(splitGroup(s, 'by_sex').every((f) => f.sex === 'male')).toBe(true);
  });

  it('擁擠度 80% 提醒、100% 警告', () => {
    const s = createTank({ ...MATURE, seed: 403 });
    for (let i = 0; i < 9; i++) addFish(s, 'guppy', { carriesIch: false });
    expect(splitAdvice(s).find((x) => x.reason === 'crowded')?.tone).toBe('warn');
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false });
    expect(splitAdvice(s).find((x) => x.reason === 'crowded')?.tone).toBe('bad');
  });

  it('一鍵分缸：照分法把那群魚撈到另一缸，換過去有一點緊迫', () => {
    const a = createTank({ ...MATURE, seed: 404 });
    const b = createTank({ ...MATURE, seed: 405 });
    addFish(a, 'guppy', { carriesIch: false, sex: 'female' });
    brood(a, 5, 1);
    const moved = splitTank(a, b, 'by_size');
    expect(moved).toBe(5);
    expect(a.fish).toHaveLength(1);
    expect(b.fish.every((f) => f.stress >= 0.3)).toBe(true);
    expect(splitAdvice(a).some((x) => x.reason === 'fry_with_adults')).toBe(false);
  });

  it('只有一缸、有檢疫盒：仔魚可以撈進盒子（當育幼盒），成魚吃不到（#144）', () => {
    const s = createTank({ ...MATURE, seed: 404 });
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, sex: i === 0 ? 'male' : 'female' });
    brood(s, 30, FISH_SPECIES.guppy.birthLengthCm);
    expect(rescueFryToBox(s)).toBe(0); // 沒有檢疫盒
    buyQuarantine(s);
    expect(splitAdvice(s).find((x) => x.reason === 'fry_with_adults')!.text).toContain('檢疫盒');
    expect(rescueFryToBox(s)).toBe(30);
    expect(s.quarantine!.fish).toHaveLength(30);
    expect(s.fish.filter((f) => f.alive)).toHaveLength(3);
    simulate(s, 24 * 3);
    expect(s.quarantine!.fish.filter((f) => f.alive).length).toBeGreaterThanOrEqual(28);
  });
});
