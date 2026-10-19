import { describe, expect, it } from 'vitest';
import { addFish, feed, createTank, cureRefusal, FILTERS, freeAmmonia, HEATERS, infect, LIGHTS, linkTanks, mallBag, MAX_TANKS, placeMallTankset, setMallBag, step, TANKS, tanksetRefusal, useCure } from '.';
import type { TankState } from '.';

const home = (): TankState[] => {
  const t = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed: 5 });
  const tanks = [t];
  linkTanks(tanks);
  return tanks;
};

describe('商城道具', () => {
  it('背包照伺服器的庫存覆寫：沒列的道具是 0，不認得的道具不放', () => {
    const tanks = home();
    mallBag(tanks).tankset = 3;
    setMallBag(tanks, { cure: 2, nope: 5 });
    expect(mallBag(tanks)).toEqual({ cure: 2, tankset: 0 });
  });

  it('特效藥只治症狀：白點退回潛伏、水裡的蟲還在，不處理會再發', () => {
    const tanks = home();
    const [t] = tanks;
    const fish = addFish(t, 'guppy', { carriesIch: false });
    fish.ich = { stage: 'visible', progress: 0.2 };
    fish.health = 0.5;
    fish.recentDamage = { ich: 0.5 };
    t.water.ichPathogen = 5;
    expect(cureRefusal(tanks, fish)).toBe('背包裡沒有特效藥');
    setMallBag(tanks, { cure: 1 });
    expect(useCure(tanks, fish)).toBe(true);
    expect(fish.ich.stage).toBe('incubating');
    expect(fish.health).toBeCloseTo(0.8);
    expect(t.water.ichPathogen).toBe(5);
    expect(mallBag(tanks).cure).toBe(0);
    for (let i = 0; i < 60 * 48; i++) step(t);
    expect(fish.ich.stage).toBe('visible');
  });

  it('特效藥：發病退回潛伏期；水質造成的傷效果減半', () => {
    const tanks = home();
    const [t] = tanks;
    const sick = addFish(t, 'guppy', { carriesIch: false, carries: [] });
    infect(sick, 'columnaris');
    sick.infections![0] = { kind: 'columnaris', stage: 'visible', progress: 1 };
    sick.health = 0.4;
    sick.recentDamage = { columnaris: 0.6 };
    const poisoned = addFish(t, 'guppy', { carriesIch: false, carries: [] });
    poisoned.health = 0.4;
    poisoned.recentDamage = { ammonia: 0.6 };
    mallBag(tanks).cure = 2;
    useCure(tanks, sick);
    useCure(tanks, poisoned);
    expect(sick.infections![0].stage).toBe('latent');
    expect(sick.health).toBeCloseTo(0.7);
    expect(poisoned.health).toBeCloseTo(0.55);
  });

  it('沒事的魚、蝦不能用特效藥', () => {
    const tanks = home();
    mallBag(tanks).cure = 1;
    expect(cureRefusal(tanks, addFish(tanks[0], 'guppy', { carriesIch: false, carries: [] }))).toBe('這尾魚看起來沒事');
    const shrimp = addFish(tanks[0], 'cherry_shrimp');
    shrimp.health = 0.3;
    expect(cureRefusal(tanks, shrimp)).toBe('特效藥是給魚用的');
  });

  it('熟成套缸：濾材養好了，放 6 尾魚也不會爆氨', () => {
    const tanks = home();
    expect(tanksetRefusal(tanks)).toBe('背包裡沒有套缸');
    mallBag(tanks).tankset = 1;
    const t = placeMallTankset(tanks)!;
    expect(tanks).toHaveLength(2);
    expect(t.fish.filter((f) => f.alive)).toHaveLength(6);
    expect(t.fish.every((f) => f.ich.stage === 'none' && !(f.infections ?? []).length)).toBe(true);
    expect(t.plants).toHaveLength(4);
    expect(t.economy).toBe(tanks[0].economy);
    expect(mallBag(tanks).tankset).toBe(0);
    let peak = 0;
    for (let h = 0; h < 24 * 7; h++) {
      for (let i = 0; i < 60; i++) step(t);
      if (h % 12 === 0) feed(t, 60);
      peak = Math.max(peak, freeAmmonia(t));
    }
    expect(peak).toBeLessThan(0.03);
    expect(t.fish.filter((f) => f.alive).length).toBeGreaterThanOrEqual(5);
  });

  it('房間滿了不能擺套缸', () => {
    const tanks = home();
    mallBag(tanks).tankset = MAX_TANKS;
    while (tanks.length < MAX_TANKS) placeMallTankset(tanks);
    expect(tanksetRefusal(tanks)).toContain('最多');
    expect(placeMallTankset(tanks)).toBeNull();
  });
});
