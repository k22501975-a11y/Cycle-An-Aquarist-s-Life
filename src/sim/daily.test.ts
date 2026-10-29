import { describe, expect, it } from 'vitest';
import { blankGameState, newGameState } from '../game/game';
import { doDailyTask, everythingTank, richTank } from '../game/daily-player';
import {
  waterTaskTank,
  addHardscape,
  addPlant,
  BIG_CHEST_DAYS,
  BIG_CHEST_PLANTS,
  CHEST_CAP_DAY,
  CHEST_COINS_CAP,
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
  markDailyFish,
  goalDaily,
  addFish,
  crowdingRatio,
  CROWD_WARN,
  SCAPE_IDLE_DAYS,
  DAILY_GOAL_COUNT,
  dailyText,
  goalRelated,
  type TankState,
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

  it('前一天做的不算，同一天出題前做的也算（daily-loop.md §3：早上已經換過水了）', () => {
    const s = richTank();
    const tanks = [s];
    feed(s, 5);
    s.hours += 24;
    useTestKit(s);
    updateDaily(tanks);
    const d = dailyTasks(tanks)!;
    d.tasks = [{ id: 'test', done: false }, { id: 'feed', done: false }];
    expect(updateDaily(tanks)).toEqual(['test']);
    // 換天以後、出題以前點過的魚、看過的訂單也算
    s.hours += 24;
    const fish = s.fish.find((f) => f.alive)!;
    markDailyFish(tanks, fish.id);
    markDaily(tanks, 'orders');
    expect(dailyTasks(tanks)!.day).toBe(d.day);
    updateDaily(tanks);
    const next = dailyTasks(tanks)!;
    expect(next.day).toBe(d.day + 1);
    expect(next.marked).toEqual(expect.arrayContaining(['orders', 'observe']));
  });

  it('出題後做完三件可以開寶箱，只能領一次', () => {
    const s = richTank();
    const tanks = [s];
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
    // 都是前一天做的
    a.hours += 24;
    b.hours += 24;
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
    // 錢花光了也照樣出「幫水草換位置」
    const s = richTank();
    addHardscape(s, HARDSCAPE.lava);
    economy(s).coins = 0;
    expect(eligibleDaily([s])).toContain('scapePlant');
  });

  it('舊存檔的「移動一塊造景」：移動現有的石頭或沉木就算完成，前一天移的不算', () => {
    const s = newGameState(4);
    addHardscape(s, HARDSCAPE.lava);
    s.hours = 24 * 3 + 8;
    placeHardscape(s, 0, { x: 0.2 });
    s.hours += 24;
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

  it('每一題出題後照做就算完成，沒做不算（不再出的造景題除外）', () => {
    for (const id of DAILY_IDS.filter((x) => !['scape', 'scapeFlip', 'scapeLayer', 'scapeScale'].includes(x))) {
      const s = everythingTank();
      // 目標題：自家養的白子小魚（最快轉色）、還沒長大的種魚、擠到要看訂單板
      const kid = (keeper: boolean) => {
        const f = addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
        f.generation = 1;
        f.bornHours = s.hours - 8 * 24;
        f.lengthCm = 1.2;
        f.genome = { ...f.genome!, albino: [1, 1] };
        f.keeper = keeper;
        return f;
      };
      kid(false);
      const keeper = kid(true);
      if (id === 'goalKeeperFed') keeper.sex = 'female';
      // 出生 18 天、看得出公母、尾鰭散開、有蛇紋的小魚（留種、品系的題目）
      const teen = (sex: 'male' | 'female') => {
        const f = addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false });
        f.generation = 1;
        f.bornHours = s.hours - 18 * 24;
        f.lengthCm = 2.6;
        f.genome = { ...f.genome!, snakeX: sex === 'male' ? [1] : [1, 1], y: sex === 'male' ? { grass: 0, snake: 1 } : null };
      };
      if (['goalFins', 'goalSplit', 'goalSnake'].includes(id)) for (const sex of ['male', 'female'] as const) teen(sex);
      const tanks = [s];
      if (['goalOrders', 'goalCrowded', 'goalMove'].includes(id)) while (crowdingRatio(s) < CROWD_WARN) addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
      // 看哪一缸最擠、搬到別缸：要有第二缸
      if (id === 'goalCrowded' || id === 'goalMove') tanks.push(richTank());
      // 長太密的缸（polish-to-9.md §13.3）
      if (id === 'trimDense') for (let i = 0; i < 4; i++) addPlant(s, 'moss', 20);
      expect(eligibleDaily(tanks), id).toContain(id);
      updateDaily(tanks);
      const subjectId = goalDaily(tanks).find((g) => g.id === id)?.subjectId;
      const d = dailyTasks(tanks)!;
      d.tasks = [{ id, done: false, subjectId }];
      d.marked = [];
      expect(updateDaily(tanks), id).toEqual([]);
      s.hours += 1;
      doDailyTask(tanks, id, subjectId);
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
    // 擺進缸裡（免費）：手上沒了，只剩幫水草換位置（搬石頭、翻面、換層、縮放會攪沙嚇到魚，不再出）
    const coins = economy(s).coins;
    doDailyTask([s], 'scapePlace');
    expect(economy(s).coins).toBe(coins);
    expect(s.equipment.hardscape?.map((x) => x.id)).toEqual(['lava']);
    expect(scape(eligibleDaily([s]))).toEqual(['scapePlant']);
    // 動過造景：7 天內不出造景題
    doDailyTask([s], 'scapePlant');
    expect(scape(eligibleDaily([s]))).toEqual([]);
    s.hours += SCAPE_IDLE_DAYS * 24;
    expect(scape(eligibleDaily([s]))).toEqual(['scapePlant']);
  });
});

describe('每日小事跟著目標走（daily-loop.md §3）', () => {
  /** 店裡買來就懷孕的母魚、自家養的小魚（等轉色）、還沒長大的種魚。 */
  function goalTank(): TankState {
    const s = richTank();
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    mom.pregnancy = 0.5;
    for (let i = 0; i < 3; i++) {
      const f = addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
      f.generation = 1;
      f.bornHours = s.hours - (11 + i) * 24;
      f.lengthCm = 1.1 + i * 0.1;
      f.keeper = i === 0;
    }
    return s;
  }

  it('3 題裡至少 2 題跟目標有關；目標題寫得出是哪尾魚，點那尾就算做了', () => {
    const s = goalTank();
    const tanks = [s];
    updateDaily(tanks);
    const d = dailyTasks(tanks)!;
    const goal = d.tasks.filter((t) => goalDaily(tanks).some((g) => g.id === t.id));
    expect(goal.length).toBeGreaterThanOrEqual(DAILY_GOAL_COUNT);
    expect(d.tasks.slice(0, 2).map((t) => t.id)).toEqual(['goalBelly', 'goalColor']);
    const belly = d.tasks[0];
    const mom = s.fish.find((f) => f.pregnancy > 0)!;
    expect(belly.subjectId).toBe(mom.id);
    expect(dailyText(belly, () => '小紅')).toBe('看看小紅的胎斑');
    expect(dailyText(d.tasks[1], () => '小德')).toBe('點小德看看，牠最快轉色');
    expect(dailyText(belly)).toBe('看看懷孕母魚的胎斑');
    // 點別尾不算，點她才算
    s.hours += 1;
    markDailyFish(tanks, d.tasks[1].subjectId!);
    expect(updateDaily(tanks)).toEqual(['goalColor']);
    markDailyFish(tanks, mom.id);
    expect(updateDaily(tanks)).toEqual(['goalBelly']);
  });

  it('連著 30 天：每天至少 2 題跟目標有關，造景、整理一天最多 1 題，造景題一週最多 2 題', () => {
    const s = goalTank();
    addHardscape(s, HARDSCAPE.lava);
    economy(s).hardscapeBag = ['driftwood', 'slate', 'lava'];
    const tanks = [s];
    const scapeDays: number[] = [];
    for (let day = 0; day < 30; day++) {
      s.hours += 24;
      // 母魚一直懷著、小魚一直在長（只看出題）
      updateDaily(tanks);
      const d = dailyTasks(tanks)!;
      const goal = new Set(goalDaily(tanks).map((g) => g.id));
      expect(d.tasks.filter((t) => goal.has(t.id)).length, `第 ${day} 天`).toBeGreaterThanOrEqual(2);
      const chores = d.tasks.filter((t) => DAILY_CATEGORY[t.id] === 'scape' || DAILY_CATEGORY[t.id] === 'tidy');
      expect(chores.length, `第 ${day} 天`).toBeLessThanOrEqual(1);
      for (const t of d.tasks) expect(['scape', 'scapeFlip', 'scapeLayer', 'scapeScale']).not.toContain(t.id);
      if (d.tasks.some((t) => DAILY_CATEGORY[t.id] === 'scape')) scapeDays.push(day);
      for (const t of d.tasks) doDailyTask(tanks, t.id, t.subjectId);
    }
    for (const day of scapeDays) expect(scapeDays.filter((x) => x > day - 7 && x <= day).length).toBeLessThanOrEqual(2);
  });

  it('幫水草換位置、擺上寶箱開到的石頭：不會嚇到魚', () => {
    const s = goalTank();
    economy(s).hardscapeBag = ['lava'];
    for (const f of s.fish) f.stress = 0;
    doDailyTask([s], 'scapePlant');
    doDailyTask([s], 'scapePlace');
    placeHardscape(s, (s.equipment.hardscape ?? []).length - 1, { x: 0.3 });
    expect(Math.max(...s.fish.map((f) => f.stress))).toBe(0);
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
    // 40 天裡一定會抽到魚幣：只給剩下的 5 元
    expect(e.chestCoins).toBe(CHEST_COINS_CAP);
  });

  it(`寶箱魚幣 ${CHEST_COINS_CAP} 是硬上限：到上限後抽到魚幣那一格改開一件物品`, () => {
    const s = richTank();
    const tanks = [s];
    const e = economy(s);
    e.chestCoins = CHEST_COINS_CAP;
    let converted = 0;
    for (let d = 10; d < CHEST_CAP_DAY; d++) {
      s.hours = d * 24 + 8;
      e.dailyStreak = undefined;
      updateDaily(tanks);
      dailyTasks(tanks)!.tasks = [{ id: 'observe', done: false }];
      markDaily(tanks, 'observe');
      updateDaily(tanks);
      const raw = rollChest(d, dailyTasks(tanks)!.chestSeed ?? 0, false);
      const coins = e.coins;
      const got = claimDaily(tanks)!;
      expect(got.coins).toBe(0);
      expect(e.coins).toBe(coins);
      expect(got.item).toBeDefined();
      if (raw.coins > 0) converted++;
    }
    expect(converted).toBeGreaterThan(0);
    expect(e.chestCoins).toBe(CHEST_COINS_CAP);
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

describe('換水那題換最擠的那缸（daily-loop.md §3）', () => {
  it('兩缸都該換水：換比較擠的那缸；剛換過的不算', () => {
    const a = newGameState(3);
    const b = newGameState(4);
    b.hours = a.hours = 24 * 20;
    for (let i = 0; i < 30; i++) addFish(b, 'guppy', { carriesIch: false, carries: [] });
    const tanks = [a, b];
    expect(crowdingRatio(b)).toBeGreaterThan(crowdingRatio(a));
    expect(waterTaskTank(tanks)).toBe(1);
    b.lastWaterChangeHours = b.hours;
    expect(waterTaskTank(tanks)).toBe(0);
  });
});

describe('目標題 3 天不重複只看同一題、同一個對象（daily-loop.md §8，#378）', () => {
  it('換了一尾種魚隔天就能再出；同一尾 3 天內不再出', () => {
    const s = richTank();
    s.fish = [];
    // 店裡買的 3 尾還沒長大的種魚：只出得了「看看種魚長多大了」
    for (let i = 0; i < 3; i++) {
      const f = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
      f.lengthCm = 1.5;
      f.keeper = true;
    }
    const tanks = [s];
    const subjects: number[] = [];
    for (let day = 0; day < 6; day++) {
      updateDaily(tanks);
      const keeper = dailyTasks(tanks)!.tasks.find((t) => t.id === 'goalKeeper');
      expect(keeper, `day ${day}`).toBeDefined();
      subjects.push(keeper!.subjectId!);
      s.hours += 24;
    }
    for (let i = 2; i < subjects.length; i++) expect(new Set(subjects.slice(i - 2, i + 1)).size, subjects.join(',')).toBe(3);
  });

  it('照顧題寫明跟目標的關係才算跟目標有關', () => {
    expect(dailyText({ id: 'water', why: 'momDue', subjectId: 1 }, () => '小紅')).toBe('換一次水：小紅快生了，水乾淨一點比較好');
    expect(dailyText({ id: 'feed', why: 'fry' })).toBe('餵一次飼料：小魚正在長，吃飽長得快');
    expect(goalRelated({ id: 'water', why: 'momDue' })).toBe(true);
    expect(goalRelated({ id: 'water' })).toBe(false);
    expect(goalRelated({ id: 'goalHide' })).toBe(true);
  });

  it('比一比要兩尾都點過才算', () => {
    const s = richTank();
    const kids = [0, 1].map((i) => {
      const f = addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
      f.generation = 1;
      f.bornHours = s.hours - 12 * 24;
      f.lengthCm = 1.1 + i * 0.2;
      return f;
    });
    const tanks = [s];
    updateDaily(tanks);
    const pick = goalDaily(tanks).find((g) => g.id === 'goalCompare')!;
    expect([pick.subjectId, pick.otherId].sort()).toEqual(kids.map((f) => f.id).sort());
    expect(dailyText(pick, (id) => (id === kids[0].id ? '小紅' : '小德'))).toMatch(/^比一比小(紅|德)和小(紅|德)，誰的顏色比較深？$/);
    const d = dailyTasks(tanks)!;
    d.tasks = [{ id: 'goalCompare', done: false, subjectId: pick.subjectId, otherId: pick.otherId }];
    d.marked = [];
    s.hours += 1;
    markDailyFish(tanks, pick.subjectId!);
    expect(updateDaily(tanks)).toEqual([]);
    markDailyFish(tanks, pick.otherId!);
    expect(updateDaily(tanks)).toEqual(['goalCompare']);
  });
});
