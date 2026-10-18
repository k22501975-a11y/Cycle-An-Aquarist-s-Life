import { describe, expect, it } from 'vitest';
import {
  addFish,
  createTank,
  feed,
  FILTERS,
  FISH_SPECIES,
  foodLots,
  HEATERS,
  LIGHTS,
  simulate,
  TANKS,
  waterChange,
  type CreateTankOptions,
  type FishSpeciesId,
  type FoodGrade,
  type FoodKind,
  type TankState,
} from './index';

const MATURE: CreateTankOptions = {
  tank: TANKS.std90,
  filter: FILTERS.canister,
  heater: { spec: HEATERS.h100, targetC: 25 },
  light: { spec: LIGHTS.basic },
  matureMedia: true,
};

function tankWith(...groups: Array<[FishSpeciesId, number]>): TankState {
  const s = createTank(MATURE);
  for (const [species, n] of groups) {
    for (let i = 0; i < n; i++) {
      const f = addFish(s, species, { carriesIch: false, pregnant: false });
      f.stress = 0;
    }
  }
  return s;
}

const ration = (s: TankState, species?: FishSpeciesId) =>
  s.fish.filter((f) => f.alive && (!species || f.species === species)).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg, 0);

/** 每天兩餐，each 是每一餐要餵的東西。 */
function runDays(s: TankState, days: number, each: (s: TankState) => void): void {
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      if (h === 8 || h === 18) each(s);
      simulate(s, 1);
    }
  }
}

const avg = (s: TankState, species: FishSpeciesId, key: 'hunger' | 'nutrition' | 'colorBoost' | 'breedingCondition') => {
  const list = s.fish.filter((f) => f.alive && f.species === species);
  return list.reduce((sum, f) => sum + (f[key] ?? 0), 0) / list.length;
};

describe('飼料的種類與等級（design/food.md）', () => {
  it('混養缸只餵漂浮飼料，上層的孔雀魚搶光，底層的蝦吃不飽；加餵沉底的蝦就吃得到', () => {
    const floatOnly = tankWith(['guppy', 6], ['cherry_shrimp', 10]);
    runDays(floatOnly, 3, (s) => feed(s, ration(s) / 2, 'floating'));
    const both = tankWith(['guppy', 6], ['cherry_shrimp', 10]);
    runDays(both, 3, (s) => {
      feed(s, ration(s, 'guppy') / 2, 'floating');
      feed(s, ration(s, 'cherry_shrimp') / 2, 'sinking');
    });
    expect(avg(floatOnly, 'cherry_shrimp', 'hunger')).toBeGreaterThan(avg(floatOnly, 'guppy', 'hunger') + 0.1);
    expect(avg(both, 'cherry_shrimp', 'hunger')).toBeLessThan(avg(floatOnly, 'cherry_shrimp', 'hunger') - 0.1);
  });

  it('孔雀魚只餵沉底飼料會吃不飽', () => {
    const s = tankWith(['guppy', 6]);
    runDays(s, 3, (t) => feed(t, ration(t) / 2, 'sinking'));
    const f = tankWith(['guppy', 6]);
    runDays(f, 3, (t) => feed(t, ration(t) / 2, 'floating'));
    expect(avg(s, 'guppy', 'hunger')).toBeGreaterThan(avg(f, 'guppy', 'hunger'));
  });

  it('長期餵專業飼料：營養變好、發色上來；改餵平價後發色慢慢退回去', () => {
    const s = tankWith(['guppy', 4]);
    runDays(s, 21, (t) => feed(t, ration(t) / 2, 'floating', 4));
    expect(avg(s, 'guppy', 'nutrition')).toBeGreaterThan(0.75);
    const boosted = avg(s, 'guppy', 'colorBoost');
    expect(boosted).toBeGreaterThan(0.4);
    runDays(s, 21, (t) => feed(t, ration(t) / 2, 'floating', 1));
    expect(avg(s, 'guppy', 'colorBoost')).toBeLessThan(boosted * 0.6);
    expect(avg(s, 'guppy', 'nutrition')).toBeLessThan(0.5);
  });

  it('餵肉食讓魚準備繁殖，比標準薄片高', () => {
    const meat = tankWith(['guppy', 4]);
    runDays(meat, 7, (t) => feed(t, ration(t) / 2, 'meat', 2));
    const flakes = tankWith(['guppy', 4]);
    runDays(flakes, 7, (t) => feed(t, ration(t) / 2, 'floating', 2));
    expect(avg(meat, 'guppy', 'breedingCondition')).toBeGreaterThan(avg(flakes, 'guppy', 'breedingCondition') + 0.15);
  });

  it('沒人吃的殘餌：平價的比高級的髒，肉食最髒', () => {
    const dirt = (kind: FoodKind, grade: FoodGrade) => {
      const s = tankWith();
      feed(s, 100, kind, grade);
      const before = s.water.organicMg;
      simulate(s, 24);
      return s.water.organicMg - before;
    };
    expect(dirt('sinking', 1)).toBeGreaterThan(dirt('sinking', 3) * 1.3);
    expect(dirt('meat', 2)).toBeGreaterThan(dirt('sinking', 2));
  });

  it('黏缸壁的飼料放得比沉底的久', () => {
    const left = (kind: FoodKind) => {
      const s = tankWith();
      feed(s, 100, kind);
      simulate(s, 4);
      return s.water.foodMg;
    };
    expect(left('sticky')).toBeGreaterThan(left('sinking') * 3);
  });

  it('總量和各批對得起來：舊存檔的殘餌、換水虹吸都會跟著改', () => {
    const s = tankWith();
    s.water.foodMg = 30;
    expect(foodLots(s.water)).toEqual([{ kind: 'sinking', grade: 2, mg: 30 }]);
    feed(s, 10, 'meat', 3);
    expect(s.water.foodMg).toBeCloseTo(40);
    waterChange(s, 0.5);
    const lots = foodLots(s.water);
    expect(lots.reduce((a, l) => a + l.mg, 0)).toBeCloseTo(s.water.foodMg);
    expect(lots.find((l) => l.kind === 'meat')!.mg).toBeCloseTo(10 * 0.6);
  });
});
