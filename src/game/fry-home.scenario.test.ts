import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import {
  addFish,
  bacteriaCapacity,
  buyTank,
  economy,
  FISH_SPECIES,
  feed,
  goalState,
  linkTanks,
  moveDueToNursery,
  moveFryHome,
  newTankCost,
  nextStep,
  NURSERY_FRY_CAPACITY,
  PINCH_MEALS,
  setTankPurpose,
  simulate,
  transferMedia,
  type TankState,
} from '../sim';

/**
 * g36 #425 的情境：第 9 天第二窩出生、育幼盒滿了，第 10 天買了 20L 第二缸當繁殖缸、分舊缸濾材養水（約 2 天）。
 * 照任務卡做的玩家：任務卡叫搬小魚就搬。驗收：買缸之後 5 天被吃的小魚 ≤ 3 尾（g36 沒叫搬，被吃 17 尾）。
 */
const calm = { carriesIch: false, carries: [] as never[] };
const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

function fullBox(seed: number) {
  const s = newGameState(seed);
  const tanks = [s];
  linkTanks(tanks);
  goalState(tanks).done.push('cycled');
  s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
  addFish(s, 'guppy', { ...calm, sex: 'male' });
  addFish(s, 'guppy', { ...calm, sex: 'male' });
  addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
  // 另一尾母魚兩三天後又要生：生在主缸外面（盒子滿了）
  addFish(s, 'guppy', { ...calm, sex: 'female' }).pregnancy = 0.85;
  s.nurseryBox = true;
  const fry = (nursery: boolean) => {
    const f = addFish(s, 'guppy', calm);
    Object.assign(f, { lengthCm: 0.7, ageDays: 2, generation: 1, bornHours: s.hours - 48, nursery: nursery || undefined });
  };
  for (let i = 0; i < NURSERY_FRY_CAPACITY; i++) fry(true);
  for (let i = 0; i < 8; i++) fry(false);
  economy(s).coins = newTankCost(tanks, 'nano20') + 500;
  const t2 = buyTank(tanks, 'nano20')!;
  setTankPurpose(t2, 'breeding');
  transferMedia(s, t2);
  return { s, tanks };
}

/** 任務卡多久看一次（遊戲小時；7 倍速下約現實 35 分鐘）。 */
const CHECK_HOURS = 4;

/** 買缸之後 days 天被吃了幾尾；follow：任務卡說搬小魚就搬（其他兩邊一樣）。 */
function eatenAfterBuying(seed: number, follow: boolean, days = 5): number {
  const { s, tanks } = fullBox(seed);
  const start = s.hours;
  for (let h = 0; h < days * 24; h += CHECK_HOURS) {
    // 一天看幾次任務卡：叫搬小魚就搬（g36 的玩家也是照任務卡做）；快生的母魚兩邊都放得進育幼盒就放
    const step = nextStep(tanks);
    if (follow && step?.target === 'move_fry' && step.tank !== undefined) moveFryHome(tanks, step.tank);
    for (const t of tanks) moveDueToNursery(t);
    if (h % 12 === 0) for (const t of tanks) if (alive(t).length > 0) feed(t, (meal(t) * PINCH_MEALS) / 2);
    for (const t of tanks) simulate(t, CHECK_HOURS);
  }
  return tanks.reduce((n, t) => n + t.events.filter((e) => e.type === 'fry_eaten' && e.hours >= start).reduce((m, e) => m + (e.count ?? 0), 0), 0);
}

describe('第二缸養好水就叫你搬小魚（g36 #425）', () => {
  // 本機：照任務卡搬 0／0／0 尾，不搬 8／8／9 尾
  it.each([1, 2, 3])('種子 %i：照任務卡搬，買缸後 5 天被吃 ≤ 3 尾；不搬的會被吃更多', (seed) => {
    const followed = eatenAfterBuying(seed, true);
    expect(followed).toBeLessThanOrEqual(3);
    expect(eatenAfterBuying(seed, false)).toBeGreaterThan(followed);
  });
});
