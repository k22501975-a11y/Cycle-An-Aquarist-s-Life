import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addPlant, feed, FISH_SPECIES, simulate, useTestKit, waterChange, type TankState } from '../sim';

/**
 * QA：照新手教學照顧的新缸，起始的一公兩母不該整缸死光。
 * 每個種子都和遊戲一樣從商店買魚（會隨機帶病、可能已經懷孕），照老闆說的一天兩餐、每天測水、
 * 測到氨或亞硝 ≥0.5 就換三成水，玩 20 個遊戲天。
 */
const SEEDS = 30;
const DAYS = 20;

interface Run {
  tank: TankState;
  wipedDay: number | null;
  bred: boolean;
}

function followTutorial(seed: number): Run {
  const s = newGameState(seed);
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { sex });
  const alive = () => s.fish.filter((f) => f.alive);
  const meal = () => alive().reduce((mg, f) => mg + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
  let bred = false;
  for (let day = 1; day <= DAYS; day++) {
    feed(s, meal());
    simulate(s, 12);
    feed(s, meal());
    simulate(s, 12);
    const r = useTestKit(s);
    if (r.ammonia >= 0.5 || r.nitrite >= 0.5) waterChange(s, 0.3);
    bred ||= s.events.some((e) => e.type === 'fry_born');
    if (alive().length === 0) return { tank: s, wipedDay: day, bred };
  }
  return { tank: s, wipedDay: null, bred };
}

describe('新玩家照教學照顧（QA）', () => {
  // #122：新手期店裡的魚不帶細菌病、加熱棒不會隨機故障。兩項檢查共用同一次模擬，算同一條劇本
  it(`${SEEDS} 個新缸照教學照顧 ${DAYS} 天：最多 1 缸整缸死光，大部分會生小魚`, { timeout: 60_000 }, () => {
    const runs = Array.from({ length: SEEDS }, (_, i) => followTutorial(i + 1));
    const wiped = runs.flatMap(({ tank, wipedDay }, i) => {
      if (wipedDay === null) return [];
      const causes = [...new Set(tank.events.filter((e) => e.type === 'fish_died').map((e) => e.cause))].join('、');
      return [`種子 ${i + 1}：第 ${wipedDay} 天死光（${causes}）`];
    });
    expect(wiped.length, wiped.join('\n')).toBeLessThanOrEqual(1);
    // 目前約 19/30（死光的缸算沒生）；低於一半表示繁殖或照顧出了大問題
    expect(runs.filter((r) => r.bred).length).toBeGreaterThanOrEqual(SEEDS / 2);
  });
});
