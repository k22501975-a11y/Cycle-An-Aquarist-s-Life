import { describe, expect, it } from 'vitest';
import { blankGameState, newGameState } from '../game/game';
import {
  addFish,
  addHardscape,
  addPlant,
  canClaimDaily,
  claimDaily,
  DAILY_REWARD,
  dailyTasks,
  economy,
  eligibleDaily,
  feed,
  HARDSCAPE,
  markDaily,
  PLANT_SPECIES,
  simulate,
  trimPlant,
  updateDaily,
  useTestKit,
  waterChange,
  type DailyTaskId,
  type TankState,
} from '.';

/** 照題目把事情做完（找螺、看魚由畫面回報）。 */
function doTask(tanks: TankState[], id: DailyTaskId): void {
  const s = tanks[0];
  if (id === 'test') useTestKit(s);
  if (id === 'feed') feed(s, 5);
  if (id === 'water') waterChange(s, 0.3);
  if (id === 'trim') trimPlant(s, s.plants[0].id);
  if (id === 'scape') addHardscape(s, HARDSCAPE.lava);
  if (id === 'snail' || id === 'observe') markDaily(tanks, id);
}

function richTank(): TankState {
  const s = newGameState(3);
  addFish(s, 'guppy', { carriesIch: false, carries: [] });
  const p = addPlant(s, 'rotala');
  p.biomassG = PLANT_SPECIES.rotala.maxBiomassG;
  s.snails = { snails: [], pests: { bladder: 3, ramshorn: 0, mts: 0 } as never, clutches: [], appleYoung: 0, neriteEggs: 0 };
  s.hours = 24 * 10 + 8;
  return s;
}

describe('每日 3 件小事（F3）', () => {
  it('還沒開缸不出題；開完缸出 3 件不重複的題目', () => {
    const blank = blankGameState(1);
    expect(updateDaily([blank])).toEqual([]);
    expect(dailyTasks([blank])).toBeNull();
    const s = newGameState(1);
    updateDaily([s]);
    const ids = dailyTasks([s])!.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 剛開缸沒魚、沒螺、沒長太長的草：只出得了測水和擺石頭
    expect(ids.sort()).toEqual(['scape', 'test']);
  });

  it('不出做不到的題目：沒魚不出餵食、沒螺不出找螺、草沒長長不出修剪', () => {
    const s = newGameState(1);
    expect(eligibleDaily([s])).not.toContain('feed');
    expect(eligibleDaily([s])).not.toContain('snail');
    expect(eligibleDaily([s])).not.toContain('trim');
    const rich = richTank();
    expect(eligibleDaily([rich]).sort()).toEqual(['feed', 'observe', 'scape', 'snail', 'test', 'trim', 'water']);
    // 剛換過水就不出換水
    waterChange(rich, 0.3);
    expect(eligibleDaily([rich])).not.toContain('water');
  });

  it('出題前做的不算，出題後做完三件可以開寶箱領 30 元，只能領一次', () => {
    const s = richTank();
    const tanks = [s];
    useTestKit(s);
    feed(s, 5);
    updateDaily(tanks);
    expect(dailyTasks(tanks)!.tasks.every((t) => !t.done)).toBe(true);
    simulate(s, 1);
    const ids = dailyTasks(tanks)!.tasks.map((t) => t.id);
    expect(ids).toHaveLength(3);
    for (const id of ids.slice(0, 2)) doTask(tanks, id);
    expect(updateDaily(tanks)).toEqual(ids.slice(0, 2));
    expect(canClaimDaily(tanks)).toBe(false);
    doTask(tanks, ids[2]);
    expect(updateDaily(tanks)).toEqual([ids[2]]);
    const coins = economy(s).coins;
    expect(claimDaily(tanks)).toBe(DAILY_REWARD);
    expect(economy(s).coins).toBe(coins + DAILY_REWARD);
    expect(claimDaily(tanks)).toBe(0);
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
});
