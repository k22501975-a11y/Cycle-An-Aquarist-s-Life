import { describe, expect, it } from 'vitest';
import {
  addFish,
  addHardscape,
  createTank,
  feed,
  FILTERS,
  guardianOf,
  HARDSCAPE,
  HEATERS,
  isGuarding,
  LIGHTS,
  maleChance,
  simulate,
  TANKS,
  territoryStress,
  waterChange,
  type CreateTankOptions,
  type Fish,
  type TankState,
} from './index';

const MATURE: CreateTankOptions = { tank: TANKS.std90, filter: FILTERS.canister, heater: { spec: HEATERS.h100, targetC: 26 }, light: { spec: LIGHTS.basic }, matureMedia: true };

/** 軟水：KH 低，pH 落在 7 左右（像放了沉木的缸）。 */
function soften(s: TankState) {
  s.environment.tap.kh = 1;
  s.water.kh = 1;
}

function pair(s: TankState): { male: Fish; female: Fish } {
  soften(s);
  const male = addFish(s, 'apisto', { carriesIch: false, sex: 'male' });
  const female = addFish(s, 'apisto', { carriesIch: false, sex: 'female' });
  for (const f of [male, female]) {
    f.acclimated = { ph: s.water.ph, gh: 6, tempC: 26 };
    f.breedingCondition = 0.9;
  }
  return { male, female };
}

/** 每天餵、每週換水，跑到條件成立或時間到。 */
function run(s: TankState, days: number, until?: () => boolean) {
  for (let d = 0; d < days; d++) {
    feed(s, Math.max(40, s.fish.filter((f) => f.alive && f.lengthCm > 2).length * 18), 'meat');
    simulate(s, 24);
    if (d % 7 === 6) waterChange(s, 0.2);
    if (until?.()) return d;
  }
  return days;
}

describe('親魚護幼（market-and-breeding.md §1.3.3）', () => {
  it('沒有洞穴不產卵；放了石頭就會在洞裡產卵，母魚轉護幼色、一週後帶出一群仔魚', () => {
    const bare = createTank({ ...MATURE, seed: 801 });
    pair(bare);
    run(bare, 40);
    expect(bare.events.some((e) => e.type === 'brood_laid')).toBe(false);

    const s = createTank({ ...MATURE, seed: 801 });
    addHardscape(s, HARDSCAPE.slate);
    const { female } = pair(s);
    run(s, 80, () => isGuarding(female));
    expect(s.events.some((e) => e.type === 'brood_laid')).toBe(true);
    expect(isGuarding(female)).toBe(true);
    expect(female.broodColor!).toBeGreaterThan(0.5);
    const kids = s.fish.filter((f) => f.alive && f.guardian === female.id);
    expect(kids.length).toBeGreaterThan(10);
    expect(guardianOf(s, kids[0])).toBe(female);
  });

  it('太吵（缸裡很多別的魚）會讓母魚把卵吃掉', () => {
    const s = createTank({ ...MATURE, seed: 802 });
    addHardscape(s, HARDSCAPE.slate);
    const { female } = pair(s);
    for (let i = 0; i < 12; i++) addFish(s, 'zebrafish', { carriesIch: false });
    run(s, 120, () => s.events.some((e) => e.type === 'brood_eaten'));
    expect(s.events.some((e) => e.type === 'brood_eaten' && e.subjectId === female.id)).toBe(true);
  });

  it('跟著媽媽的仔魚比較不會被吃；母魚護幼時其他魚會緊張', () => {
    const s = createTank({ ...MATURE, seed: 803 });
    addHardscape(s, HARDSCAPE.slate);
    const { female } = pair(s);
    run(s, 80, () => isGuarding(female));
    expect(isGuarding(female)).toBe(true);
    const guppy = addFish(s, 'guppy', { carriesIch: false });
    expect(territoryStress(s, guppy)).toBeGreaterThan(0);
    // 同一缸複製一份，把媽媽撈走：仔魚沒人保護
    const alone = structuredClone(s);
    alone.fish = alone.fish.filter((f) => f.id !== female.id);
    const kids = (t: TankState) => t.fish.filter((f) => f.alive && f.species === 'apisto' && f.lengthCm < 2).length;
    run(s, 10);
    run(alone, 10);
    expect(kids(s)).toBeGreaterThan(kids(alone));
  });

  it('水溫高公魚比較多', () => {
    expect(maleChance(29)).toBeGreaterThan(0.75);
    expect(maleChance(24)).toBeLessThan(0.35);
  });
});
