import { describe, expect, it } from 'vitest';
import { addFish, buyQuarantine, createTank, economy, fryHome, fryNeedHome, isCycled, linkTanks, moveFryHome, NURSERY_FRY_CAPACITY, rescueFryToBox, simulate, FILTERS, FISH_SPECIES, HEATERS, LIGHTS, splitAdvice, splitGroup, splitTank, TANKS, type CreateTankOptions, type TankState } from './index';
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

  it('選好的那對種魚不會被分走：公母分開、分一半都留在原缸（#384 長劇本：年輕種公被撈走，80 天配不到）', () => {
    const s = createTank({ ...MATURE, seed: 402 });
    brood(s, 3, 2.8, 'male');
    brood(s, 3, 2.8, 'female');
    const sire = s.fish.find((f) => f.sex === 'male')!;
    const dam = s.fish.find((f) => f.sex === 'female')!;
    economy(s).choices = { shown: {}, picked: {}, pair: [dam.id, sire.id] };
    const bySex = splitGroup(s, 'by_sex');
    expect(bySex).toHaveLength(2);
    expect(bySex.map((f) => f.id)).not.toContain(sire.id);
    expect(splitGroup(s, 'half').map((f) => f.id)).not.toContain(sire.id);
    expect(splitGroup(s, 'half').map((f) => f.id)).not.toContain(dam.id);
    // C12 選了輪流：第二尾種公也不分走
    const second = s.fish.filter((f) => f.sex === 'male')[1];
    economy(s).choices!.sires = [second.id];
    expect(splitGroup(s, 'by_sex').map((f) => f.id)).toEqual(s.fish.filter((f) => f.sex === 'male').slice(2).map((f) => f.id));
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

describe('第二缸養好水就把小魚搬過去（g36 #425）', () => {
  function home() {
    const main = createTank({ ...MATURE, seed: 4 });
    addFish(main, 'guppy', { sex: 'female' });
    addFish(main, 'guppy', { sex: 'male' });
    brood(main, 3, 0.7);
    const fresh = createTank({ ...MATURE, tank: TANKS.nano20, seed: 5 });
    const tanks = [main, fresh];
    linkTanks(tanks);
    return { main, fresh, tanks };
  }

  it('養好水、沒有大魚的缸收得了小魚；主缸外面和育幼盒裡的小魚一起搬過去，大魚留下', () => {
    const { main, fresh, tanks } = home();
    main.nurseryBox = true;
    brood(main, 2, 0.6);
    main.fish.slice(-2).forEach((f) => (f.nursery = true));
    expect(isCycled(fresh)).toBe(true);
    expect(fryNeedHome(main)).toBe(true);
    expect(fryHome(tanks, 0)).toBe(1);
    expect(moveFryHome(tanks, 0)).toEqual({ to: 1, count: 5 });
    expect(main.fish.filter((f) => f.alive)).toHaveLength(2);
    expect(fresh.fish.every((f) => f.generation === 1 && !f.nursery)).toBe(true);
    expect(fryNeedHome(main)).toBe(false);
  });

  it('還沒養好水、或那缸有會吃小魚的成魚：不搬', () => {
    const { fresh, tanks } = home();
    fresh.water.tan = 1;
    expect(fryHome(tanks, 0)).toBeNull();
    expect(moveFryHome(tanks, 0)).toBeNull();
    fresh.water.tan = 0;
    addFish(fresh, 'guppy', { sex: 'male' });
    expect(fryHome(tanks, 0)).toBeNull();
  });

  it('育幼盒滿了也算要搬家', () => {
    const { main } = home();
    main.fish = main.fish.filter((f) => f.generation !== 1);
    expect(fryNeedHome(main)).toBe(false);
    main.nurseryBox = true;
    brood(main, NURSERY_FRY_CAPACITY, 0.6);
    main.fish.filter((f) => f.generation === 1).forEach((f) => (f.nursery = true));
    expect(fryNeedHome(main)).toBe(true);
  });
});
