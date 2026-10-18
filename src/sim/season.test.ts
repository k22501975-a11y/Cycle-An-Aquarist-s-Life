import { describe, expect, it } from 'vitest';
import {
  addFish,
  CHILLERS,
  createTank,
  FANS,
  FILTERS,
  HEATERS,
  LIGHTS,
  monthOf,
  roomClimate,
  seasonName,
  simulate,
  TANKS,
  topUp,
  waterChange,
  waterLevelL,
  type CreateTankOptions,
} from './index';
import { applySeason, newGameState } from '../game/game';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
};

describe('季節室溫', () => {
  it('北部一月約 16°C、七月約 31.5°C，月中之間線性內插', () => {
    expect(roomClimate(0.5, 'north').meanC).toBeCloseTo(16, 1);
    expect(roomClimate(6.5, 'north').meanC).toBeCloseTo(31.5, 1);
    const mid = roomClimate(1, 'north').meanC; // 一月中到二月中之間
    expect(mid).toBeGreaterThan(16);
    expect(mid).toBeLessThan(16.5);
  });

  it('南部冬天比北部暖', () => {
    expect(roomClimate(0.5, 'south').meanC).toBeGreaterThan(roomClimate(0.5, 'north').meanC + 2);
  });

  it('冷氣房只壓住夏天，冬天照樣冷', () => {
    const summer = roomClimate(6.5, 'north', true);
    expect(summer.meanC).toBe(26.5);
    expect(summer.swingC).toBeLessThan(1);
    expect(roomClimate(0.5, 'north', true).meanC).toBeCloseTo(16, 1);
  });

  it('十二月底接回一月（年底不會跳）', () => {
    const dec = roomClimate(11.99, 'north').meanC;
    const jan = roomClimate(0.01, 'north').meanC;
    expect(Math.abs(dec - jan)).toBeLessThan(0.2);
  });

  it('季節名稱與現實日期換算', () => {
    expect(seasonName(monthOf(new Date(2026, 6, 15)))).toBe('夏天');
    expect(seasonName(monthOf(new Date(2026, 0, 3)))).toBe('冬天');
    expect(monthOf(new Date(2026, 9, 1))).toBeCloseTo(9, 1);
  });

  it('applySeason 依地區與冷氣房設定室溫', () => {
    const s = newGameState(1);
    applySeason(s, new Date(2026, 6, 15));
    expect(s.environment.roomTempC).toBeGreaterThan(30);
    s.environment.airConditioned = true;
    applySeason(s, new Date(2026, 6, 15));
    expect(s.environment.roomTempC).toBe(26.5);
  });
});

describe('夏天降溫設備', () => {
  it('風扇讓水溫比沒開時低約 2°C，但水蒸發得快很多', () => {
    const run = (fan: boolean) => {
      const s = createTank({ ...STARTER, heater: undefined, roomTempC: 31, seed: 3, matureMedia: true });
      if (fan) s.equipment.fan = { spec: FANS.clip, on: true };
      simulate(s, 72);
      return s;
    };
    const plain = run(false);
    const fanned = run(true);
    expect(plain.water.tempC - fanned.water.tempC).toBeGreaterThan(1.5);
    expect(waterLevelL(fanned)).toBeLessThan(waterLevelL(plain) - 0.5);
  });

  it('冷水機把 31°C 室溫的缸壓在設定溫度附近', () => {
    const s = createTank({ ...STARTER, heater: undefined, roomTempC: 31, seed: 4, matureMedia: true });
    s.equipment.chiller = { spec: CHILLERS.small, targetC: 25, on: true, cooling: false };
    simulate(s, 48);
    expect(s.water.tempC).toBeLessThan(25.6);
    expect(s.water.tempC).toBeGreaterThan(24.5);
  });

  it('停電時冷水機沒用', () => {
    const s = createTank({ ...STARTER, heater: undefined, roomTempC: 31, seed: 4, matureMedia: true });
    s.equipment.chiller = { spec: CHILLERS.small, targetC: 25, on: true, cooling: false };
    s.environment.powerOut = true;
    simulate(s, 48);
    expect(s.water.tempC).toBeGreaterThan(29);
  });
});

describe('控溫器與加熱棒', () => {
  it('加熱棒卡住時，控溫器在上限切斷電源並記一筆事件', () => {
    const s = createTank({ ...STARTER, roomTempC: 24, seed: 21, matureMedia: true });
    s.equipment.controller = { maxC: 29, tripped: false };
    s.equipment.heater!.broken = true;
    s.equipment.heater!.stuckOn = true;
    simulate(s, 48);
    expect(s.water.tempC).toBeLessThan(29.6);
    expect(s.events.some((e) => e.type === 'controller_cut')).toBe(true);
  });

  it('水位太低時加熱棒露出水面空燒會壞掉', () => {
    const s = createTank({ ...STARTER, roomTempC: 18, seed: 9, matureMedia: true });
    s.water.levelL = s.equipment.tank.volumeL * 0.7;
    simulate(s, 72);
    expect(s.equipment.heater!.broken).toBe(true);
    expect(s.events.some((e) => e.type === 'heater_exposed')).toBe(true);
  });
});

describe('蒸發與補水', () => {
  it('一週約蒸發 1%，溶解物跟著濃縮', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 5, matureMedia: true });
    s.water.no3 = 20;
    const kh = s.water.kh;
    simulate(s, 168);
    const level = waterLevelL(s) / s.equipment.tank.volumeL;
    expect(level).toBeLessThan(0.995);
    expect(level).toBeGreaterThan(0.98);
    expect(s.water.kh).toBeGreaterThan(kh * 0.999);
  });

  it('補水回到滿水位並稀釋濃縮的東西', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 5 });
    s.water.levelL = 36;
    s.water.tan = 1;
    const added = topUp(s);
    expect(added).toBeCloseTo(4, 5);
    expect(waterLevelL(s)).toBe(40);
    expect(s.water.tan).toBeCloseTo(0.9, 5);
    expect(topUp(s)).toBe(0);
  });

  it('換水順便補滿水位', () => {
    const s = createTank({ ...STARTER, roomTempC: 25, seed: 5 });
    s.water.levelL = 30;
    waterChange(s, 0.3);
    expect(waterLevelL(s)).toBe(40);
  });
});

describe('魚種適溫', () => {
  it('水溫低於孔雀魚適溫下限時不會懷孕', () => {
    const s = createTank({ ...STARTER, heater: undefined, roomTempC: 19, seed: 11, matureMedia: true });
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
    for (let i = 0; i < 2; i++) addFish(s, 'guppy', { carriesIch: false, sex: 'male' });
    simulate(s, 24 * 10, (st) => {
      for (const f of st.fish) f.hunger = 0;
    });
    expect(s.fish.filter((f) => f.pregnancy > 0)).toHaveLength(0);
  });

  it('超過致死溫度會死，在適溫內不會', () => {
    const hot = createTank({ ...STARTER, heater: undefined, roomTempC: 34, seed: 12, matureMedia: true });
    addFish(hot, 'cherry_shrimp', { carriesIch: false });
    simulate(hot, 24 * 7, (st) => st.fish.forEach((f) => (f.hunger = 0)));
    expect(hot.fish[0].alive).toBe(false);
    expect(hot.events.some((e) => e.type === 'fish_died' && e.cause === 'temperature')).toBe(true);
  });
});
