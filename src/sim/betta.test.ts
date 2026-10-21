import { describe, expect, it } from 'vitest';
import { addFish, addPlant, computeStressors, createTank, FILTERS, HEATERS, isShrimpHunter, LIGHTS, step, TANKS } from '.';
import type { Fish, TankState } from '.';

const tank = (): TankState => {
  const t = createTank({ tank: TANKS.std90, filter: FILTERS.hangOn, heater: { spec: HEATERS.h100, targetC: 26 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed: 11 });
  t.water.tempC = t.water.tempAvgC = 26;
  return t;
};
const calm = (f: Fish) => {
  f.stress = 0;
  f.hunger = 0;
  return f;
};
const hours = (t: TankState, h: number) => {
  for (let i = 0; i < h * 60; i++) {
    step(t);
    if (i % 600 === 0) for (const f of t.fish) f.hunger = Math.min(f.hunger, 0.3);
  }
};

describe('鬥魚', () => {
  it('兩尾公鬥魚同缸：打輸的幾天內被打死，記下事件', () => {
    const t = tank();
    const a = calm(addFish(t, 'betta', { sex: 'male', carriesIch: false, carries: [] }));
    const b = calm(addFish(t, 'betta', { sex: 'male', carriesIch: false, carries: [] }));
    hours(t, 72);
    expect([a, b].filter((f) => f.alive)).toHaveLength(1);
    const dead = [a, b].find((f) => !f.alive)!;
    expect(t.events.some((e) => e.type === 'fish_died' && e.subjectId === dead.id && e.cause === 'fight')).toBe(true);
    expect(t.events.some((e) => e.type === 'betta_fight')).toBe(true);
  });

  it('一公一母不會打到死', () => {
    const t = tank();
    const m = calm(addFish(t, 'betta', { sex: 'male', carriesIch: false, carries: [] }));
    const f = calm(addFish(t, 'betta', { sex: 'female', carriesIch: false, carries: [] }));
    hours(t, 72);
    expect(m.alive && f.alive).toBe(true);
  });

  it('公鬥魚會咬孔雀魚公魚的長尾巴', () => {
    const t = tank();
    calm(addFish(t, 'betta', { sex: 'male', carriesIch: false, carries: [] }));
    const guppies = [0, 1, 2].map(() => calm(addFish(t, 'guppy', { sex: 'male', carriesIch: false, carries: [] })));
    hours(t, 24 * 4);
    expect(guppies.some((g) => (g.recentDamage.betta_attack ?? 0) > 0 || g.finDamage > 0.1)).toBe(true);
  });

  it('會獵蝦的鬥魚吃成蝦，水草多就抓不太到', () => {
    const run = (plants: number) => {
      const t = tank();
      let hunter = calm(addFish(t, 'betta', { sex: 'female', carriesIch: false, carries: [] }));
      while (!isShrimpHunter(hunter)) {
        t.fish = t.fish.filter((f) => f !== hunter);
        hunter = calm(addFish(t, 'betta', { sex: 'female', carriesIch: false, carries: [] }));
      }
      for (let i = 0; i < plants; i++) addPlant(t, 'anubias', 40);
      for (let i = 0; i < 20; i++) calm(addFish(t, 'cherry_shrimp', { carriesIch: false, pregnant: false }));
      hours(t, 24 * 6);
      return 20 - t.fish.filter((f) => f.species === 'cherry_shrimp').length;
    };
    const bare = run(0);
    const planted = run(8);
    expect(bare).toBeGreaterThanOrEqual(4);
    expect(planted).toBeLessThan(bare);
  });

  it('大約三成的鬥魚會獵蝦', () => {
    let n = 0;
    for (let id = 1; id <= 2000; id++) if (isShrimpHunter({ id } as Fish)) n++;
    expect(n / 2000).toBeGreaterThan(0.25);
    expect(n / 2000).toBeLessThan(0.35);
  });

  it('迷鰓魚：缺氧時鬥魚比孔雀魚輕鬆很多', () => {
    const t = tank();
    t.water.o2 = 1.5;
    const betta = addFish(t, 'betta', { sex: 'male', carriesIch: false, carries: [] });
    const guppy = addFish(t, 'guppy', { sex: 'male', carriesIch: false, carries: [] });
    expect(computeStressors(t, betta).oxygen).toBeLessThan(computeStressors(t, guppy).oxygen * 0.3);
  });
});

describe('水晶蝦', () => {
  it('27°C 以上撐不住，極火蝦沒事', () => {
    const t = tank();
    t.equipment.heater = { spec: HEATERS.h100, targetC: 29, broken: false, stuckOn: false } as never;
    t.water.tempC = t.water.tempAvgC = 29;
    t.environment.roomTempC = 30;
    const crystals = [0, 1, 2, 3].map(() => calm(addFish(t, 'crystal_shrimp', { carriesIch: false, pregnant: false })));
    const cherries = [0, 1, 2, 3].map(() => calm(addFish(t, 'cherry_shrimp', { carriesIch: false, pregnant: false })));
    hours(t, 24 * 5);
    expect(crystals.filter((f) => f.alive).length).toBeLessThan(2);
    expect(cherries.filter((f) => f.alive).length).toBeGreaterThanOrEqual(3);
  });
});
