import { describe, expect, it } from 'vitest';
import {
  addFish,
  addHardscape,
  bacteriaCapacity,
  CO2_KITS,
  createTank,
  FILTERS,
  HARDSCAPE,
  HEATERS,
  LIGHTS,
  removeHardscape,
  replaceSubstrate,
  simulate,
  SUBSTRATES,
  TANKS,
  waterChange,
  type CreateTankOptions,
  type TankState,
} from './index';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
};

const tank = (seed = 1) => createTank({ ...STARTER, roomTempC: 24, seed, matureMedia: true });
/** 每週換三成水（玩家的日常）。 */
const weeks = (s: TankState, n: number) => {
  for (let i = 0; i < n; i++) {
    simulate(s, 168);
    waterChange(s, 0.3);
  }
};

describe('底材', () => {
  it('石英砂不影響 KH', () => {
    const s = tank();
    s.equipment.substrate = { spec: SUBSTRATES.sand, sinceHours: 0, buffer: 1 };
    const kh = s.water.kh;
    simulate(s, 24 * 7);
    expect(Math.abs(s.water.kh - kh)).toBeLessThan(0.6);
  });

  it('水草泥把 KH 吸到很低、pH 變成弱酸', () => {
    const s = tank();
    replaceSubstrate(s, SUBSTRATES.soil);
    weeks(s, 2);
    simulate(s, 48);
    expect(s.water.kh).toBeLessThan(1.5);
    expect(s.water.ph).toBeLessThan(6.8);
  });

  it('新的水草泥前兩週會漏氨，之後就停了', () => {
    const s = createTank({ ...STARTER, roomTempC: 24, seed: 2 });
    s.bacteria.aob = s.bacteria.nob = 0;
    replaceSubstrate(s, SUBSTRATES.soil);
    let peak = 0;
    for (let h = 0; h < 72; h++) {
      simulate(s, 1);
      peak = Math.max(peak, s.water.tan);
    }
    expect(peak).toBeGreaterThan(0.2);
    const leachNow = SUBSTRATES.soil.ammoniaLeach.mgPerHour * Math.exp(-(s.hours - s.equipment.substrate!.sinceHours) / SUBSTRATES.soil.ammoniaLeach.decayHours);
    expect(leachNow).toBeLessThan(SUBSTRATES.soil.ammoniaLeach.mgPerHour * 0.8);
    s.hours += 24 * 40;
    const later = SUBSTRATES.soil.ammoniaLeach.mgPerHour * Math.exp(-(s.hours - s.equipment.substrate!.sinceHours) / SUBSTRATES.soil.ammoniaLeach.decayHours);
    expect(later).toBeLessThan(SUBSTRATES.soil.ammoniaLeach.mgPerHour * 0.02);
  });

  it('水草泥的緩衝力會隨換水慢慢耗盡（約半年到一年）', () => {
    const s = tank();
    replaceSubstrate(s, SUBSTRATES.soil);
    weeks(s, 12);
    const buffer = s.equipment.substrate!.buffer;
    expect(buffer).toBeLessThan(0.85);
    expect(buffer).toBeGreaterThan(0.4);
  });

  it('珊瑚砂把 KH、pH 拉高', () => {
    const s = tank();
    replaceSubstrate(s, SUBSTRATES.coral);
    simulate(s, 24 * 14);
    expect(s.water.kh).toBeGreaterThan(8);
    expect(s.water.ph).toBeGreaterThan(7.8);
  });

  it('換底材會翻出髒污、魚很緊迫、少掉一些細菌', () => {
    const s = tank();
    addFish(s, 'guppy', { carriesIch: false });
    const aob = s.bacteria.aob;
    replaceSubstrate(s, SUBSTRATES.sand);
    expect(s.bacteria.aob).toBeLessThan(aob);
    expect(s.fish[0].stress).toBeGreaterThanOrEqual(0.6);
  });
});

describe('造景石與沉木', () => {
  it('青龍石讓 KH 慢慢升高；開 CO₂ 溶得更快', () => {
    const run = (co2: boolean) => {
      const s = tank(3);
      if (co2) s.equipment.co2 = { spec: CO2_KITS.diy, on: true };
      addHardscape(s, HARDSCAPE.seiryu);
      addHardscape(s, HARDSCAPE.seiryu);
      const kh = s.water.kh;
      simulate(s, 24 * 10);
      return s.water.kh - kh;
    };
    const plain = run(false);
    expect(plain).toBeGreaterThan(0.8);
    expect(run(true)).toBeGreaterThan(plain);
  });

  it('火山石增加硝化菌的容量；拿出來就沒了', () => {
    const s = tank();
    const before = bacteriaCapacity(s);
    addHardscape(s, HARDSCAPE.lava);
    expect(bacteriaCapacity(s)).toBeGreaterThan(before);
    removeHardscape(s, 'lava');
    expect(bacteriaCapacity(s)).toBeCloseTo(before, 6);
  });

  it('沉木讓 KH 稍微下降', () => {
    const s = tank();
    addHardscape(s, HARDSCAPE.driftwood);
    const kh = s.water.kh;
    simulate(s, 24 * 7);
    const withWood = s.water.kh;
    const t = tank();
    simulate(t, 24 * 7);
    expect(withWood).toBeLessThan(t.water.kh);
    expect(kh - withWood).toBeLessThan(1.5);
  });
});
