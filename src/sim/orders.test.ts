import { describe, expect, it } from 'vitest';
import {
  addFish,
  buyQuarantine,
  createTank,
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
  ORDER_BOARD_SIZE,
  ORDER_GAP_HOURS,
  orderBoard,
  orderRefusal,
  orderTitle,
  sellsLeftToday,
  simulate,
  TANKS,
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
});
