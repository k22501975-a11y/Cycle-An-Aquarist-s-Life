import { describe, expect, it } from 'vitest';
import {
  addCuttings,
  addFish,
  BILL_DAYS,
  createTank,
  DAILY_SELL_LIMIT,
  economy,
  FILTERS,
  HEATERS,
  LIGHTS,
  powerWatts,
  sellCuttings,
  sellFish,
  sellsLeftToday,
  simulate,
  spend,
  STARTING_COINS,
  TANKS,
  type CreateTankOptions,
} from './index';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
};

describe('魚幣與電費', () => {
  it('新遊戲有起始資金；錢不夠不能花', () => {
    const s = createTank({ ...STARTER, seed: 1 });
    expect(economy(s).coins).toBe(STARTING_COINS);
    expect(spend(s, STARTING_COINS + 1)).toBe(false);
    expect(spend(s, 500)).toBe(true);
    expect(economy(s).coins).toBe(STARTING_COINS - 500);
  });

  it('每週結算電費：冬天加熱棒常開，電費比較高', () => {
    const bill = (room: number) => {
      const s = createTank({ ...STARTER, roomTempC: room, seed: 2, matureMedia: true });
      economy(s);
      simulate(s, BILL_DAYS * 24 + 1);
      return s.events.find((e) => e.type === 'power_bill')!.count!;
    };
    const winter = bill(16);
    const autumn = bill(25);
    expect(autumn).toBeGreaterThan(3);
    expect(autumn).toBeLessThan(25);
    expect(winter).toBeGreaterThan(autumn * 2);
  });

  it('停電時不耗電', () => {
    const s = createTank({ ...STARTER, seed: 3 });
    expect(powerWatts(s)).toBeGreaterThan(0);
    s.environment.powerOut = true;
    expect(powerWatts(s)).toBe(0);
  });
});

describe('賣給水族店', () => {
  it('健康的成魚以店價三成賣出；仔魚和病魚不收', () => {
    const s = createTank({ ...STARTER, seed: 4 });
    const adult = addFish(s, 'guppy', { carriesIch: false });
    const fry = addFish(s, 'guppy', { carriesIch: false });
    fry.lengthCm = 1;
    const sick = addFish(s, 'guppy', { carriesIch: false });
    sick.ich = { stage: 'visible', progress: 0 };
    const before = economy(s).coins;
    expect(sellFish(s, fry.id)).toBe(0);
    expect(sellFish(s, sick.id)).toBe(0);
    expect(sellFish(s, adult.id)).toBe(18);
    expect(economy(s).coins).toBe(before + 18);
    expect(s.fish).not.toContain(adult);
  });

  it('每天有收購上限，隔天恢復', () => {
    const s = createTank({ ...STARTER, seed: 5 });
    for (let i = 0; i < DAILY_SELL_LIMIT + 2; i++) addFish(s, 'zebrafish', { carriesIch: false });
    let sold = 0;
    for (const f of [...s.fish]) if (sellFish(s, f.id) > 0) sold++;
    expect(sold).toBe(DAILY_SELL_LIMIT);
    expect(sellsLeftToday(s)).toBe(0);
    s.hours += 24;
    expect(sellsLeftToday(s)).toBe(DAILY_SELL_LIMIT);
  });

  it('插枝一次全部賣掉', () => {
    const s = createTank({ ...STARTER, seed: 6 });
    addCuttings(s, 'rotala', 5);
    const got = sellCuttings(s, 'rotala');
    expect(got).toBe(5 * 6);
    expect(economy(s).cuttings.rotala).toBe(0);
  });
});
