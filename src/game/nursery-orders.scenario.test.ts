import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import {
  addCuttings,
  addFish,
  addPlant,
  claimDaily,
  economy,
  dailyTasks,
  FISH_SPECIES,
  feed,
  fulfillOrder,
  isJuvenile,
  markDaily,
  moveDueToNursery,
  orderBoard,
  orderContext,
  PINCH_MEALS,
  rescueFryToNursery,
  simulate,
  splitAdvice,
  splitGroup,
  trimPlant,
  updateDaily,
  useTestKit,
  waterChange,
  type TankState,
} from '../sim';

/**
 * 育幼盒驗收（design/mvp.md §4.4.2 第 5 點，#187）：新手基準玩法（§4.6），不買任何盒子，只用阿德老闆送的育幼盒，
 * 照提示操作：待辦說母魚快生了就放進育幼盒、說成魚會吃小魚就把小魚撈進盒；交得出來的訂單就交。
 * 第一張訂單 ≤ 第 20 天，第 37 天累計訂單收入 ≥ 300。
 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

function run(seed: number, noBox = false, days = 37): { first: number; earned: Record<number, number>; gift: number } {
  const s = newGameState(seed);
  const tanks = [s];
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
  const breeders = s.fish.map((f) => f.id);
  if (noBox) economy(s).nurseryGifted = true;
  let first = Infinity;
  let gift = Infinity;
  const earned: Record<number, number> = {};
  for (let d = 1; d <= days; d++) {
    // 一天分四段過：快生的母魚一看到提示就放進盒子
    for (let k = 0; k < 4; k++) {
      simulate(s, 6);
      if (s.nurseryBox && gift === Infinity) gift = d;
      if (s.nurseryBox) moveDueToNursery(s);
    }
    updateDaily(tanks);
    feed(s, meal(s) * PINCH_MEALS);
    const r = useTestKit(s);
    const tasks = dailyTasks(tanks)?.tasks.map((t) => t.id) ?? [];
    if (r.ammonia > 0 || r.nitrite > 0 || tasks.includes('water')) waterChange(s, 0.3);
    if (tasks.includes('trim')) for (const p of s.plants) addCuttings(s, p.species, trimPlant(s, p.id));
    if (tasks.includes('observe')) markDaily(tanks, 'observe');
    if (tasks.includes('snail')) markDaily(tanks, 'snail');
    updateDaily(tanks);
    claimDaily(tanks);
    // 分缸提示說成魚會吃小魚：撈進育幼盒
    if (s.nurseryBox && splitAdvice(s).some((a) => a.reason === 'fry_with_adults')) rescueFryToNursery(s, splitGroup(s, 'by_size').filter((f) => isJuvenile(f)));
    const board = orderBoard(s);
    if (board.orders.some((o) => o.kind === 'cutting')) for (const p of s.plants) addCuttings(s, p.species, trimPlant(s, p.id));
    const keep = Math.max(0, ...board.orders.filter((o) => o.kind === 'fish' && o.size === 'juvenile').map((o) => o.count));
    for (const o of [...board.orders]) {
      if (o.kind === 'fry' && orderContext(s).fry - o.count < keep) continue;
      if (fulfillOrder(tanks, o.id, breeders) > 0) first = Math.min(first, d);
    }
    earned[d] = orderBoard(s).earned;
  }
  return { first, earned, gift };
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2;
};

describe('育幼盒驗收劇本（mvp.md §4.4.2 第 5 點）', () => {
  // 第一窩什麼時候生看運氣（店裡的母魚懷孕到幾成），所以看 10 個種子的中位數，也跟「沒有育幼盒」比
  it('10 個種子的中位數：第一張訂單 ≤ 第 20 天、第 37 天訂單收入 ≥ 300，而且比沒有盒子好', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const box = seeds.map((seed) => run(seed));
    const none = seeds.map((seed) => run(seed, true));
    const dbg = JSON.stringify({ box: box.map((r) => [r.first, r.earned[37]]), none: none.map((r) => [r.first, r.earned[37]]) });
    expect(box.every((r) => r.gift < Infinity), dbg).toBe(true);
    expect.soft(median(box.map((r) => r.first)), dbg).toBeLessThanOrEqual(20);
    expect.soft(median(box.map((r) => r.earned[37])), dbg).toBeGreaterThanOrEqual(300);
    expect.soft(median(box.map((r) => r.earned[37])), dbg).toBeGreaterThan(median(none.map((r) => r.earned[37])) * 1.5);
    expect.soft(median(box.map((r) => r.first)), dbg).toBeLessThan(median(none.map((r) => (r.first === Infinity ? 99 : r.first))));
  }, 180_000);
});
