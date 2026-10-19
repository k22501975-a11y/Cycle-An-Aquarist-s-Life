import { describe, expect, it } from 'vitest';
import {
  addFish,
  addFishToQuarantine,
  buyQuarantine,
  createTank,
  doseAntibiotic,
  doseDewormer,
  doseQuarantine,
  FILTERS,
  HEATERS,
  infect,
  LIGHTS,
  NEWBIE_HEALTHY_DAYS,
  observeSymptoms,
  quarantineDays,
  releaseQuarantine,
  simulate,
  TANKS,
  type CreateTankOptions,
  type TankState,
} from './index';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 26 },
  light: { spec: LIGHTS.basic },
};

const fed = (st: TankState) => st.fish.forEach((f) => (f.hunger = 0));
const alive = (s: TankState) => s.fish.filter((f) => f.alive);

function tankWith(count: number, seed: number): TankState {
  const s = createTank({ ...STARTER, roomTempC: 24, seed, matureMedia: true });
  for (let i = 0; i < count; i++) addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
  return s;
}

describe('柱狀病', () => {
  it('潛伏約半天後發病，看得到白色棉絮狀的斑', () => {
    const s = tankWith(1, 1);
    infect(s.fish[0], 'columnaris');
    simulate(s, 4, fed);
    expect(observeSymptoms(s, s.fish[0])).not.toContain('white_patches');
    simulate(s, 12, fed);
    expect(observeSymptoms(s, s.fish[0])).toContain('white_patches');
    expect(s.events.some((e) => e.type === 'disease_visible' && e.cause === 'columnaris')).toBe(true);
  });

  it('不治療會傳染，幾天內死掉大半缸', () => {
    const s = tankWith(6, 2);
    infect(s.fish[0], 'columnaris');
    simulate(s, 24 * 6, fed);
    expect(alive(s).length).toBeLessThanOrEqual(3);
    expect(s.events.some((e) => e.type === 'fish_died' && e.cause === 'columnaris')).toBe(true);
  });

  it('發病後馬上下抗生素可以救回來，但硝化菌會少一些', () => {
    const s = tankWith(6, 2);
    infect(s.fish[0], 'columnaris');
    simulate(s, 16, fed);
    const aob = s.bacteria.aob;
    doseAntibiotic(s, 2);
    simulate(s, 24 * 6, fed);
    expect(alive(s).length).toBeGreaterThanOrEqual(5);
    expect(s.fish.every((f) => !f.infections?.length)).toBe(true);
    expect(s.bacteria.aob).toBeLessThan(aob * 0.95);
  });

  it('蝦不會得柱狀病', () => {
    const s = createTank({ ...STARTER, seed: 3 });
    const shrimp = addFish(s, 'cherry_shrimp', { carriesIch: false });
    infect(shrimp, 'columnaris');
    expect(shrimp.infections ?? []).toHaveLength(0);
  });
});

describe('鰓吸蟲', () => {
  it('發病時會浮頭喘氣，看起來像缺氧；驅蟲藥治得好', () => {
    const s = tankWith(2, 4);
    infect(s.fish[0], 'flukes');
    simulate(s, 72, fed);
    const sym = observeSymptoms(s, s.fish[0]);
    expect(sym).toContain('gasping');
    expect(sym).toContain('gill_flare');
    doseDewormer(s, 2);
    simulate(s, 72, fed);
    expect(s.fish[0].infections ?? []).toHaveLength(0);
    expect(s.fish[0].alive).toBe(true);
  });
});

describe('檢疫盒', () => {
  it('沒有檢疫盒時買魚直接進主缸', () => {
    const s = createTank({ ...STARTER, seed: 5 });
    addFishToQuarantine(s, 'guppy', { carriesIch: false });
    expect(s.fish).toHaveLength(1);
  });

  it('病魚在檢疫盒發作、死在盒子裡，主缸的魚沒事', () => {
    const s = tankWith(4, 6);
    buyQuarantine(s);
    addFishToQuarantine(s, 'guppy', { carriesIch: false, carries: ['columnaris'], sex: 'male' });
    expect(s.quarantine!.fish).toHaveLength(1);
    simulate(s, 24 * 5, fed);
    expect(s.quarantine!.fish[0].alive).toBe(false);
    expect(alive(s)).toHaveLength(4);
    expect(s.fish.every((f) => !f.infections?.length)).toBe(true);
  });

  it('在檢疫盒藥浴治好後移到主缸', () => {
    const s = tankWith(2, 7);
    buyQuarantine(s);
    const sick = addFishToQuarantine(s, 'guppy', { carriesIch: false, carries: ['columnaris'], sex: 'male' });
    simulate(s, 16, fed);
    expect(sick.infections![0].stage).toBe('visible');
    doseQuarantine(s, 'antibiotic');
    doseQuarantine(s, 'antibiotic');
    simulate(s, 24 * 3, fed);
    expect(sick.alive).toBe(true);
    expect(sick.infections ?? []).toHaveLength(0);
    expect(quarantineDays(s, sick)).toBeGreaterThan(3);
    expect(releaseQuarantine(s)).toBe(1);
    expect(s.fish).toContain(sick);
    expect(s.quarantine!.fish).toHaveLength(0);
  });

  it('白點在檢疫盒現形，下白點藥治好', () => {
    const s = tankWith(0, 8);
    buyQuarantine(s);
    const f = addFishToQuarantine(s, 'guppy', { carriesIch: true, carries: [] });
    simulate(s, 72, fed);
    expect(f.ich.stage).toBe('visible');
    doseQuarantine(s, 'ichMedication');
    simulate(s, 48, fed);
    expect(f.ich.stage).toBe('none');
  });
});

describe('新手期買的魚不帶細菌病（#118）', () => {
  it(`開缸 ${NEWBIE_HEALTHY_DAYS} 天內店裡的魚都不帶病；之後才會帶`, () => {
    const s = createTank({ ...STARTER, seed: 11 });
    for (let i = 0; i < 150; i++) addFish(s, 'guppy');
    expect(s.fish.every((f) => (f.infections ?? []).length === 0)).toBe(true);
    s.hours = NEWBIE_HEALTHY_DAYS * 24;
    for (let i = 0; i < 150; i++) addFish(s, 'guppy');
    expect(s.fish.some((f) => (f.infections ?? []).length > 0)).toBe(true);
  });
});
