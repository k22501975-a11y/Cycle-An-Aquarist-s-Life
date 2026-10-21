import { describe, expect, it } from 'vitest';
import {
  addCuttings,
  addFish,
  buyQuarantine,
  buybackRefusal,
  createTank,
  economy,
  FILTERS,
  findListedFish,
  HEATERS,
  LIGHTS,
  listingFee,
  listingRefusal,
  listingTitle,
  marketItem,
  marketPayout,
  minFishPrice,
  packFish,
  receiveFish,
  receivePlants,
  suggestedFishPrice,
  suggestedPlantPrice,
  FISH_PRICES,
  GUPPY_STRAIN_PRICES,
  phenotype,
  TANKS,
  takeCuttingsForSale,
  unlistFish,
} from '.';

const tank = (seed = 3) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed });
const healthyGuppy = (t: ReturnType<typeof tank>, sex: 'male' | 'female' = 'male') => addFish(t, 'guppy', { carriesIch: false, carries: [], sex, strain: 0, pregnant: sex === 'female' });

describe('玩家市場', () => {
  it('上架費 1%（最少 1 元）、成交稅 8%', () => {
    expect(listingFee(50)).toBe(1);
    expect(listingFee(250)).toBe(3);
    expect(marketPayout(300)).toBe(276);
  });

  it('名稱寫出品系、公母和懷孕；最低售價是店家收購價，建議價約店價', () => {
    const t = tank();
    const male = healthyGuppy(t);
    expect(listingTitle(male)).toBe('藍草尾孔雀魚 公');
    const mom = healthyGuppy(t, 'female');
    expect(listingTitle(mom)).toMatch(/孔雀魚 母（懷孕）$/);
    expect(minFishPrice(male)).toBeGreaterThan(0);
    expect(suggestedFishPrice(male)).toBeGreaterThan(minFishPrice(male));
  });

  it('建議售價：普通品系約等於店價，自己選育的稀有品系高於店價', () => {
    const t = tank();
    const common = healthyGuppy(t);
    common.genome!.tail = 50;
    common.colorBoost = 0;
    expect(phenotype(common.genome!).albino || phenotype(common.genome!).gold).toBe(false);
    expect(Math.abs(suggestedFishPrice(common) - FISH_PRICES.guppy)).toBeLessThanOrEqual(10);
    const rare = healthyGuppy(t);
    rare.genome = { ...rare.genome!, albino: [1, 1], red: [1, 1], swallow: [1, 1], tail: 70 };
    expect(suggestedFishPrice(rare)).toBeGreaterThan(Math.max(...GUPPY_STRAIN_PRICES));
    expect(suggestedPlantPrice('anubias', 3)).toBe(150);
  });

  it('送的魚、生病的魚、太小的魚不能上架；上架中的魚不能賣給店家', () => {
    const t = tank();
    const f = healthyGuppy(t);
    expect(listingRefusal(f)).toBeNull();
    f.listing = 7;
    expect(listingRefusal(f)).toBe('已經上架了');
    expect(buybackRefusal(f)).toBe('已經在市場上架了');
    const gift = healthyGuppy(t);
    gift.gift = true;
    expect(listingRefusal(gift)).toMatch(/送的/);
    const sick = healthyGuppy(t);
    sick.ich = { stage: 'visible', progress: 1 };
    expect(listingRefusal(sick)).toMatch(/生病/);
    const fry = healthyGuppy(t);
    fry.lengthCm = 0.8;
    expect(listingRefusal(fry)).toMatch(/太小/);
  });

  it('出貨：從缸裡（或檢疫盒）撈出來；賣家缸裡有白點蟲在游會被帶上', () => {
    const a = tank(3);
    const b = tank(4);
    const f = healthyGuppy(b);
    f.listing = 11;
    b.water.ichPathogen = 0.5;
    expect(findListedFish([a, b], 11)?.tank).toBe(b);
    const ship = packFish([a, b], 11)!;
    expect(b.fish.includes(f)).toBe(false);
    expect(ship.item.listing).toBeUndefined();
    expect((ship.item.ich as { stage: string }).stage).toBe('incubating');
    expect(ship.bagTemp).toBeCloseTo(b.water.tempC);
    expect(packFish([a, b], 11)).toBeNull();

    buyQuarantine(a);
    const q = healthyGuppy(a);
    a.fish = a.fish.filter((x) => x !== q);
    a.quarantine!.fish.push(q);
    q.listing = 12;
    expect(packFish([a], 12)).not.toBeNull();
    expect(a.quarantine!.fish).toHaveLength(0);
  });

  it('死掉的魚不能出貨；取消上架會拿掉標記', () => {
    const t = tank();
    const f = healthyGuppy(t);
    f.listing = 5;
    f.alive = false;
    expect(packFish([t], 5)).toBeNull();
    expect(unlistFish([t], 5)).toBe(true);
    expect(f.listing).toBeUndefined();
  });

  it('收貨：新編號、自成血統，基因和懷孕跟著來；有檢疫盒就先放檢疫盒', () => {
    const seller = tank(5);
    const mom = healthyGuppy(seller, 'female');
    mom.pregnancy = 0.5;
    const item = marketItem(mom);
    const buyer = tank(6);
    const got = receiveFish(buyer, item, { stress: 0.3, bagTemp: buyer.water.tempC, bagPh: buyer.water.ph, drip: true })!;
    expect(buyer.fish).toContain(got);
    expect(got.lineage).toBe(got.id);
    expect(got.genome).toEqual(mom.genome);
    expect(got.pregnancy).toBeCloseTo(0.5);
    expect(got.sire?.lineage).toBe(-got.id);
    expect(got.stress).toBeCloseTo(0.3);

    buyQuarantine(buyer);
    const q = receiveFish(buyer, item, { stress: 0.3, bagTemp: buyer.water.tempC, bagPh: buyer.water.ph, drip: true })!;
    expect(buyer.quarantine!.fish).toContain(q);
  });

  it('直接倒入：水溫、pH 差越多越緊迫；慢慢對水就不會', () => {
    const buyer = tank(7);
    const item = marketItem(healthyGuppy(tank(8)));
    const arrival = { stress: 0.2, bagTemp: buyer.water.tempC - 4, bagPh: buyer.water.ph - 1 };
    const dumped = receiveFish(buyer, item, { ...arrival, drip: false })!;
    const dripped = receiveFish(buyer, item, { ...arrival, drip: true })!;
    expect(dumped.stress).toBeGreaterThan(dripped.stress + 0.3);
  });

  it('收貨會檢查資料，不認得的魚種不收、數值會被限制在合理範圍', () => {
    const buyer = tank();
    expect(receiveFish(buyer, { species: 'shark' }, { stress: 0.2, bagTemp: 25, bagPh: 7, drip: true })).toBeNull();
    const f = receiveFish(buyer, { species: 'zebrafish', health: 99, lengthCm: -3 }, { stress: 0.2, bagTemp: 25, bagPh: 7, drip: true })!;
    expect(f.health).toBe(1);
    expect(f.lengthCm).toBeGreaterThan(0);
  });

  it('插枝：上架時從手上拿走，收到時加進手上', () => {
    const t = tank();
    addCuttings(t, 'rotala', 4);
    expect(takeCuttingsForSale(t, 'rotala', 5)).toBe(false);
    expect(takeCuttingsForSale(t, 'rotala', 3)).toBe(true);
    expect(economy(t).cuttings.rotala).toBe(1);
    expect(receivePlants(t, { species: 'rotala', count: 3 })).toBe(true);
    expect(economy(t).cuttings.rotala).toBe(4);
    expect(receivePlants(t, { species: 'kelp', count: 3 })).toBe(false);
  });
});
