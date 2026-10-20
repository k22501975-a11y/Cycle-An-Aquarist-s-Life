import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, buyQuarantine, buyTank, economy, fulfillOrder, maxLengthCm, moveToQuarantine, orderBoard, sellFish, type ShopOrder } from './index';
import { CALM_DAYS, checkGoals, GOALS, goalState, isUnlocked, nextGoals, raisedCount, speciesUnlocked, unlockHint } from './goals';
import type { TankState } from './state';

const calmFish = { carriesIch: false, carries: [] };

/** 自己繁殖的小魚（第 1 代），長到最大體長的 frac。 */
function bredFish(s: TankState, frac: number) {
  const f = addFish(s, 'guppy', calmFish);
  f.generation = 1;
  f.lengthCm = maxLengthCm(f) * frac;
  return f;
}

describe('新手之後的目標（M19）', () => {
  it('一開始是等養水（從新手任務搬來的背景目標），接著「第一桶金」：保護小魚、養大 5 條；鬥魚和水晶蝦還沒開賣', () => {
    const tanks = [newGameState(1)];
    expect(nextGoals(tanks).map((g) => g.id)).toEqual(['cycled', 'protect_fry']);
    goalState(tanks).done.push('cycled');
    expect(nextGoals(tanks).map((g) => g.id)).toEqual(['protect_fry', 'raise5']);
    expect(speciesUnlocked(tanks, 'guppy')).toBe(true);
    expect(speciesUnlocked(tanks, 'betta')).toBe(false);
    expect(speciesUnlocked(tanks, 'crystal_shrimp')).toBe(false);
    expect(unlockHint('betta')).toContain('第二個缸');
  });

  it('教學還沒做完不發獎勵；做完才完成、給魚幣', () => {
    const tanks = [newGameState(1)];
    bredFish(tanks[0], 0.5);
    expect(checkGoals(tanks, false)).toEqual([]);
    const before = economy(tanks[0]).coins;
    expect(checkGoals(tanks, true).map((g) => g.id)).toEqual(['protect_fry']);
    expect(economy(tanks[0]).coins).toBe(before + 50);
    // 同一個目標不會再發一次
    expect(checkGoals(tanks, true)).toEqual([]);
  });

  it('養在產卵盒裡的小魚也算；5 條長到轉色期解鎖挑選說明', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 10_000;
    buyQuarantine(tanks[0]);
    for (let i = 0; i < 5; i++) moveToQuarantine(tanks[0], bredFish(tanks[0], 0.65).id);
    expect(tanks[0].quarantine!.fish).toHaveLength(5);
    const done = checkGoals(tanks).map((g) => g.id);
    expect(done).toContain('raise5');
    expect(isUnlocked(tanks, 'selection')).toBe(true);
  });

  it('養大 5 條：交訂單拿走的也算，任務卡顯示幾條／5 條；賣給店家的不算（#183）', () => {
    const tanks = [newGameState(1)];
    const young = [0, 1, 2].map(() => bredFish(tanks[0], 0.55));
    bredFish(tanks[0], 0.65);
    const raise5 = GOALS.find((g) => g.id === 'raise5')!;
    expect(raise5.progress!(tanks)).toEqual([1, 5]);
    // 中魚單把三條剛長大的拿走
    const board = orderBoard(tanks[0]);
    board.orders = [{ id: 990, kind: 'fish', species: 'guppy', size: 'juvenile', count: 3, unitPrice: 40, postedHours: tanks[0].hours } as ShopOrder];
    expect(fulfillOrder(tanks, 990)).toBeGreaterThan(0);
    expect(young.every((f) => !tanks[0].fish.includes(f))).toBe(true);
    expect(raisedCount(tanks)).toBe(4);
    expect(checkGoals(tanks).map((g) => g.id)).not.toContain('raise5');
    // 賣給店家的不算
    expect(sellFish(tanks[0], bredFish(tanks[0], 0.65).id)).toBeGreaterThan(0);
    expect(raisedCount(tanks)).toBe(4);
    bredFish(tanks[0], 0.65);
    expect(raise5.progress!(tanks)).toEqual([5, 5]);
    expect(checkGoals(tanks).map((g) => g.id)).toContain('raise5');
  });

  it('買第二個缸：店裡開始賣鬥魚', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 10_000;
    buyTank(tanks, 'nano20');
    expect(checkGoals(tanks).map((g) => g.id)).toContain('second_tank');
    expect(speciesUnlocked(tanks, 'betta')).toBe(true);
  });

  it('舊存檔已經養了鬥魚，直接算解鎖，不會被鎖回去', () => {
    const s = newGameState(1);
    addFish(s, 'betta', calmFish);
    expect(speciesUnlocked([s], 'betta')).toBe(true);
  });

  it(`缸裡有魚、${CALM_DAYS} 天都沒警告才算穩定；有氨就重算`, () => {
    const s = newGameState(1);
    s.bacteria.aob = s.bacteria.nob = 1;
    addFish(s, 'guppy', calmFish);
    const tanks = [s];
    checkGoals(tanks);
    s.hours += 10 * 24;
    s.water.tan = 1;
    checkGoals(tanks);
    s.water.tan = 0;
    s.hours += (CALM_DAYS - 1) * 24;
    checkGoals(tanks);
    expect(goalState(tanks).done).not.toContain('calm');
    s.hours += 2 * 24;
    checkGoals(tanks);
    expect(goalState(tanks).done).toContain('calm');
    expect(isUnlocked(tanks, 'std90')).toBe(true);
  });

  it('治好病：上次看到在發病、現在好了', () => {
    const s = newGameState(1);
    const f = addFish(s, 'guppy', calmFish);
    f.ich = { stage: 'visible', progress: 0.5 };
    checkGoals([s]);
    f.ich = { stage: 'none', progress: 0 };
    checkGoals([s]);
    expect(goalState([s]).done).toContain('cure');
  });
});
