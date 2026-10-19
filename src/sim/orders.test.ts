import { describe, expect, it } from 'vitest';
import {
  addCuttings,
  addFish,
  addPlant,
  buyQuarantine,
  createTank,
  deliverableNow,
  dismissOrder,
  economy,
  FILTERS,
  fishMatchesOrder,
  fulfillOrder,
  HEATERS,
  LIGHTS,
  makeOrder,
  moveToQuarantine,
  ORDER_EXPIRE_DAYS,
  FRY_ORDER_MIN_BROOD,
  fryOrderSize,
  buyNurseryBox,
  moveToNursery,
  ORDER_BOARD_SIZE,
  ORDER_GAP_HOURS,
  orderBoard,
  orderContext,
  orderRefusal,
  orderTitle,
  sellsLeftToday,
  simulate,
  snailState,
  TANKS,
  trimPlant,
  updateOrders,
  type Fish,
  type ShopOrder,
  type TankState,
} from './index';

const tank = (seed = 3) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, seed, matureMedia: true });

function juveniles(s: TankState, n: number): Fish[] {
  return Array.from({ length: n }, () => {
    const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    f.lengthCm = 2.4;
    f.generation = 1;
    return f;
  });
}

const juvenileOrder = (s: TankState, count: number): ShopOrder => {
  const o: ShopOrder = { id: 999, kind: 'fish', species: 'guppy', size: 'juvenile', count, unitPrice: 45, postedHours: s.hours };
  orderBoard(s).orders = [o];
  return o;
};

describe('店家訂單板（M21）', () => {
  it('一開始就掛滿 3 張，都是新手交得出來的單（不會要指定品系、鰭型）', () => {
    const s = tank();
    simulate(s, 1);
    const board = orderBoard(s);
    expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
    for (const o of board.orders) {
      expect(o.strain).toBeUndefined();
      expect(o.fin).toBeUndefined();
      expect(o.unitPrice).toBeGreaterThan(0);
      expect(orderTitle(o)).toMatch(/^\d+ (尾|隻|株)/);
    }
  });

  it('交單：從所有缸湊魚，留下來的魚不交，錢一次給，不佔每天賣給店家的次數', () => {
    const a = tank();
    const b = tank(4);
    b.economy = economy(a);
    b.nextId = 10_000_001; // 每缸的魚 id 在不同區段（household.ts）
    const keep = juveniles(a, 2);
    juveniles(b, 2);
    const o = juvenileOrder(a, 3);
    const keepIds = keep.map((f) => f.id);
    expect(orderRefusal([a, b], o.id, keepIds)).toMatch(/還差 1/);
    juveniles(a, 1);
    const before = economy(a).coins;
    expect(fulfillOrder([a, b], o.id, keepIds)).toBe(3 * 45);
    expect(economy(a).coins).toBe(before + 135);
    expect(a.fish.filter((f) => keepIds.includes(f.id))).toHaveLength(2);
    expect(a.fish.length + b.fish.length).toBe(2);
    expect(sellsLeftToday(a)).toBe(10);
    expect(orderBoard(a).done).toBe(1);
  });

  it('交完或撕掉一張，隔天才補新單，最多 3 張', () => {
    const s = tank();
    simulate(s, 1);
    const board = orderBoard(s);
    expect(dismissOrder(s, board.orders[0].id)).toBe(true);
    simulate(s, ORDER_GAP_HOURS - 2);
    expect(board.orders).toHaveLength(ORDER_BOARD_SIZE - 1);
    simulate(s, 3);
    expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
    simulate(s, 48);
    expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
  });

  it('自己繁殖出品系、鰭型後才有指定的高價單，鰭型單每尾 150～400', () => {
    const s = tank();
    simulate(s, 1);
    const board = orderBoard(s);
    expect(Array.from({ length: 50 }, () => makeOrder(board, s.hours)).some((o) => o.fin || o.strain)).toBe(false);
    board.seen.push('strain:tuxedo', 'fin:swallow', 'adult:guppy');
    const later = Array.from({ length: 80 }, () => makeOrder(board, s.hours));
    const fins = later.filter((o) => o.fin);
    expect(fins.length).toBeGreaterThan(5);
    for (const o of fins) {
      expect(o.unitPrice).toBeGreaterThanOrEqual(150);
      expect(o.unitPrice).toBeLessThanOrEqual(400);
    }
    expect(later.some((o) => o.strain === 'tuxedo' && !o.fin)).toBe(true);
  });

  it('訂單用自己的亂數，不會改變模擬結果', () => {
    const a = tank(11);
    const b = structuredClone(a);
    for (let i = 0; i < 3; i++) for (const s of [a, b]) addFish(s, 'guppy', { carriesIch: false, carries: [] });
    simulate(a, 48);
    orderBoard(b).orders = [];
    orderBoard(b).lastChangeHours = b.hours;
    simulate(b, 48);
    expect(a.rng.seed).toBe(b.rng.seed);
    expect(a.fish.map((f) => f.lengthCm)).toEqual(b.fish.map((f) => f.lengthCm));
  });

  it('店裡買來的魚、蝦不能直接交單（不然買來就能高價轉賣）', () => {
    const s = tank();
    const bought = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    bought.lengthCm = 2.4;
    const o = juvenileOrder(s, 1);
    expect(fishMatchesOrder(bought, o)).toBe(false);
    expect(orderRefusal([s], o.id)).not.toBeNull();
    const shrimp = addFish(s, 'cherry_shrimp', { carriesIch: false, carries: [] });
    expect(fishMatchesOrder(shrimp, { ...o, species: 'cherry_shrimp' })).toBe(false);
    shrimp.generation = 1;
    expect(fishMatchesOrder(shrimp, { ...o, species: 'cherry_shrimp' })).toBe(true);
  });

  it(`掛了 ${ORDER_EXPIRE_DAYS} 天沒人交的單自動換掉（不用玩家自己撕）`, () => {
    const s = tank();
    simulate(s, 1);
    const board = orderBoard(s);
    const first = board.orders.map((o) => o.id);
    simulate(s, ORDER_EXPIRE_DAYS * 24 + 1);
    expect(board.orders.some((o) => first.includes(o.id))).toBe(false);
    expect(board.orders.length).toBeGreaterThan(0);
  });

  it('產卵盒裡的中魚也能拿去交單', () => {
    const s = tank();
    economy(s).coins = 10_000;
    buyQuarantine(s);
    for (const f of juveniles(s, 3)) moveToQuarantine(s, f.id);
    const o = juvenileOrder(s, 3);
    expect(orderRefusal([s], o.id)).toBeNull();
    expect(fulfillOrder([s], o.id)).toBe(135);
    expect(s.quarantine!.fish).toHaveLength(0);
  });

  describe('前期訂單（mvp.md §4.4.1）', () => {
    /** 清掉板子讓它重新掛單（新單照現在的缸況出題）。 */
    const refill = (s: TankState) => {
      const board = orderBoard(s);
      board.orders = [];
      board.lastChangeHours = undefined;
      updateOrders(s);
      return board.orders;
    };

    it('起步：還沒有自己繁殖的魚，板上至少一張修剪一下就交得出來的插枝單；修剪後交得掉', () => {
      const s = tank(5);
      s.fish = [];
      const plant = addPlant(s, 'rotala', 14);
      expect(orderContext(s).stage).toBe('start');
      const orders = refill(s);
      const easy = orders.find((o) => deliverableNow(s, o));
      expect(easy?.kind).toBe('cutting');
      expect(easy!.plant).toBe('rotala');
      expect(easy!.count * easy!.unitPrice).toBeGreaterThanOrEqual(40);
      expect(easy!.count * easy!.unitPrice).toBeLessThanOrEqual(120);
      // 修剪下來就能交
      addCuttings(s, 'rotala', trimPlant(s, plant.id));
      expect(orderRefusal([s], easy!.id)).toBeNull();
      expect(fulfillOrder([s], easy!.id)).toBe(easy!.count * easy!.unitPrice);
    });

    it('起步：餵太多長出來的扁卷螺可以交螺單，交掉的螺從缸裡拿走', () => {
      const s = tank(6);
      s.fish = [];
      snailState(s).pests.ramshorn = 12;
      const o: ShopOrder = { id: 900, kind: 'snail', snail: 'ramshorn', count: 5, unitPrice: 10, postedHours: s.hours };
      orderBoard(s).orders = [o];
      expect(orderTitle(o)).toBe('5 隻扁卷螺');
      expect(fulfillOrder([s], o.id)).toBe(50);
      expect(snailState(s).pests.ramshorn).toBe(7);
      snailState(s).pests.ramshorn = 2;
      const again: ShopOrder = { ...o, id: 901 };
      orderBoard(s).orders = [again];
      expect(orderRefusal([s], again.id)).toBe('缸裡的只有 2 隻，還差 3 隻');
    });

    it('第一窩：有仔魚就出小孔雀單，收 1.2 cm 以上自己繁殖的小魚（還沒到店家收購的大小也收）', () => {
      const s = tank(7);
      const fry = Array.from({ length: 10 }, (_, i) => {
        const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
        f.generation = 1;
        f.lengthCm = i < 6 ? 1.3 : 0.8;
        return f;
      });
      expect(orderContext(s).stage).toBe('brood');
      expect(orderContext(s).fry).toBe(10);
      const o: ShopOrder = { id: 902, kind: 'fry', species: 'guppy', minCm: 1.2, count: 5, unitPrice: 8, postedHours: s.hours };
      orderBoard(s).orders = [o];
      expect(orderTitle(o)).toBe('5 尾小孔雀，1.2 cm 以上');
      expect(fishMatchesOrder(fry[0], o)).toBe(true);
      expect(fishMatchesOrder(fry[9], o)).toBe(false);
      expect(fulfillOrder([s], o.id)).toBe(40);
      expect(s.fish.filter((f) => f.lengthCm >= 1.2)).toHaveLength(1);
    });

    it('選育階段（有中魚）照樣出中魚單；有剪得下來的水草時也留一張小額單', () => {
      const s = tank(8);
      juveniles(s, 4);
      addPlant(s, 'rotala', 14);
      expect(orderContext(s).stage).toBe('breeding');
      for (let i = 0; i < 5; i++) {
        const orders = refill(s);
        expect(orders.some((o) => o.kind === 'cutting' || o.kind === 'snail')).toBe(true);
        expect(orders.some((o) => o.kind === 'fry')).toBe(false);
      }
    });
  });

  describe('第一窩出生後的小額單（mvp.md §4.4.2 第 4 點）', () => {
    const brood = (s: TankState, n: number) =>
      Array.from({ length: n }, () => {
        const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
        f.lengthCm = 0.7;
        f.ageDays = 1;
        f.generation = 1;
        return f;
      });

    it('板子被中魚單佔滿也會換一張小額單上來', () => {
      const s = tank(5);
      simulate(s, 1);
      const board = orderBoard(s);
      board.orders = [0, 1, 2].map((i) => ({ id: 900 + i, kind: 'fish', species: 'guppy', size: 'juvenile', count: 3, unitPrice: 45, postedHours: s.hours }) as ShopOrder);
      brood(s, FRY_ORDER_MIN_BROOD + 4);
      simulate(s, ORDER_GAP_HOURS + 1);
      expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
      expect(board.orders.some((o) => o.kind !== 'fish')).toBe(true);
    });

    it('小孔雀單的數量：主缸裡的只算活得下來的一成五（草密多一點），盒子裡的算三成', () => {
      const s = tank(6);
      const fry = brood(s, 20);
      expect(fryOrderSize(orderContext(s))).toBeCloseTo(20 * (0.15 + 0.3 * orderContext(s).hiding!), 5);
      buyNurseryBox(s);
      for (const f of fry) moveToNursery(s, f.id);
      expect(orderContext(s).safeFry).toBe(20);
      expect(fryOrderSize(orderContext(s))).toBeCloseTo(6, 5);
    });
  });
});
