import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addHardscape, addPlant, CYCLE_DELAY_PER_BATCH_H, cycleConfirmed, FISH_SPECIES, feed, HARDSCAPE, isCycled, PINCH_MEALS, simulate, useTestKit, waterChange, type TankState } from '../sim';
import { advanceQuest, currentQuest, newProgress, pendingTip, QUESTS } from '../ui/tutorial';

/**
 * 新手節奏（design/mvp.md §4.6、polish-to-9.md §4 教學順序）：照基準玩法——一公兩母、每天一次「一小撮」、
 * 1 株水草、每天測水、測到氨或亞硝才換水，任務叫你做什麼就做（換一次水、擺石頭、取名字）。
 * 任務順序是開缸 → 挑魚對水 → 餵食 → 種草…，等養水是教學後的背景目標：
 * 教學第 4 天以前全部做完、養水目標第 4～7 天過、買來的魚一條都不死。
 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
const steady = (s: TankState) => {
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
};
const buyTrio = (s: TankState) => ['male', 'female', 'female'].map((sex) => addFish(s, 'guppy', { carriesIch: false, carries: [], sex: sex as 'male' | 'female' }));

interface Pace {
  /** 每個任務在第幾天完成。 */
  quests: Record<string, number>;
  /** 養水目標在第幾天完成（-1 表示沒完成）。 */
  cycled: number;
  tank: TankState;
}

function baseline(seed: number): Pace {
  const s = newGameState(seed);
  steady(s);
  const p = newProgress();
  const quests: Record<string, number> = {};
  let cycled = -1;
  const act = (day: number) => {
    for (let q = advanceQuest(p, s); q; q = advanceQuest(p, s)) quests[q.id] = day;
  };
  act(0);
  for (let d = 0; d <= 12 && (currentQuest(p) || cycled < 0); d++) {
    // 任務叫你做什麼就做（開缸在 newGameState 已經做完）
    if (currentQuest(p)?.id === 'fish') buyTrio(s);
    act(d);
    feed(s, meal(s) * PINCH_MEALS);
    act(d);
    if (currentQuest(p)?.id === 'plant') addPlant(s, 'anubias');
    act(d);
    if (currentQuest(p)?.id === 'test') useTestKit(s);
    act(d);
    if (currentQuest(p)?.id === 'water') waterChange(s, 0.3);
    act(d);
    if (currentQuest(p)?.id === 'scape') addHardscape(s, HARDSCAPE.lava);
    act(d);
    if (currentQuest(p)?.id === 'name') s.label = '我的第一缸';
    act(d);
    simulate(s, 24);
    const r = useTestKit(s);
    act(d + 1);
    if (cycled < 0 && cycleConfirmed(s)) cycled = d + 1;
    if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
  }
  return { quests, cycled, tank: s };
}

describe('新手節奏劇本（mvp.md §4.6、polish-to-9.md U2）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：教學第 4 天以前全部做完、養水第 4～7 天過、買來的魚都活著`, () => {
      const { quests, cycled, tank } = baseline(seed);
      expect(Object.keys(quests)).toEqual(QUESTS.map((q) => q.id));
      // 開缸、挑魚、餵食當天就做完（第一條魚 90 秒內進缸，G7）
      expect([quests.setup, quests.fish, quests.feed]).toEqual([0, 0, 0]);
      for (const d of Object.values(quests)) expect(d).toBeLessThanOrEqual(4);
      // 等養水不擋教學：教學做完的時候缸還沒養好
      expect(Math.max(...Object.values(quests))).toBeLessThan(cycled);
      expect(cycled).toBeGreaterThanOrEqual(4);
      expect(cycled).toBeLessThanOrEqual(7);
      expect(tank.events.filter((e) => e.type === 'fish_died')).toEqual([]);
      expect(tank.fish.filter((f) => (f.generation ?? 0) === 0 && f.alive)).toHaveLength(3);
    }, 30_000);
  }
});

describe('店裡的魚耐得住還在養水的缸（polish-to-9.md §4）', () => {
  /** 新缸測得到氨（0.5～1 mg/L）時買一公兩母，照基準玩法顧；回傳養好水的時間（小時）。 */
  function cyclingTank(seed: number, tan: number, keepDelay: boolean) {
    const s = newGameState(seed);
    steady(s);
    addPlant(s, 'anubias');
    s.water.tan = tan;
    const fish = buyTrio(s);
    const delayed = s.cycleDelay?.leftH ?? 0;
    if (!keepDelay) delete s.cycleDelay;
    const tip = pendingTip(newProgress(), s)?.id;
    let cycledAt = -1;
    let minHealth = 1;
    for (let d = 0; d < 10; d++) {
      feed(s, meal(s) * PINCH_MEALS);
      for (let h = 0; h < 24; h++) {
        simulate(s, 1);
        if (cycledAt < 0 && isCycled(s)) cycledAt = s.hours;
        for (const f of fish) minHealth = Math.min(minHealth, f.health);
      }
      const r = useTestKit(s);
      if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
    }
    return { s, fish, delayed, tip, cycledAt, minHealth };
  }

  for (const tan of [0.5, 1]) {
    it(`氨 ${tan} 時放魚：一條都不死、老闆提醒一次、養水期多 1 天`, () => {
      for (const seed of [1, 2, 3]) {
        const run = cyclingTank(seed, tan, true);
        expect(run.fish.every((f) => f.alive)).toBe(true);
        expect(run.s.events.filter((e) => e.type === 'fish_died')).toEqual([]);
        expect(run.minHealth).toBeGreaterThan(0.9);
        // 一公兩母是同一批，只延長一次
        expect(run.delayed).toBe(CYCLE_DELAY_PER_BATCH_H);
        expect(run.tip).toBe('cycling_fish');
        const control = cyclingTank(seed, tan, false);
        expect(run.cycledAt - control.cycledAt).toBeGreaterThanOrEqual(20);
        expect(run.cycledAt - control.cycledAt).toBeLessThanOrEqual(28);
        expect(run.cycledAt / 24).toBeLessThanOrEqual(7);
      }
    }, 30_000);
  }

  it('氨是 0 的新缸放魚不延長、不提醒（基準玩法開局）', () => {
    const s = newGameState(1);
    buyTrio(s);
    expect(s.cycleDelay).toBeUndefined();
    expect(pendingTip(newProgress(), s)?.id).not.toBe('cycling_fish');
  });
});
