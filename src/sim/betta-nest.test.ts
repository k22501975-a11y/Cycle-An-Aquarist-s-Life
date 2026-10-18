import { describe, expect, it } from 'vitest';
import { addFish, createTank, feed, FILTERS, HEATERS, LIGHTS, simulate, TANKS, waterChange, type CreateTankOptions, type Fish, type TankState } from './index';

const BREEDER: CreateTankOptions = { tank: TANKS.std40, filter: FILTERS.sponge, heater: { spec: HEATERS.h50, targetC: 27 }, light: { spec: LIGHTS.basic }, matureMedia: true };

function pair(s: TankState): { male: Fish; female: Fish } {
  s.environment.tap.kh = 2;
  s.water.kh = 2;
  s.water.tempC = s.water.tempAvgC = 27;
  const male = addFish(s, 'betta', { carriesIch: false, carries: [], sex: 'male' });
  const female = addFish(s, 'betta', { carriesIch: false, carries: [], sex: 'female' });
  for (const f of [male, female]) {
    f.acclimated = { ph: s.water.ph, gh: 6, tempC: 27 };
    f.breedingCondition = 0.9;
  }
  return { male, female };
}

/** 每天餵紅蟲、每週換水；每 6 小時跑一次條件檢查。 */
function run(s: TankState, days: number, until?: () => boolean): boolean {
  for (let h = 0; h < days * 4; h++) {
    if (h % 4 === 0) feed(s, Math.max(40, s.fish.filter((f) => f.alive && f.lengthCm > 2).length * 20), 'meat');
    simulate(s, 6);
    if (h % 28 === 27) waterChange(s, 0.2);
    if (until?.()) return true;
  }
  return false;
}

const remove = (s: TankState, f: Fish) => (s.fish = s.fish.filter((x) => x !== f));

describe('鬥魚泡巢繁殖', () => {
  it('水流太強吐不了泡巢；海綿過濾的繁殖缸會產卵，公魚顧巢、仔魚平游後跟著爸爸，兩天後該撈走公魚', () => {
    const strong = createTank({ ...BREEDER, filter: FILTERS.hangOn, seed: 901 });
    pair(strong);
    run(strong, 30);
    expect(strong.events.some((e) => e.type === 'brood_laid')).toBe(false);

    const s = createTank({ ...BREEDER, seed: 901 });
    const { male, female } = pair(s);
    expect(run(s, 40, () => !!male.brood)).toBe(true);
    expect(s.events.some((e) => e.type === 'brood_laid' && e.subjectId === male.id && e.cause === 'bubble')).toBe(true);
    // 母魚是用懷孕流程以外的方式產卵：不會懷孕
    expect(female.pregnancy).toBe(0);
    // 不撈母魚會被追咬
    const before = female.health;
    simulate(s, 12);
    expect(s.events.some((e) => e.type === 'betta_chase_female')).toBe(true);
    expect(female.health).toBeLessThan(before);
    remove(s, female);

    expect(run(s, 6, () => male.brood?.stage === 'free')).toBe(true);
    const kids = s.fish.filter((f) => f.alive && f.guardian === male.id);
    expect(kids.length).toBeGreaterThan(10);
    expect(kids.every((k) => k.species === 'betta' && k.generation === 1)).toBe(true);
    // 平游後公魚再顧兩天就不顧了，提醒玩家撈走公魚
    run(s, 3);
    expect(male.brood).toBeUndefined();
    expect(s.events.some((e) => e.type === 'brood_left' && e.subjectId === male.id)).toBe(true);
    expect(s.fish.every((f) => f.guardian === undefined)).toBe(true);
  });

  it('產完卵沒把母魚撈走，幾天內會被公魚咬死', () => {
    const s = createTank({ ...BREEDER, seed: 901 });
    const { male, female } = pair(s);
    expect(run(s, 40, () => !!male.brood)).toBe(true);
    run(s, 6, () => !female.alive);
    expect(female.alive).toBe(false);
    expect(s.events.some((e) => e.type === 'fish_died' && e.subjectId === female.id && e.cause === 'betta_attack')).toBe(true);
  });

  it('顧巢時開強水流，泡巢被沖散，公魚會把卵吃掉', () => {
    const s = createTank({ ...BREEDER, seed: 902 });
    const { male, female } = pair(s);
    expect(run(s, 40, () => !!male.brood)).toBe(true);
    remove(s, female);
    s.equipment.filter = { spec: FILTERS.hangOn, on: true };
    run(s, 3);
    expect(s.events.some((e) => e.type === 'brood_eaten' && e.subjectId === male.id && e.cause === 'current')).toBe(true);
    expect(s.fish.some((f) => f.guardian === male.id)).toBe(false);
  });
});
