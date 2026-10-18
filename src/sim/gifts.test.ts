import { describe, expect, it } from 'vitest';
import { applyMedia, createTank, economy, FILTERS, HEATERS, LIGHTS, mediaAvailable, packMedia, receiveCuttings, TANKS, takeCuttingsForGift, addCuttings } from '.';

const tank = (mature: boolean) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: mature, seed: 2 });

describe('好友互贈', () => {
  it('成熟濾材：送的人少一些菌、收的人多一些；新缸的濾材不能送', () => {
    expect(packMedia(tank(false))).toBeNull();
    const donor = tank(true);
    const before = donor.bacteria.aob;
    expect(mediaAvailable(donor)).toBeGreaterThan(0);
    const gift = packMedia(donor)!;
    expect(donor.bacteria.aob).toBeCloseTo(before - gift.bacteria);
    expect(gift.ich).toBe(false);
    const fresh = tank(false);
    applyMedia(fresh, gift);
    expect(fresh.bacteria.aob).toBeGreaterThan(gift.bacteria * 0.99);
    expect(fresh.water.ichCysts).toBe(0);
  });

  it('送的人缸裡有白點，濾材會帶蟲卵過去', () => {
    const donor = tank(true);
    donor.water.ichCysts = 3;
    const gift = packMedia(donor)!;
    expect(gift.ich).toBe(true);
    const fresh = tank(false);
    applyMedia(fresh, gift);
    expect(fresh.water.ichCysts).toBeGreaterThan(0);
  });

  it('插枝：送出從手上扣，不夠就不送；收到放回手上，不認得的水草不收', () => {
    const s = tank(true);
    addCuttings(s, 'rotala', 3);
    expect(takeCuttingsForGift(s, 'rotala', 5)).toBe(false);
    expect(takeCuttingsForGift(s, 'rotala', 2)).toBe(true);
    expect(economy(s).cuttings.rotala).toBe(1);
    expect(receiveCuttings(s, 'anubias', 4)).toBe(true);
    expect(economy(s).cuttings.anubias).toBe(4);
    expect(receiveCuttings(s, 'banana', 1)).toBe(false);
  });
});
