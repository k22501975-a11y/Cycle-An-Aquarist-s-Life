import { describe, expect, it } from 'vitest';
import { blankGameState, newGameState } from '../game/game';
import { doDailyTask, everythingTank, richTank } from '../game/daily-player';
import {
  addHardscape,
  BIG_CHEST_COINS,
  BIG_CHEST_DAYS,
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
  FOOD_PER_MEAL,
  HARDSCAPE,
  markDaily,
  PLANT_PRICES,
  price,
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
      // 斷開連續天數，只看一般寶箱
      e.dailyStreak = undefined;
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

  it(`連續 ${BIG_CHEST_DAYS} 天做完小事，第 ${BIG_CHEST_DAYS} 天是大寶箱（${BIG_CHEST_COINS} 魚幣＋一件造景物）；斷一天重算`, () => {
    const s = richTank();
    const tanks = [s];
    const open = (day: number) => {
      s.hours = day * 24 + 8;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      return claimDaily(tanks)!;
    };
    const days = [20, 21, 22, 23, 24, 25, 26];
    const got = days.map(open);
    expect(got.slice(0, -1).every((g) => !g.big)).toBe(true);
    const big = got[got.length - 1];
    expect(big.big).toBe(true);
    expect(big.coins).toBe(BIG_CHEST_COINS);
    expect(big.item).toBe('hardscape');
    // 大寶箱之後重新算；斷了一天也重新算
    for (const d of [27, 28, 29, 30, 31, 32]) expect(open(d).big).toBe(false);
    expect(open(34).big).toBe(false);
  });

  it('經濟驗收（§4.3）：寶箱 60 天的期望價值，對照訂單收入的 20%', () => {
    // 一般寶箱的期望價值（照商店價折合魚幣）
    const coinsEv = (CHEST_COINS_MIN + CHEST_COINS_MAX) / 2;
    const rockEv = (price('hardscape:lava') + price('hardscape:slate')) / 2;
    const hardscapeEv = (rockEv + price('hardscape:driftwood')) / 2;
    const plantEv = CHEST_PLANTS.reduce((a, id) => a + PLANT_PRICES[id] / 2, 0) / CHEST_PLANTS.length;
    const value: Record<ChestItem, number> = { coins: coinsEv, food: CHEST_FOOD_MEALS * FOOD_PER_MEAL, bacteria: price('care:bacteria'), hardscape: hardscapeEv, plant: plantEv };
    const ev = CHEST_POOL.reduce((a, p) => a + p.weight * value[p.item], 0);
    // 抽樣平均跟算出來的期望值對得上
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += rollChest(i, i * 104729 + 7, false).value;
    expect(Math.abs(sum / 20000 - ev) / ev).toBeLessThan(0.03);
    // 每天都開、每 7 天一個大寶箱：60 天
    const bigs = Math.floor(60 / BIG_CHEST_DAYS);
    const total60 = (60 - bigs) * ev + bigs * (BIG_CHEST_COINS + hardscapeEv);
    const coins60 = (60 - bigs) * 0.4 * coinsEv + bigs * BIG_CHEST_COINS;
    // 記下來給企劃看：期望值約每箱 86 元、60 天約 8,200 元（其中現金約 2,500 元）。
    // §4.3 認真玩家「賣魚＋訂單」第 60 天目標 800，20% 是 160 元：寶箱遠遠超過，獎勵池或 20% 規則要企劃重新拍板（不在這裡調數字）。
    expect(ev).toBeCloseTo(85.75, 2);
    expect(Math.round(total60)).toBe(8159);
    expect(Math.round(coins60)).toBe(2536);
  });
});
