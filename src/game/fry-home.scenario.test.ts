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
  rescueFryToNursery,
  NURSERY_FRY_CAPACITY,
  PINCH_MEALS,
  setTankPurpose,
  simulate,
  transferMedia,
  type TankState,
} from '../sim';
import { chooseOption } from '../sim/choices';

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

/**
 * g37 #428 的情境：第一窩 25 尾還在育幼盒（沒滿），另一尾母魚又懷孕了（肚子已經圓了，約 8 天後生），只有一缸、錢夠買第二缸。
 * 盒裡有小魚，母魚放不進去，下一窩只能生在主缸。照任務卡做的玩家：叫買缸就買 20L、叫養水就分舊缸濾材、叫搬小魚就搬。
 * 驗收：前 15 天被吃 ≤ 3 尾（g37 兩局都 5 尾）。
 */
function secondBrood(seed: number) {
  const s = newGameState(seed);
  const tanks = [s];
  linkTanks(tanks);
  goalState(tanks).done.push('cycled');
  s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
  addFish(s, 'guppy', { ...calm, sex: 'male' });
  addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
  addFish(s, 'guppy', { ...calm, sex: 'female' }).pregnancy = 0.7;
  s.nurseryBox = true;
  for (let i = 0; i < 25; i++) {
    const f = addFish(s, 'guppy', calm);
    Object.assign(f, { lengthCm: 0.8, ageDays: 4, generation: 1, bornHours: s.hours - 96, nursery: true, pregnancy: 0 });
  }
  economy(s).coins = newTankCost(tanks, 'nano20') + 600;
  return { s, tanks };
}

function eatenSecondBrood(seed: number, follow: boolean, days = 15): number {
  const { tanks } = secondBrood(seed);
  for (let h = 0; h < days * 24; h += CHECK_HOURS) {
    const step = nextStep(tanks);
    if (follow && step) {
      if (step.target === 'shop_tank' && tanks.length === 1) {
        const t2 = buyTank(tanks, 'nano20');
        if (t2) setTankPurpose(t2, 'breeding');
      } else if (step.target === 'cycle_tank') chooseOption(tanks, 'C8', 'media');
      else if (step.target === 'move_fry' && step.tank !== undefined) moveFryHome(tanks, step.tank);
    }
    // 兩邊都會做的：快生的母魚放得進盒子就放、主缸外面的小魚盒子放得下就撈（g37 B 局點早上報告那行）
    for (const t of tanks) {
      moveDueToNursery(t);
      rescueFryToNursery(t, t.fish.filter((f) => f.alive && !f.nursery && (f.generation ?? 0) >= 1 && f.lengthCm < 1.6));
    }
    if (h % 12 === 0) for (const t of tanks) if (alive(t).length > 0) feed(t, (meal(t) * PINCH_MEALS) / 2);
    for (const t of tanks) simulate(t, CHECK_HOURS);
  }
  return tanks.reduce((n, t) => n + t.events.filter((e) => e.type === 'fry_eaten').reduce((m, e) => m + (e.count ?? 0), 0), 0);
}

describe('盒裡還有小魚、母魚又懷孕了：提早叫你買第二缸、養水、搬小魚（g37 #428）', () => {
  // 本機：照任務卡 0／0／0 尾，不照做 13／…／… 尾
  it.each([1, 2, 3])('種子 %i：照任務卡做，15 天被吃 ≤ 3 尾；不照做的會被吃更多', (seed) => {
    const followed = eatenSecondBrood(seed, true);
    const ignored = eatenSecondBrood(seed, false);
    expect(followed).toBeLessThanOrEqual(3);
    expect(ignored).toBeGreaterThan(followed);
  });
});
