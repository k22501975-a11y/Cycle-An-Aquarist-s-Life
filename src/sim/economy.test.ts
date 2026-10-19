import { describe, expect, it } from 'vitest';
import {
  addCuttings,
  addFish,
  BILL_DAYS,
  createTank,
  DAILY_SELL_LIMIT,
  economy,
  fishBuybackPrice,
  FISH_PRICES,
  GUPPY_FIN_STRAINS,
  GUPPY_STRAIN_PRICES,
  guppyBuybackTier,
  guppyRarity,
  isJuvenile,
  phenotype,
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
  it('健康的成魚賣得掉；仔魚和病魚不收', () => {
    const s = createTank({ ...STARTER, seed: 4 });
    const adult = addFish(s, 'guppy', { carriesIch: false });
    const fry = addFish(s, 'guppy', { carriesIch: false });
    fry.lengthCm = 1;
    const sick = addFish(s, 'guppy', { carriesIch: false });
    sick.ich = { stage: 'visible', progress: 0 };
    const before = economy(s).coins;
    expect(sellFish(s, fry.id)).toBe(0);
    expect(sellFish(s, sick.id)).toBe(0);
    const expected = fishBuybackPrice(adult);
    expect(expected).toBeGreaterThan(5);
    expect(sellFish(s, adult.id)).toBe(expected);
    expect(economy(s).coins).toBe(before + expected);
    expect(s.fish).not.toContain(adult);
  });

  it('孔雀魚收購價依稀有度分級：選育出的好魚是普通魚的 5～10 倍以上', () => {
    const base = { albino: false, gold: false, tuxedo: false, red: false, snake: false, grass: false, swallow: false, ribbon: false, dumbo: false, bigC: false, sword: 0, tailShape: 'round', finLength: 0.45 } as unknown as Parameters<typeof guppyBuybackTier>[0];
    const wild = guppyBuybackTier(base);
    expect(wild).toBeCloseTo(0.3);
    expect(guppyRarity(base)).toBe('common');
    expect(guppyBuybackTier({ ...base, tuxedo: true })).toBeCloseTo(0.6);
    expect(guppyRarity({ ...base, grass: true })).toBe('strain');
    const albinoSwallow = { ...base, albino: true, red: true, swallow: true };
    expect(guppyRarity(albinoSwallow)).toBe('rare');
    expect(guppyBuybackTier(albinoSwallow) / wild).toBeGreaterThanOrEqual(5);
    const bigC = { ...base, grass: true, ribbon: true, bigC: true };
    expect(guppyRarity(bigC)).toBe('prized');
    expect(guppyBuybackTier(bigC) / wild).toBeGreaterThanOrEqual(10);
  });

  it('中魚只收成魚的三成；其他魚約店價五成', () => {
    const s = createTank({ ...STARTER, seed: 8 });
    const adult = addFish(s, 'guppy', { carriesIch: false });
    const young = addFish(s, 'guppy', { carriesIch: false });
    young.genome = adult.genome;
    young.colorBoost = adult.colorBoost;
    young.lengthCm = 2.4;
    expect(isJuvenile(young)).toBe(true);
    expect(fishBuybackPrice(young)).toBe(Math.max(1, Math.round(fishBuybackPrice(adult) * 0.3)));
    const zebra = addFish(s, 'zebrafish', { carriesIch: false });
    zebra.colorBoost = 0;
    expect(fishBuybackPrice(zebra)).toBe(FISH_PRICES.zebrafish * 0.5);
  });

  it('店裡買來的成魚賣回去一定虧（不能低買高賣）', () => {
    const offers = [...GUPPY_STRAIN_PRICES.map((price, strain) => ({ strain, fin: undefined, price })), ...GUPPY_FIN_STRAINS.map((x) => ({ strain: x.strain, fin: x.fin, price: x.price }))];
    for (const o of offers) {
      for (let seed = 1; seed <= 5; seed++) {
        const s = createTank({ ...STARTER, seed });
        for (const sex of ['male', 'female'] as const) {
          const f = addFish(s, 'guppy', { carriesIch: false, sex, strain: o.strain, fin: o.fin });
          f.colorBoost = 1;
          expect(fishBuybackPrice(f), `${o.strain}/${o.fin ?? ''}/${sex}/${phenotype(f.genome!).tailShape}`).toBeLessThan(o.price);
        }
      }
    }
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
    expect(got).toBe(5 * 10);
    expect(economy(s).cuttings.rotala).toBe(0);
  });
});
