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
  GAP_FRY_MIN_DAYS,
  GAP_PEST_COUNT,
  SNAIL_BREEDERS,
  linkTanks,
  PLANT_PRICES,
  SNAILS,
  INCOME_GAP_DAYS,
  incomeGapOrder,
  reachableInTime,
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

    it('開局板上全是中魚單：缸裡抓得到螺了，隔天換一張交得出來的（遊戲性 g9）', () => {
      const s = tank(8);
      simulate(s, 1);
      const board = orderBoard(s);
      board.orders = [0, 1, 2].map((i) => ({ id: 950 + i, kind: 'fish', species: 'guppy', size: 'juvenile', count: 3, unitPrice: 45, postedHours: s.hours }) as ShopOrder);
      snailState(s).pests.bladder = 6;
      simulate(s, ORDER_GAP_HOURS + 1);
      expect(board.orders.some((o) => deliverableNow(s, o))).toBe(true);
    });

    it('仔魚才剛生：新出的魚單都要在期限內湊得齊，不會一掛上去就「來不及」（#281）', () => {
      const s = tank(7);
      simulate(s, 1);
      const board = orderBoard(s);
      board.orders = [];
      const fry = brood(s, 12);
      const seen = new Set<number>();
      // 每小時看一次：剛掛上去的那一刻要湊得齊（之後魚沒吃飽長得慢，是另一回事）
      for (let hour = 0; hour < 20 * 24; hour++) {
        for (const o of board.orders) {
          if (seen.has(o.id)) continue;
          seen.add(o.id);
          expect(reachableInTime([s], o), orderTitle(o)).toBe(true);
        }
        for (const f of fry) f.hunger = 0;
        simulate(s, 1);
      }
      expect(orderContext(s).stage).not.toBe('start');
      expect(seen.size).toBeGreaterThan(2);
    });

    it('板上掛著期限內湊不齊的中魚單：有別的單可以出時，隔天換掉最舊的那張，其他單不動（#281）', () => {
      const s = tank(9);
      simulate(s, 1);
      const board = orderBoard(s);
      brood(s, FRY_ORDER_MIN_BROOD + 4);
      const small: ShopOrder = { id: 990, kind: 'fry', species: 'guppy', minCm: 1.2, count: 3, unitPrice: 10, postedHours: s.hours };
      const dead = [0, 1].map((i) => ({ id: 980 + i, kind: 'fish', species: 'guppy', size: 'juvenile', count: 3, unitPrice: 45, postedHours: s.hours - i }) as ShopOrder);
      board.orders = [dead[0], small, dead[1]];
      board.lastChangeHours = s.hours;
      snailState(s).pests.bladder = 12;
      expect(dead.every((o) => !reachableInTime([s], o))).toBe(true);
      simulate(s, ORDER_GAP_HOURS + 1);
      expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
      expect(board.orders[1]).toBe(small);
      expect(board.orders.filter((o) => !reachableInTime([s], o)).length).toBeLessThan(2);
    });

    it('板子交空了、又沒有期限內湊得齊的魚單：隔天用缸裡的仔魚出一張小單，不會一直空著（#292）', () => {
      const s = tank(11);
      simulate(s, 1);
      const board = orderBoard(s);
      const fry = brood(s, 4);
      for (const f of fry) f.bornHours = s.hours - 8 * 24;
      board.orders = [];
      board.lastChangeHours = s.hours;
      for (const f of fry) f.hunger = 0;
      simulate(s, ORDER_GAP_HOURS + 1);
      expect(board.orders).toHaveLength(1);
      expect(deliverableNow(s, board.orders[0])).toBe(true);
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

describe('收入空檔保底（polish-to-9.md §4）', () => {
  const fishOnly = (s: TankState) => {
    const board = orderBoard(s);
    board.orders = [0, 1, 2].map((i) => ({ id: 900 + i, kind: 'fish', species: 'guppy', size: 'juvenile', count: 3, unitPrice: 50, postedHours: s.hours - i } as ShopOrder));
    board.lastChangeHours = s.hours;
    return board;
  };
  /** 一株長到剪得下 2 株插枝的小榕（自己缸裡長出來的）。 */
  const grown = (s: TankState) => addPlant(s, 'anubias', 20);

  it(`連續 ${INCOME_GAP_DAYS} 天沒有賣東西或交單，板上換一張用缸裡長出來的東西就交得出來的小單；交了就重算`, () => {
    const s = tank();
    s.hours = 20 * 24 + 8;
    const e = economy(s);
    const plant = grown(s);
    const board = fishOnly(s);
    e.lastEarnedDay = 20 - INCOME_GAP_DAYS + 1;
    updateOrders(s);
    expect(board.orders.some((o) => o.gap)).toBe(false);
    e.lastEarnedDay = 20 - INCOME_GAP_DAYS;
    // 每個遊戲小時最多查一次
    updateOrders(s);
    expect(board.orders.some((o) => o.gap)).toBe(false);
    s.hours += 1;
    updateOrders(s);
    expect(board.orders).toHaveLength(ORDER_BOARD_SIZE);
    const gap = board.orders.find((o) => o.gap)!;
    expect(gap.kind).toBe('cutting');
    // 每株不超過店售價（一盆的三分之一）
    expect(gap.unitPrice).toBeLessThanOrEqual(PLANT_PRICES.anubias / 3);
    addCuttings(s, 'anubias', trimPlant(s, plant.id));
    expect(fulfillOrder([s], gap.id)).toBeGreaterThan(0);
    expect(e.lastEarnedDay).toBe(20);
  });

  it('只收自己缸裡長出來、生出來的：手上的插枝（寶箱、買來、別人送的）不算；什麼都沒有就不出保底單', () => {
    const s = tank();
    s.hours = 20 * 24 + 8;
    const e = economy(s);
    addCuttings(s, 'anubias', 2);
    e.chestCuttings = { anubias: 1 };
    // 剛買的水草還沒長，剪不下來
    addPlant(s, 'rotala');
    const board = fishOnly(s);
    e.lastEarnedDay = 0;
    expect(incomeGapOrder([s], board)).toBeNull();
    updateOrders(s);
    expect(board.orders.map((o) => o.id)).toEqual([900, 901, 902]);
  });

  it('小螺（一張最多 5 隻，留 2 隻種螺）、小蘋果螺或出生滿 7 天的仔魚也行（擇一），每份不超過店售價', () => {
    const s = tank();
    s.hours = 20 * 24 + 8;
    // 只剩種螺不收
    snailState(s).pests.ramshorn = SNAIL_BREEDERS;
    expect(incomeGapOrder([s], orderBoard(s))).toBeNull();
    snailState(s).pests.ramshorn = 4;
    expect(incomeGapOrder([s], orderBoard(s))!.count).toBe(4 - SNAIL_BREEDERS);
    snailState(s).pests.ramshorn = 8;
    const o = incomeGapOrder([s], orderBoard(s))!;
    expect(o.kind).toBe('snail');
    expect(o.count).toBe(GAP_PEST_COUNT);
    expect(o.count * o.unitPrice).toBe(40);
    expect(deliverableNow(s, o)).toBe(true);
    snailState(s).pests.ramshorn = 0;
    snailState(s).appleYoung = 4;
    const apple = incomeGapOrder([s], orderBoard(s))!;
    expect(apple.snail).toBe('appleYoung');
    expect(apple.unitPrice).toBeLessThanOrEqual(SNAILS.apple.price);
    snailState(s).appleYoung = 0;
    const baby = juveniles(s, 3);
    // 剛出生的魚苗店家不收
    for (const f of baby) Object.assign(f, { lengthCm: 0.8, bornHours: s.hours - 3 * 24 });
    expect(incomeGapOrder([s], orderBoard(s))).toBeNull();
    for (const f of baby) f.bornHours = s.hours - GAP_FRY_MIN_DAYS * 24;
    const fry = incomeGapOrder([s], orderBoard(s))!;
    expect(fry.kind).toBe('fry');
    expect(fry.count).toBe(2);
    expect(fry.unitPrice).toBeGreaterThanOrEqual(5);
    expect(fry.unitPrice).toBeLessThanOrEqual(8);
    expect(deliverableNow(s, fry)).toBe(true);
    expect(fulfillOrder([s], fry.id)).toBe(0); // 還沒掛上板
    orderBoard(s).orders.push(fry);
    expect(fulfillOrder([s], fry.id)).toBe(fry.count * fry.unitPrice);
    // 店裡買的魚（第 0 代）生出來以前不算
    for (const f of baby) f.generation = 0;
    expect(incomeGapOrder([s], orderBoard(s))).toBeNull();
  });

  it(`一直不交保底單：不會卡住，每 ${INCOME_GAP_DAYS} 天換一張新的，板上同時只有一張`, () => {
    const s = tank();
    s.hours = 20 * 24 + 8;
    const e = economy(s);
    grown(s);
    snailState(s).pests.bladder = 8;
    fishOnly(s);
    e.lastEarnedDay = 0;
    const seen: number[] = [];
    for (let h = 0; h < 30 * 24; h++) {
      s.hours += 1;
      updateOrders(s);
      const gaps = orderBoard(s).orders.filter((o) => o.gap);
      expect(gaps.length).toBeLessThanOrEqual(1);
      if (gaps[0] && !seen.includes(gaps[0].id)) seen.push(gaps[0].id);
    }
    // 30 天裡每 6 天換一張：至少 5 張不同的保底單，而且隨時都有一張
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(orderBoard(s).orders.some((o) => o.gap)).toBe(true);
  });

  it('訂單板全家共用：每小時查一次時看所有缸，第一缸沒東西、第二缸有剪得下來的草也會出保底單', () => {
    const a = tank(3);
    const b = tank(4);
    a.hours = b.hours = 20 * 24 + 8;
    linkTanks([a, b]);
    const board = fishOnly(a);
    economy(a).lastEarnedDay = 0;
    grown(b);
    // 第一缸先查這一小時（看的是所有缸），第二缸同一小時就不再查
    updateOrders(a);
    updateOrders(b);
    const gap = board.orders.find((o) => o.gap)!;
    expect(gap.kind).toBe('cutting');
    expect(board.orders.filter((o) => o.gap)).toHaveLength(1);
    addCuttings(a, 'anubias', trimPlant(b, b.plants.at(-1)!.id));
    expect(fulfillOrder([a, b], gap.id)).toBeGreaterThan(0);
  });

  it('舊存檔沒有最後收入的天數：從讀檔那天開始算，不會一更新就出保底單', () => {
    const s = tank();
    s.hours = 40 * 24 + 8;
    const e = economy(s);
    grown(s);
    const board = fishOnly(s);
    delete e.lastEarnedDay;
    updateOrders(s);
    expect(e.lastEarnedDay).toBe(40);
    expect(board.orders.some((o) => o.gap)).toBe(false);
  });
});
