import { describe, expect, it } from 'vitest';
import {
  addFish,
  createTank,
  cross,
  FILTERS,
  HEATERS,
  legacyGenome,
  lookIndex,
  phenotype,
  predictOffspring,
  storeGenome,
  strainName,
  TANKS,
  simulate,
  type GuppyGenome,
} from './index';
import { normalizeState } from './state';

const rng = () => ({ seed: 42 });
const share = (n: number, f: () => boolean) => {
  let hit = 0;
  for (let i = 0; i < n; i++) if (f()) hit++;
  return hit / n;
};

describe('孔雀魚遺傳', () => {
  it('店裡的品系照名字長：紅蛇王公魚就是紅蛇王', () => {
    const r = rng();
    for (let i = 0; i < 5; i++) {
      const g = storeGenome(r, 'male', i);
      expect(lookIndex(phenotype(g))).toBe(i);
    }
    expect(strainName(phenotype(storeGenome(r, 'male', 4)))).toBe('紅蛇王');
  });

  it('白子是隱性：帶因 × 帶因約 25% 白子', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 0);
    const dad = storeGenome(r, 'male', 0);
    mom.albino = [0, 1];
    dad.albino = [0, 1];
    const p = share(4000, () => phenotype(cross(r, mom, dad, 'male')).albino);
    expect(p).toBeGreaterThan(0.22);
    expect(p).toBeLessThan(0.28);
  });

  it('草尾在 Y 上：草尾爸爸的兒子都是草尾，女兒都不是', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 3);
    const dad = storeGenome(r, 'male', 0);
    expect(share(500, () => phenotype(cross(r, mom, dad, 'male')).grass)).toBe(1);
    expect(share(500, () => phenotype(cross(r, mom, dad, 'female')).grass)).toBe(0);
  });

  it('蛇紋在 Y 上：兒子幾乎都是蛇王，偶爾換到 X 傳給女兒（約 1%）', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 3);
    const dad: GuppyGenome = { ...storeGenome(r, 'male', 4), snakeX: [0] };
    const sons = share(4000, () => phenotype(cross(r, mom, dad, 'male')).snake);
    expect(sons).toBeGreaterThan(0.97);
    const carrierDaughters = share(4000, () => cross(r, mom, dad, 'female').snakeX.includes(1));
    expect(carrierDaughters).toBeGreaterThan(0.002);
    expect(carrierDaughters).toBeLessThan(0.03);
  });

  it('禮服是顯性：禮服 × 一般約一半禮服', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 0);
    const dad = storeGenome(r, 'male', 3);
    dad.tuxedo = [0, 1];
    const p = share(4000, () => phenotype(cross(r, mom, dad, 'male')).tuxedo);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it('挑大尾鰭的配，子代尾鰭比較大；近親繁殖會退化', () => {
    const r = rng();
    const mom = { ...storeGenome(r, 'female', 4), tail: 80 };
    const dad = { ...storeGenome(r, 'male', 4), tail: 80 };
    const avg = (inbreeding: number) => {
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += cross(r, mom, dad, 'male', inbreeding).tail;
      return sum / 2000;
    };
    const outbred = avg(0);
    expect(outbred).toBeGreaterThan(65);
    expect(avg(0.5)).toBeLessThan(outbred - 10);
  });

  it('配對預測：白子帶因 × 白子帶因的兒子約四分之一是白子', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 2);
    const dad = storeGenome(r, 'male', 4);
    mom.albino = [0, 1];
    mom.red = [1, 1];
    dad.albino = [0, 1];
    const pred = predictOffspring(mom, dad, 2000);
    const albinoSons = pred.sons.filter(([k]) => k.startsWith('白子')).reduce((a, [, v]) => a + v, 0);
    expect(albinoSons).toBeGreaterThan(18);
    expect(albinoSons).toBeLessThan(32);
  });

  it('舊存檔的孔雀魚補上基因後，外觀和原本一樣', () => {
    for (let id = 0; id < 10; id++) expect(lookIndex(phenotype(legacyGenome(id, 'male')))).toBe(id % 5);
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 1 });
    const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    delete f.genome;
    normalizeState(s);
    expect(f.genome).toBeDefined();
  });

  it('缸裡生的仔魚有基因、記得代數和血統', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 3, matureMedia: true });
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true, strain: 4 });
    expect(mom.sire).toBeTruthy();
    mom.pregnancy = 0.995;
    simulate(s, 48, (st) => st.fish.forEach((f) => (f.hunger = 0)));
    const fry = s.fish.filter((f) => f !== mom);
    expect(fry.length).toBeGreaterThan(0);
    for (const f of fry) {
      expect(f.genome).toBeDefined();
      expect(f.generation).toBe(1);
      expect(f.lineage).toBe(mom.lineage);
    }
    // 紅蛇王 × 紅蛇王：兒子都是紅蛇王（可能冒出藏在基因裡的白子紅蛇王）
    expect(fry.filter((f) => f.sex === 'male').every((f) => strainName(phenotype(f.genome!)).endsWith('紅蛇王'))).toBe(true);
  });
});
