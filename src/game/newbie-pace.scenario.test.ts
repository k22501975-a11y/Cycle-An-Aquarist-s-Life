import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addHardscape, addPlant, FISH_SPECIES, feed, HARDSCAPE, PINCH_MEALS, simulate, useTestKit, waterChange, type TankState } from '../sim';
import { advanceQuest, currentQuest, newProgress, QUESTS } from '../ui/tutorial';

/**
 * 新手節奏（design/mvp.md §4.6）：照基準玩法——1 株水草、一公兩母、每天一次「一小撮」、
 * 每天測水、測到氨或亞硝才換水，任務叫你做什麼就做（換一次水、擺石頭、取名字）。
 * 養水任務要在第 4～7 天過，任務 1～7 加上等待期小任務全部在第 12 天以內走完。
 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 回傳每個任務在第幾天完成。 */
function baseline(seed: number): Record<string, number> {
  const s = newGameState(seed);
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  const p = newProgress();
  const doneDay: Record<string, number> = {};
  const act = (day: number) => {
    for (let q = advanceQuest(p, s); q; q = advanceQuest(p, s)) doneDay[q.id] = day;
  };
  for (let d = 0; d <= 12 && currentQuest(p); d++) {
    if (d === 0) {
      addPlant(s, 'anubias');
      act(d);
      useTestKit(s);
      act(d);
      for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
      act(d);
    }
    feed(s, meal(s) * PINCH_MEALS);
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
    if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
  }
  return doneDay;
}

describe('新手節奏劇本（mvp.md §4.6）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：養水第 4～7 天過、全部任務第 12 天以內走完`, () => {
      const days = baseline(seed);
      expect(Object.keys(days)).toEqual(QUESTS.map((q) => q.id));
      expect(days.cycled).toBeGreaterThanOrEqual(4);
      expect(days.cycled).toBeLessThanOrEqual(7);
      for (const d of Object.values(days)) expect(d).toBeLessThanOrEqual(12);
    }, 30_000);
  }
});
