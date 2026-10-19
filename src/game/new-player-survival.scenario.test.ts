import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addPlant, feed, FISH_SPECIES, simulate, useTestKit, waterChange, type TankState } from '../sim';

/**
 * QA：照新手教學照顧的新缸，起始的一公兩母不該整缸死光。
 * 每個種子都和遊戲一樣從商店買魚（會隨機帶病、可能已經懷孕），照老闆說的一天兩餐、每天測水、
 * 測到氨或亞硝 ≥0.5 就換三成水，玩 20 個遊戲天（仔魚多了模擬會變慢，所有種子只跑一次、兩個測試共用結果）。
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

let cache: Run[] | null = null;
const runs = () => (cache ??= Array.from({ length: SEEDS }, (_, i) => followTutorial(i + 1)));

describe('新玩家照教學照顧（QA）', () => {
  // 已知問題 #122：約一成的新缸會因為店裡的魚帶柱狀病（或加熱棒卡住）在 5 天內整缸死光。修好後拿掉 .fails。
  it.fails(`${SEEDS} 個新缸照教學照顧 ${DAYS} 天，最多 1 缸整缸死光`, { timeout: 60_000 }, () => {
    const wiped = runs().flatMap(({ tank, wipedDay }, i) => {
      if (wipedDay === null) return [];
      const causes = [...new Set(tank.events.filter((e) => e.type === 'fish_died').map((e) => e.cause))].join('、');
      return [`種子 ${i + 1}：第 ${wipedDay} 天死光（${causes}）`];
    });
    expect(wiped.length, wiped.join('\n')).toBeLessThanOrEqual(1);
  });

  it(`大部分新缸照教學照顧 ${DAYS} 天內會生小魚`, { timeout: 60_000 }, () => {
    const bred = runs().filter((r) => r.bred).length;
    // 目前約 19/30（死光的缸算沒生）；低於一半表示繁殖或照顧出了大問題
    expect(bred).toBeGreaterThanOrEqual(SEEDS / 2);
  });
});
