import { describe, expect, it } from 'vitest';
import {
  addFish,
  buyNurseryBox,
  createTank,
  economy,
  feed,
  FILTERS,
  FISH_SPECIES,
  HEATERS,
  isJuvenile,
  LIGHTS,
  moveDueToNursery,
  moveToNursery,
  NURSERY_FRY_CAPACITY,
  nurseryFish,
  nurseryRefusal,
  price,
  simulate,
  TANKS,
  type Fish,
  type TankState,
} from './index';

function tank(seed: number): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed });
  economy(s);
  return s;
}

function adults(s: TankState, n: number, sex: 'male' | 'female'): Fish[] {
  return Array.from({ length: n }, () => addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }));
}

function fry(s: TankState, n: number): Fish[] {
  return Array.from({ length: n }, () => {
    const f = addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
    f.lengthCm = FISH_SPECIES.guppy.birthLengthCm;
    f.ageDays = 0;
    f.generation = 1;
    return f;
  });
}

function days(s: TankState, n: number): void {
  for (let d = 0; d < n * 2; d++) {
    feed(s, s.fish.filter((f) => f.alive).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2);
    simulate(s, 12);
  }
}

describe('育幼盒（mvp.md §4.4.2，#187）', () => {
  it('商店 150 元', () => {
    expect(price('nursery:box')).toBe(150);
  });

  it('第一次有母魚快生了，阿德老闆送一個，只送一次', () => {
    const s = tank(1);
    adults(s, 1, 'male');
    const [mom] = adults(s, 1, 'female');
    mom.pregnancy = 0.84;
    days(s, 1);
    expect(s.nurseryBox).toBe(true);
    const gift = s.events.filter((e) => e.type === 'nursery_gift');
    expect(gift).toHaveLength(1);
    expect(gift[0].subjectId).toBe(mom.id);
    expect(economy(s).nurseryGifted).toBe(true);
    // 拿掉盒子再來一次也不會再送
    s.nurseryBox = false;
    mom.pregnancy = 0.9;
    days(s, 1);
    expect(s.events.filter((e) => e.type === 'nursery_gift')).toHaveLength(1);
  });

  it('盒裡生的小魚大魚吃不到；母魚生完自己回主缸', () => {
    const s = tank(2);
    adults(s, 3, 'male');
    const [mom] = adults(s, 1, 'female');
    buyNurseryBox(s);
    mom.pregnancy = 0.95;
    expect(moveDueToNursery(s)).toBe(mom);
    expect(mom.nursery).toBe(true);
    days(s, 3);
    expect(mom.nursery).toBeFalsy();
    const born = s.fish.filter((f) => f.alive && isJuvenile(f));
    expect(born.length).toBeGreaterThan(0);
    expect(born.every((f) => f.nursery)).toBe(true);
    // 被吃的事件一筆都沒有
    days(s, 5);
    expect(s.events.some((e) => e.type === 'fry_eaten')).toBe(false);
  });

  it('沒有盒子的對照組：同樣的缸會被吃掉一些', () => {
    const s = tank(2);
    adults(s, 3, 'male');
    fry(s, 20);
    days(s, 6);
    expect(s.events.some((e) => e.type === 'fry_eaten')).toBe(true);
  });

  it('撈進盒裡的小魚長到 1.6 cm 自己回主缸，記一筆', () => {
    const s = tank(3);
    adults(s, 2, 'male');
    buyNurseryBox(s);
    const kids = fry(s, 5);
    for (const f of kids) expect(moveToNursery(s, f.id)).toBe(true);
    for (const f of kids) f.lengthCm = 1.62;
    days(s, 1);
    expect(nurseryFish(s)).toHaveLength(0);
    expect(s.events.some((e) => e.type === 'nursery_released' && e.count === 5)).toBe(true);
  });

  it('容量：一尾母魚，或最多 30 尾小魚；母魚和小魚不混放', () => {
    const s = tank(4);
    const [mom, mom2] = adults(s, 2, 'female');
    const [male] = adults(s, 1, 'male');
    expect(nurseryRefusal(s, mom)).toMatch(/還沒有育幼盒/);
    buyNurseryBox(s);
    expect(nurseryRefusal(s, male)).not.toBeNull();
    expect(nurseryRefusal(s, mom)).not.toBeNull(); // 沒懷孕
    mom.pregnancy = mom2.pregnancy = 0.5;
    expect(moveToNursery(s, mom.id)).toBe(true);
    expect(nurseryRefusal(s, mom2)).toMatch(/已經有一尾母魚/);
    const kids = fry(s, NURSERY_FRY_CAPACITY + 1);
    expect(nurseryRefusal(s, kids[0])).toMatch(/母魚還在/);
    mom.nursery = undefined;
    kids.forEach((f) => moveToNursery(s, f.id));
    expect(nurseryFish(s)).toHaveLength(NURSERY_FRY_CAPACITY);
    expect(nurseryRefusal(s, kids[NURSERY_FRY_CAPACITY])).toMatch(/滿了/);
    expect(nurseryRefusal(s, mom2)).toMatch(/還有小魚/);
  });

  it('盒裡的母魚不會再跟公魚配對', () => {
    const s = tank(5);
    adults(s, 3, 'male');
    const [mom] = adults(s, 1, 'female');
    buyNurseryBox(s);
    mom.pregnancy = 0.2;
    moveToNursery(s, mom.id);
    mom.pregnancy = 0;
    days(s, 10);
    expect(mom.pregnancy).toBe(0);
  });
});
