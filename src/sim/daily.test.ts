import { describe, expect, it } from 'vitest';
import { blankGameState, newGameState } from '../game/game';
import { doDailyTask, everythingTank, richTank } from '../game/daily-player';
import {
  addHardscape,
  BIG_CHEST_DAYS,
  BIG_CHEST_PLANTS,
  CHEST_CAP_DAY,
  CHEST_COINS_CAP,
  CHEST_DRY_DAYS,
  noteEarned,
  chestCuttingsOf,
  orderSupply,
  PLANT_SPECIES,
  plantBuybackPrice,
  sellableCuttings,
  sellCuttings,
  takeCutting,
  takeCuttingsForGift,
  takeCuttingsForSale,
  addCuttings,
  type PlantSpeciesId,
  BILL_DAYS,
  CHEST_COINS_MAX,
  CHEST_COINS_MIN,
  CHEST_FOOD_MEALS,
  CHEST_PLANTS,
  CHEST_POOL,
  DAILY_CATEGORY,
  DAILY_COST,
  DAILY_COUNT,
  DAILY_IDS,
  DAILY_TEXT,
  placeHardscape,
  canClaimDaily,
  claimDaily,
  dailyTasks,
  economy,
  eligibleDaily,
  feed,
  HARDSCAPE,
  markDaily,
  rollChest,
  simulate,
  updateDaily,
  updateEconomy,
  useTestKit,
  waterChange,
  type ChestItem,
  type DailyCategory,
  type DailyTaskId,
} from '.';

describe('每日 3 件小事（F3）', () => {
  it('還沒開缸不出題；開完缸出不重複的題目，只出做得到的', () => {
    const blank = blankGameState(1);
    expect(updateDaily([blank])).toEqual([]);
    expect(dailyTasks([blank])).toBeNull();
    const s = newGameState(1);
    updateDaily([s]);
    const ids = dailyTasks([s])!.tasks.map((t) => t.id);
    expect(ids).toHaveLength(DAILY_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
    // 剛開缸沒魚、沒螺、沒水草也沒石頭：只出測水、看設備、看趨勢、翻圖鑑這種隨時做得到的
    for (const id of ids) expect(['test', 'gear', 'records', 'codex']).toContain(id);
  });

  it('不出做不到的題目：沒魚不出餵食、沒螺不出找螺、草沒長長不出修剪', () => {
    const s = newGameState(1);
    expect(eligibleDaily([s])).not.toContain('feed');
    expect(eligibleDaily([s])).not.toContain('snail');
    expect(eligibleDaily([s])).not.toContain('trim');
    const rich = richTank();
    const ok = eligibleDaily([rich]);
    for (const id of ['feed', 'observe', 'plant', 'snail', 'test', 'trim', 'water'] as const) expect(ok).toContain(id);
    // 沒有蝦、育幼盒、插枝、螺卵、死螺；小螺太少撈不到
    for (const id of ['shrimp', 'nursery', 'cuttings', 'clutch', 'deadSnail', 'pests'] as const) expect(ok).not.toContain(id);
    // 剛換過水就不出換水
    waterChange(rich, 0.3);
    expect(eligibleDaily([rich])).not.toContain('water');
  });

  it('出題前做的不算，出題後做完三件可以開寶箱，只能領一次', () => {
    const s = richTank();
    const tanks = [s];
    useTestKit(s);
    feed(s, 5);
    updateDaily(tanks);
    expect(dailyTasks(tanks)!.tasks.every((t) => !t.done)).toBe(true);
    simulate(s, 1);
    const ids = dailyTasks(tanks)!.tasks.map((t) => t.id);
    expect(ids).toHaveLength(3);
    for (const id of ids.slice(0, 2)) doDailyTask(tanks, id);
    expect(updateDaily(tanks)).toEqual(ids.slice(0, 2));
    expect(canClaimDaily(tanks)).toBe(false);
    doDailyTask(tanks, ids[2]);
    expect(updateDaily(tanks)).toEqual([ids[2]]);
    const coins = economy(s).coins;
    const got = claimDaily(tanks)!;
    expect(got.text.length).toBeGreaterThan(0);
    expect(economy(s).coins).toBe(coins + got.coins);
    expect(claimDaily(tanks)).toBeNull();
  });

  it('隔天換新題目，昨天沒做完的就算了', () => {
    const s = richTank();
    updateDaily([s]);
    const first = dailyTasks([s])!;
    simulate(s, 24);
    updateDaily([s]);
    const next = dailyTasks([s])!;
    expect(next.day).toBe(first.day + 1);
    expect(next.claimed).toBe(false);
    expect(next.tasks.every((t) => !t.done)).toBe(true);
  });

  it('多缸時在哪一缸做都算', () => {
    const a = richTank();
    const b = richTank();
    const tanks = [a, b];
    updateDaily(tanks);
    const d = dailyTasks(tanks)!;
    d.tasks = [{ id: 'test', done: false }];
    useTestKit(b);
    expect(updateDaily(tanks)).toEqual(['test']);
  });

  it('收掉一缸不會讓題目自動完成', () => {
    const a = richTank();
    const b = richTank();
    useTestKit(a);
    feed(a, 5);
    simulate(b, 1);
    useTestKit(b);
    feed(b, 5);
    const tanks = [a, b];
    updateDaily(tanks);
    const d = dailyTasks(tanks)!;
    d.tasks = [{ id: 'test', done: false }, { id: 'feed', done: false }];
    // 最後一次測水、餵食在 b 缸；收掉 b 之後最後時間變早，不算做了
    tanks.pop();
    expect(updateDaily(tanks)).toEqual([]);
    // 之後在 a 缸再測一次（比出題時 b 缸那次晚）才算
    simulate(a, 2);
    useTestKit(a);
    expect(updateDaily(tanks)).toEqual(['test']);
  });

  it('同一天讀檔重算，題目一樣', () => {
    const a = richTank();
    const b = structuredClone(a);
    updateDaily([a]);
    updateDaily([b]);
    expect(dailyTasks([a])!.tasks).toEqual(dailyTasks([b])!.tasks);
  });

  it('小事不要花錢（mvp.md §4.4.2，#188）：三件加起來的花費一定比寶箱最少的魚幣少，不會要買新石頭', () => {
    const costs = Object.values(DAILY_COST).sort((a, b) => b - a);
    expect(costs.slice(0, DAILY_COUNT).reduce((a, b) => a + b, 0)).toBeLessThan(CHEST_COINS_MIN);
    // 錢花光了也照樣出「移動造景」
    const s = richTank();
    addHardscape(s, HARDSCAPE.lava);
    economy(s).coins = 0;
    expect(eligibleDaily([s])).toContain('scape');
  });

  it('移動現有的石頭或沉木就算完成，出題前移的不算', () => {
    const s = newGameState(4);
    addHardscape(s, HARDSCAPE.lava);
    s.hours = 24 * 3 + 8;
    placeHardscape(s, 0, { x: 0.2 });
    economy(s).daily = undefined;
    updateDaily([s]);
    const d = dailyTasks([s])!;
    d.tasks = [{ id: 'scape', done: false }];
    updateDaily([s]);
    expect(d.tasks[0].done).toBe(false);
    s.hours += 1;
    placeHardscape(s, 0, { x: 0.7 });
    expect(updateDaily([s])).toEqual(['scape']);
  });
});

describe('每日小事題庫（polish-to-9.md U6）', () => {
  it('至少 20 題，照顧、觀察、造景、整理每類至少 5 題，每題都有說明、都不花錢（短字和圖示在 ui/daily-card.test.ts）', () => {
    expect(DAILY_IDS.length).toBeGreaterThanOrEqual(20);
    const per = new Map<DailyCategory, number>();
    for (const id of DAILY_IDS) per.set(DAILY_CATEGORY[id], (per.get(DAILY_CATEGORY[id]) ?? 0) + 1);
    for (const c of ['care', 'observe', 'scape', 'tidy'] as const) expect(per.get(c), c).toBeGreaterThanOrEqual(5);
    for (const id of DAILY_IDS) {
      expect(DAILY_TEXT[id], id).toBeTruthy();
      expect(DAILY_COST[id], id).toBeLessThan(CHEST_COINS_MIN / DAILY_COUNT);
    }
  });

  it('每一題出題後照做就算完成，沒做不算', () => {
    for (const id of DAILY_IDS) {
      const s = everythingTank();
      const tanks = [s];
      expect(eligibleDaily(tanks), id).toContain(id);
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id, done: false }];
      expect(updateDaily(tanks), id).toEqual([]);
      s.hours += 1;
      doDailyTask(tanks, id);
      expect(updateDaily(tanks), id).toEqual([id]);
    }
  });

  it('造景題只在有石頭或沉木時出；擺新石頭要手上有寶箱開到的', () => {
    const s = richTank();
    const scape = (ids: DailyTaskId[]) => ids.filter((id) => DAILY_CATEGORY[id] === 'scape');
    // 只有水草沒有石頭：不出造景題
    expect(scape(eligibleDaily([s]))).toEqual([]);
    economy(s).hardscapeBag = ['lava'];
    expect(scape(eligibleDaily([s])).sort()).toEqual(['scapePlace', 'scapePlant']);
    // 擺進缸裡（免費）：手上沒了，換成移動、翻面、換層、縮放
    const coins = economy(s).coins;
    doDailyTask([s], 'scapePlace');
    expect(economy(s).coins).toBe(coins);
    expect(s.equipment.hardscape?.map((x) => x.id)).toEqual(['lava']);
    expect(scape(eligibleDaily([s])).sort()).toEqual(['scape', 'scapeFlip', 'scapeLayer', 'scapePlant', 'scapeScale']);
  });
});

describe('寶箱獎勵池（polish-to-9.md U5）', () => {
  it('同一天同一個種子開出一樣的東西；機率照獎勵池', () => {
    expect(rollChest(12, 345, false)).toEqual(rollChest(12, 345, false));
    const n = 20000;
    const count = new Map<ChestItem, number>();
    for (let i = 0; i < n; i++) {
      const got = rollChest(i, i * 7919 + 13, false);
      const item = got.item ?? 'coins';
      count.set(item, (count.get(item) ?? 0) + 1);
      if (item === 'coins') {
        expect(got.coins).toBeGreaterThanOrEqual(CHEST_COINS_MIN);
        expect(got.coins).toBeLessThanOrEqual(CHEST_COINS_MAX);
      } else expect(got.coins).toBe(0);
      if (item === 'plant') expect(CHEST_PLANTS).toContain(got.itemId);
      if (item === 'hardscape') expect(['lava', 'slate', 'driftwood']).toContain(got.itemId);
    }
    for (const p of CHEST_POOL) expect(Math.abs((count.get(p.item) ?? 0) / n - p.weight), p.item).toBeLessThan(0.015);
  });

  it('開到的東西放進手上：石頭沉木到商店免費擺、水草變插枝、硝化菌液記瓶數、飼料先抵飼料錢', () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    const kinds = new Set<string>();
    for (let d = 0; d < 40 && kinds.size < 5; d++) {
      s.hours = (20 + d) * 24 + 8;
      // 斷開連續天數，只看一般寶箱；每天都有別的收入，不觸發保底
      e.dailyStreak = undefined;
      e.lastEarnedDay = 20 + d;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      const before = { coins: e.coins, bag: (e.hardscapeBag ?? []).length, bottles: e.bacteriaBottles ?? 0, meals: e.freeMeals ?? 0, cuttings: Object.values(e.cuttings).reduce((a, x) => a + (x ?? 0), 0) };
      const got = claimDaily(tanks)!;
      kinds.add(got.item ?? 'coins');
      expect(e.coins).toBe(before.coins + got.coins);
      if (got.item === 'hardscape') expect(e.hardscapeBag!.length).toBe(before.bag + 1);
      if (got.item === 'bacteria') expect(e.bacteriaBottles).toBe(before.bottles + 1);
      if (got.item === 'food') expect(e.freeMeals).toBe(before.meals + CHEST_FOOD_MEALS);
      if (got.item === 'plant') expect(Object.values(e.cuttings).reduce((a, x) => a + (x ?? 0), 0)).toBe(before.cuttings + 1);
    }
    expect(kinds.size).toBe(5);
  });

  it('寶箱送的飼料先抵週末的飼料錢', () => {
    const s = newGameState(2);
    const e = economy(s);
    e.freeMeals = 60;
    e.meals = 10;
    e.kwh = 0;
    s.hours = e.lastBillHours + BILL_DAYS * 24;
    const coins = e.coins;
    updateEconomy(s, 0);
    expect(e.coins).toBe(coins);
    expect(e.freeMeals).toBe(50);
  });

  it(`連續 ${BIG_CHEST_DAYS} 天做完小事，第 ${BIG_CHEST_DAYS} 天是大寶箱（不給魚幣：一件造景物＋一株比較貴的水草）；斷一天重算`, () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    const open = (day: number) => {
      s.hours = day * 24 + 8;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      return claimDaily(tanks)!;
    };
    const days = [20, 21, 22, 23, 24, 25, 26];
    const got = days.slice(0, -1).map(open);
    expect(got.every((g) => !g.big)).toBe(true);
    const coins = e.coins;
    const plants = e.cuttings;
    const before = Object.values(plants).reduce((a, x) => a + (x ?? 0), 0);
    const big = open(26);
    expect(big.big).toBe(true);
    expect(big.coins).toBe(0);
    expect(e.coins).toBe(coins);
    expect(big.item).toBe('hardscape');
    expect(BIG_CHEST_PLANTS).toContain(big.plantId);
    expect(Object.values(e.cuttings).reduce((a, x) => a + (x ?? 0), 0)).toBe(before + 1);
    // 大寶箱的水草是陽性草或莫絲，比一般寶箱的陰性草插枝貴
    for (const id of BIG_CHEST_PLANTS) expect(PLANT_SPECIES[id].lightType === 'high' || id === 'moss').toBe(true);
    // 大寶箱之後重新算；斷了一天也重新算
    for (const d of [27, 28, 29, 30, 31, 32]) expect(open(d).big).toBe(false);
    expect(open(34).big).toBe(false);
  });

  it(`寶箱魚幣到第 ${CHEST_CAP_DAY} 天累計不超過 ${CHEST_COINS_CAP}：快到上限只給剩下的，用完改給飼料`, () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    e.chestCoins = CHEST_COINS_CAP - 5;
    for (let d = 10; d < 50; d++) {
      s.hours = d * 24 + 8;
      e.dailyStreak = undefined;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      const got = claimDaily(tanks)!;
      expect(got.coins).toBeLessThanOrEqual(5);
      if (got.coins === 0) expect(got.item).toBeDefined();
    }
    // 沒有別的收入，保底一定會開到魚幣：只給剩下的 5 元
    expect(e.chestCoins).toBe(CHEST_COINS_CAP);
  });

  it(`寶箱保底：${CHEST_DRY_DAYS} 天沒賺到魚幣，一般寶箱一定開出魚幣；有在賺錢就照機率`, () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    const open = (day: number) => {
      s.hours = day * 24 + 8;
      e.dailyStreak = undefined;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      return claimDaily(tanks)!;
    };
    // 開 10 天（最多 300 元，不碰上限）
    for (let d = 20; d < 30; d++) {
      e.lastEarnedDay = d - CHEST_DRY_DAYS;
      const got = open(d);
      expect(got.coins).toBeGreaterThanOrEqual(CHEST_COINS_MIN);
      expect(e.lastEarnedDay).toBe(d);
    }
    // 賣魚、交單也算賺到錢
    s.hours = 50 * 24 + 8;
    noteEarned(s);
    expect(e.lastEarnedDay).toBe(50);
  });

  it('寶箱來的插枝只能種，不能賣回店家、交單、上架或送人換錢', () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    e.cuttings = {};
    // 開到一株水草為止
    let got: ReturnType<typeof claimDaily> = null;
    for (let d = 10; d < 80 && got?.item !== 'plant'; d++) {
      s.hours = d * 24 + 8;
      e.dailyStreak = undefined;
      e.lastEarnedDay = d;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      got = claimDaily(tanks);
    }
    const sp = got!.itemId as PlantSpeciesId;
    expect(e.cuttings[sp]).toBe(1);
    expect(sellableCuttings(s, sp)).toBe(0);
    const coins = e.coins;
    expect(sellCuttings(s, sp)).toBe(0);
    expect(takeCuttingsForSale(s, sp, 1)).toBe(false);
    expect(takeCuttingsForGift(s, sp, 1)).toBe(false);
    expect(orderSupply(tanks, { id: 1, kind: 'cutting', plant: sp, count: 1 } as never)).toBe(0);
    expect(e.coins).toBe(coins);
    expect(e.cuttings[sp]).toBe(1);
    // 自己剪下來的照樣能賣，寶箱那株留在手上
    addCuttings(s, sp, 2);
    expect(sellCuttings(s, sp)).toBe(2 * plantBuybackPrice(sp));
    expect(e.cuttings[sp]).toBe(1);
    // 種下去就沒有了
    expect(takeCutting(s, sp)).toBe(true);
    expect(chestCuttingsOf(s, sp)).toBe(0);
  });

  it('經濟驗收（§4.3）：寶箱 60 天的期望魚幣在上限 400 以內', () => {
    const coinsEv = (CHEST_COINS_MIN + CHEST_COINS_MAX) / 2;
    const coinWeight = CHEST_POOL.find((p) => p.item === 'coins')!.weight;
    // 抽樣：一般寶箱抽到魚幣的比例
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (rollChest(i, i * 104729 + 7, false).coins > 0) hits++;
    expect(Math.abs(hits / 20000 - coinWeight)).toBeLessThan(0.015);
    // 每天都開、每 7 天一個大寶箱（大寶箱不給魚幣）：60 天約 52 個一般寶箱 × 25% × 25 元 ≈ 328 元
    const bigs = Math.floor(60 / BIG_CHEST_DAYS);
    const coins60 = (60 - bigs) * coinWeight * coinsEv;
    expect(Math.round(coins60)).toBe(325);
    expect(coins60).toBeLessThanOrEqual(CHEST_COINS_CAP);
    for (let i = 0; i < 50; i++) expect(rollChest(i, 99, true).coins).toBe(0);
  });
});
