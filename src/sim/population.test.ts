import { describe, expect, it } from 'vitest';
import {
  addFish,
  addPlant,
  createTank,
  feed,
  FILTERS,
  FISH_SPECIES,
  HEATERS,
  isJuvenile,
  LIGHTS,
  normalizeState,
  observeSymptoms,
  simulate,
  TANKS,
  type CreateTankOptions,
  type Fish,
  type FishSpeciesId,
  type TankState,
} from './index';

const MATURE: CreateTankOptions = {
  tank: TANKS.std90,
  filter: FILTERS.canister,
  heater: { spec: HEATERS.h100, targetC: 25 },
  light: { spec: LIGHTS.basic },
  matureMedia: true,
};

/** 放剛出生的幼體（直接改體長），不帶白點蟲。 */
function addYoung(s: TankState, species: FishSpeciesId, count: number): Fish[] {
  return Array.from({ length: count }, () => {
    const f = addFish(s, species, { carriesIch: false, pregnant: false });
    f.lengthCm = FISH_SPECIES[species].birthLengthCm;
    f.stress = 0;
    return f;
  });
}

function addAdults(s: TankState, species: FishSpeciesId, count: number, sex: 'male' | 'female' = 'male'): Fish[] {
  return Array.from({ length: count }, () => addFish(s, species, { carriesIch: false, sex, pregnant: false }));
}

/** 每天餵兩次，份量依缸內活體的食量計算。 */
function runDays(s: TankState, days: number): void {
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      if (h === 8 || h === 18) {
        const ration = s.fish.filter((f) => f.alive).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg * Math.min(1, f.lengthCm / FISH_SPECIES[f.species].adultLengthCm) ** 2, 0);
        feed(s, ration / 2);
      }
      simulate(s, 1);
    }
  }
}

const young = (s: TankState, species: FishSpeciesId) => s.fish.filter((f) => f.alive && f.species === species && isJuvenile(f)).length;

describe('繁殖（Phase 0 簡化版）', () => {
  it('有公魚、母魚狀況好時，孔雀魚會懷孕並生下一胎仔魚', () => {
    const s = createTank({ ...MATURE, seed: 101 });
    addAdults(s, 'guppy', 1, 'male');
    addAdults(s, 'guppy', 2, 'female');
    runDays(s, 45);
    const births = s.events.filter((e) => e.type === 'fry_born');
    expect(births.length).toBeGreaterThan(0);
    expect(births[0].count).toBeGreaterThanOrEqual(FISH_SPECIES.guppy.breeding!.broodMin);
    expect(s.fish.length).toBeGreaterThan(3);
  });

  it('只有母魚（沒懷孕）就不會生', () => {
    const s = createTank({ ...MATURE, seed: 102 });
    addAdults(s, 'guppy', 3, 'female');
    runDays(s, 45);
    expect(s.events.some((e) => e.type === 'fry_born')).toBe(false);
  });

  it('店裡買來的孔雀魚母魚常常已經懷孕', () => {
    const s = createTank({ ...MATURE, seed: 103 });
    const females = addAdults(s, 'guppy', 20, 'female').map((f) => f);
    // 用預設機率重新買一次（不指定 pregnant）。
    const store = Array.from({ length: 20 }, () => addFish(s, 'guppy', { carriesIch: false, sex: 'female' }));
    expect(females.every((f) => f.pregnancy === 0)).toBe(true);
    const pregnant = store.filter((f) => f.pregnancy > 0).length;
    expect(pregnant).toBeGreaterThan(6);
    expect(pregnant).toBeLessThan(20);
  });

  it('仔魚會慢慢長大，長大後就不再是幼體', () => {
    const s = createTank({ ...MATURE, seed: 104 });
    const [fry] = addYoung(s, 'guppy', 1);
    runDays(s, 10);
    expect(fry.lengthCm).toBeGreaterThan(FISH_SPECIES.guppy.birthLengthCm + 0.5);
    expect(isJuvenile(fry)).toBe(true);
    runDays(s, 50);
    expect(isJuvenile(fry)).toBe(false);
  });
});

describe('混養：吃仔魚、吃仔蝦', () => {
  it('成魚會吃仔魚；水草越密，仔魚活下來越多', () => {
    const bare = createTank({ ...MATURE, seed: 110 });
    addAdults(bare, 'guppy', 4);
    addYoung(bare, 'guppy', 40);
    const planted = structuredClone(bare);
    for (let i = 0; i < 8; i++) addPlant(planted, 'anubias', 18);

    runDays(bare, 14);
    runDays(planted, 14);
    expect(young(bare, 'guppy')).toBeLessThan(25);
    expect(young(planted, 'guppy')).toBeGreaterThan(young(bare, 'guppy') + 8);
  });

  it('沒有掠食者時仔魚不會被吃', () => {
    const s = createTank({ ...MATURE, seed: 111 });
    addYoung(s, 'guppy', 20);
    runDays(s, 14);
    expect(s.fish.filter((f) => f.alive).length).toBe(20);
  });

  it('孔雀魚、斑馬魚都會吃仔蝦；只養蝦的缸仔蝦能長大', () => {
    const withFish = createTank({ ...MATURE, seed: 112 });
    addAdults(withFish, 'zebrafish', 6);
    addYoung(withFish, 'cherry_shrimp', 30);
    const shrimpOnly = createTank({ ...MATURE, seed: 112 });
    addYoung(shrimpOnly, 'cherry_shrimp', 30);

    runDays(withFish, 21);
    runDays(shrimpOnly, 21);
    expect(young(withFish, 'cherry_shrimp') + withFish.fish.filter((f) => f.species === 'cherry_shrimp' && f.alive && !isJuvenile(f)).length).toBeLessThan(15);
    expect(shrimpOnly.fish.filter((f) => f.alive).length).toBe(30);
  });

  it('被吃掉的幼體會從缸裡消失，碎屑變成有機廢物', () => {
    const s = createTank({ ...MATURE, seed: 113 });
    addAdults(s, 'guppy', 4);
    addYoung(s, 'guppy', 30);
    runDays(s, 7);
    expect(s.fish.length).toBeLessThan(34);
    expect(s.fish.every((f) => f.alive)).toBe(true);
  });
});

describe('混養：斑馬魚咬鰭', () => {
  it('斑馬魚數量不足時會咬孔雀魚公魚的長尾巴，看得到鰭破損', () => {
    const s = createTank({ ...MATURE, seed: 120 });
    addAdults(s, 'zebrafish', 3);
    const males = addAdults(s, 'guppy', 4, 'male');
    let seenTorn = false;
    for (let d = 0; d < 14; d++) {
      runDays(s, 1);
      if (males.some((m) => observeSymptoms(s, m).includes('torn_fins'))) seenTorn = true;
    }
    expect(seenTorn).toBe(true);
    expect(males.some((m) => (m.recentDamage['fin_nip'] ?? 0) > 0)).toBe(true);
  });

  it('群游足夠時咬得比較少；母魚（短尾）不會被咬', () => {
    const nipCount = (zebras: number, seed: number) => {
      const s = createTank({ ...MATURE, seed });
      addAdults(s, 'zebrafish', zebras);
      const males = addAdults(s, 'guppy', 6, 'male');
      const females = addAdults(s, 'guppy', 6, 'female');
      let nips = 0;
      const last = new Map<Fish, number>();
      for (let h = 0; h < 30 * 24; h++) {
        simulate(s, 1);
        if (h % 12 === 0) feed(s, s.fish.length * 8);
        for (const m of [...males, ...females]) {
          if (m.finDamage > (last.get(m) ?? 0) + 0.1) nips++;
          last.set(m, m.finDamage);
        }
      }
      return { nips, femaleDamage: females.reduce((sum, f) => sum + f.finDamage, 0) };
    };
    const small = nipCount(3, 121);
    const school = nipCount(8, 121);
    expect(small.nips).toBeGreaterThan(school.nips);
    expect(small.femaleDamage).toBe(0);
    expect(school.femaleDamage).toBe(0);
  });

  it('鰭會慢慢長回來', () => {
    const s = createTank({ ...MATURE, seed: 122 });
    const [m] = addAdults(s, 'guppy', 1, 'male');
    m.finDamage = 0.5;
    runDays(s, 14);
    expect(m.finDamage).toBeLessThan(0.1);
  });
});

describe('舊存檔相容', () => {
  it('補上舊存檔缺少的性別、體長、鰭與懷孕欄位', () => {
    const s = createTank({ ...MATURE, seed: 130 });
    addAdults(s, 'guppy', 2);
    const old = JSON.parse(JSON.stringify(s));
    for (const f of old.fish) {
      delete f.sex;
      delete f.lengthCm;
      delete f.finDamage;
      delete f.pregnancy;
    }
    const fixed = normalizeState(old as TankState);
    for (const f of fixed.fish) {
      expect(['male', 'female']).toContain(f.sex);
      expect(f.lengthCm).toBe(FISH_SPECIES.guppy.adultLengthCm);
      expect(f.finDamage).toBe(0);
      expect(f.pregnancy).toBe(0);
    }
    simulate(fixed, 24);
  });
});
