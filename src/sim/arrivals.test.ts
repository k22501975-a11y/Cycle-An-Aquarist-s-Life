import { describe, expect, it } from 'vitest';
import {
  addFish,
  ARRIVAL_TRACK_DAYS,
  arrivalStatus,
  buyTank,
  carriedDiseases,
  createTank,
  economy,
  FILTERS,
  HEATERS,
  LIGHTS,
  linkTanks,
  marketItem,
  moveFish,
  receiveFish,
  recordEvent,
  sellFish,
  simulate,
  TANKS,
} from '.';

const tank = (seed = 3) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed });

/** 賣家出貨的魚資料：白點潛伏中（賣家缸裡有蟲）或健康。 */
function shippedItem(ich: boolean): Record<string, unknown> {
  const seller = tank(9);
  const f = addFish(seller, 'guppy', { carriesIch: false, carries: [], sex: 'male', strain: 0 });
  if (ich) f.ich = { stage: 'incubating', progress: 0 };
  return marketItem(f);
}

const bag = (t: ReturnType<typeof tank>) => ({ stress: 0.3, bagTemp: t.water.tempC, bagPh: t.water.ph, drip: true });

describe('到貨存活追蹤（L2，#76）', () => {
  it('收到市場買的魚記一筆；活過 30 天算存活', () => {
    const buyer = tank();
    const item = shippedItem(false);
    const fish = receiveFish(buyer, item, bag(buyer), 501)!;
    expect(fish.marketOrder).toBe(501);
    expect(economy(buyer).arrivals).toEqual([{ order: 501, fish: fish.id, hours: buyer.hours }]);
    const orders = [{ order: 501, carried: carriedDiseases(item) }, { order: 999, carried: [] }];
    const [st, none] = arrivalStatus([buyer], orders);
    expect(st).toMatchObject({ status: 'alive', days: 0, survived: false, sellerFault: false });
    expect(none.status).toBe('unknown');
    buyer.hours += (ARRIVAL_TRACK_DAYS + 1) * 24;
    expect(arrivalStatus([buyer], orders)[0]).toMatchObject({ status: 'alive', days: ARRIVAL_TRACK_DAYS + 1, survived: true });
  });

  it('死於出貨時就帶著的病算賣家的；買家自己養死的不算', () => {
    const buyer = tank();
    const sick = shippedItem(true);
    const healthy = shippedItem(false);
    expect(carriedDiseases(sick)).toEqual(['ich']);
    expect(carriedDiseases(healthy)).toEqual([]);
    const a = receiveFish(buyer, sick, bag(buyer), 1)!;
    const b = receiveFish(buyer, healthy, bag(buyer), 2)!;
    // 白點發病死掉；另一尾是缸裡氨太高死掉（跟 processes/fauna.ts 一樣記 fish_died）
    for (const [f, cause] of [[a, 'ich'], [b, 'ammonia']] as const) {
      f.alive = false;
      f.health = 0;
      recordEvent(buyer, { type: 'fish_died', subjectId: f.id, cause });
    }
    simulate(buyer, 1);
    const [ich, ammonia] = arrivalStatus([buyer], [
      { order: 1, carried: carriedDiseases(sick) },
      { order: 2, carried: carriedDiseases(healthy) },
    ]);
    expect(ich).toMatchObject({ status: 'died', cause: 'ich', diedDay: 0, sellerFault: true, survived: false });
    expect(ammonia).toMatchObject({ status: 'died', cause: 'ammonia', sellerFault: false, survived: false });
    // 帶不帶病看伺服器的出貨資料：買家說它帶病也沒用
    expect(arrivalStatus([buyer], [{ order: 2, carried: [] }])[0].sellerFault).toBe(false);
    // 死魚撈掉之後紀錄還在
    buyer.fish = buyer.fish.filter((f) => f.alive);
    simulate(buyer, 1);
    expect(arrivalStatus([buyer], [{ order: 1, carried: ['ich'] }])[0].status).toBe('died');
  });

  it('換到別缸照樣追；賣掉了記成不見（從這時候起不算）', () => {
    const home = tank();
    const tanks = [home];
    linkTanks(tanks);
    economy(home).coins = 99_999;
    const other = buyTank(tanks, 'std40')!;
    const fish = receiveFish(home, shippedItem(false), bag(home), 7)!;
    moveFish(home, other, fish.id);
    for (const t of tanks) simulate(t, 1);
    expect(arrivalStatus(tanks, [{ order: 7, carried: [] }])[0].status).toBe('alive');
    fish.lengthCm = 4;
    expect(sellFish(other, fish.id)).toBeGreaterThan(0);
    for (const t of tanks) simulate(t, 1);
    expect(arrivalStatus(tanks, [{ order: 7, carried: [] }])[0]).toMatchObject({ status: 'gone', survived: false, sellerFault: false });
  });

  it('沒有市場訂單編號的（出貨失敗退回自己缸）不記', () => {
    const t = tank();
    receiveFish(t, shippedItem(false), bag(t));
    expect(economy(t).arrivals).toBeUndefined();
  });
});
