import { describe, expect, it } from 'vitest';
import {
  addFish,
  colorProgress,
  createTank,
  FILTERS,
  FISH_SPECIES,
  growthStage,
  HEATERS,
  LIGHTS,
  maxLengthCm,
  sexVisible,
  simulate,
  TANKS,
  waterChange,
  type CreateTankOptions,
  type Fish,
  type GrowthStage,
  type TankState,
} from './index';
import { createFish } from './processes/population';

const MATURE: CreateTankOptions = {
  tank: TANKS.std90,
  filter: FILTERS.canister,
  heater: { spec: HEATERS.h100, targetC: 25 },
  light: { spec: LIGHTS.basic },
  matureMedia: true,
};

/** 剛出生的仔魚（不放成魚，免得被吃）。 */
function newborn(s: TankState, species: Fish['species'], n: number): Fish[] {
  const out: Fish[] = [];
  for (let i = 0; i < n; i++) {
    const f = createFish(s, species, { lengthCm: FISH_SPECIES[species].birthLengthCm, ageDays: 0 });
    s.fish.push(f);
    out.push(f);
  }
  return out;
}

/** 每天兩餐、每週換三成水。 */
function raise(s: TankState, days: number, onDay?: (d: number) => void): void {
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      if (h === 8 || h === 18) for (const f of s.fish) if (f.alive) f.hunger = Math.min(f.hunger, 0.3);
      simulate(s, 1);
    }
    if (d % 7 === 6) waterChange(s, 0.3);
    onDay?.(d);
  }
}

describe('成長階段（design/growth.md）', () => {
  it('孔雀魚依序經過仔魚、幼魚、轉色、亞成、成魚，天數接近現實', () => {
    const s = createTank({ ...MATURE, seed: 301 });
    const [fry] = newborn(s, 'guppy', 1);
    const firstDay = new Map<GrowthStage, number>();
    raise(s, 110, (d) => {
      const st = growthStage(fry);
      if (!firstDay.has(st)) firstDay.set(st, d);
    });
    expect([...firstDay.keys()]).toEqual(['fry', 'juvenile', 'coloring', 'subadult', 'adult']);
    expect(firstDay.get('juvenile')!).toBeGreaterThan(8);
    expect(firstDay.get('juvenile')!).toBeLessThan(22);
    expect(firstDay.get('coloring')!).toBeGreaterThan(25);
    expect(firstDay.get('coloring')!).toBeLessThan(45);
    expect(firstDay.get('subadult')!).toBeGreaterThan(48);
    expect(firstDay.get('subadult')!).toBeLessThan(75);
  });

  it('轉色前看不出公母，轉色後才看得出來', () => {
    const s = createTank({ ...MATURE, seed: 302 });
    const [fry] = newborn(s, 'guppy', 1);
    expect(sexVisible(fry)).toBe(false);
    expect(colorProgress(fry)).toBe(0);
    raise(s, 25);
    expect(sexVisible(fry)).toBe(false);
    raise(s, 35);
    expect(sexVisible(fry)).toBe(true);
    expect(colorProgress(fry)).toBeGreaterThan(0.8);
  });

  it('同一胎有快有慢', () => {
    const s = createTank({ ...MATURE, seed: 303 });
    const mother = addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: true });
    mother.pregnancy = 0.99;
    simulate(s, 48);
    const brood = s.fish.filter((f) => f !== mother);
    expect(brood.length).toBeGreaterThan(5);
    const rates = brood.map((f) => f.growthRate ?? 1);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.15);
  });

  it('仔魚期太擠，長大後永久偏小；分出去以後也追不回來', () => {
    const roomy = createTank({ ...MATURE, seed: 304 });
    const [g] = newborn(roomy, 'guppy', 1);
    const cramped = createTank({ ...MATURE, tank: TANKS.nano20, seed: 304 });
    newborn(cramped, 'guppy', 40);
    raise(roomy, 35);
    raise(cramped, 35);
    const b = cramped.fish.find((f) => f.alive)!;
    expect(b.stunted ?? 0).toBeGreaterThan(0.2);
    expect(g.stunted ?? 0).toBeLessThan(0.05);
    expect(maxLengthCm(b)).toBeLessThan(maxLengthCm(g) * 0.96);
  });

  it('米蝦靠脫殼長大：體長一階一階跳，脫下的殼留在缸底', () => {
    const s = createTank({ ...MATURE, seed: 305, tap: { kh: 4, no3: 2, co2: 3, gh: 7 } });
    const [shrimp] = newborn(s, 'cherry_shrimp', 1);
    const lengths = new Set<number>();
    for (let d = 0; d < 30; d++) {
      raise(s, 1);
      lengths.add(Math.round(shrimp.lengthCm * 1e6));
    }
    expect(shrimp.alive).toBe(true);
    // 30 天大約脫 4～6 次殼，每次長一截，中間不動
    expect(lengths.size).toBeGreaterThanOrEqual(3);
    expect(lengths.size).toBeLessThanOrEqual(9);
    expect(shrimp.lengthCm).toBeGreaterThan(FISH_SPECIES.cherry_shrimp.birthLengthCm * 2);
    expect((s.molts ?? []).length).toBeGreaterThan(0);
  });

  it('GH 太低的蝦缸會卡殼死蝦，死因是脫殼失敗', () => {
    const run = (gh: number) => {
      const s = createTank({ ...MATURE, seed: 306, tap: { kh: 4, no3: 2, co2: 3, gh } });
      newborn(s, 'cherry_shrimp', 30);
      raise(s, 40);
      return s;
    };
    const soft = run(1);
    const hard = run(7);
    const stuck = (s: TankState) => s.fish.filter((f) => f.stuckMolt).length;
    expect(stuck(soft)).toBeGreaterThan(stuck(hard) + 3);
    expect(soft.events.some((e) => e.type === 'fish_died' && e.cause === 'molt')).toBe(true);
  });

  it('壽命最後一段變成老魚', () => {
    const s = createTank({ ...MATURE, seed: 307 });
    const f = addFish(s, 'guppy', { carriesIch: false });
    f.ageDays = FISH_SPECIES.guppy.lifespanDays * f.constitution * 0.9;
    expect(growthStage(f)).toBe('old');
  });
});
