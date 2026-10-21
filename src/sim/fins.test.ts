import { describe, expect, it } from 'vitest';
import {
  addFish,
  createTank,
  cross,
  FILTERS,
  HEATERS,
  LIGHTS,
  matingSuccess,
  phenotype,
  predictOffspring,
  simulate,
  storeGenome,
  strainName,
  TANKS,
} from './index';

const rng = () => ({ seed: 7 });
const share = (n: number, f: () => boolean) => {
  let hit = 0;
  for (let i = 0; i < n; i++) if (f()) hit++;
  return hit / n;
};

describe('鰭型基因（strains.md §1.3）', () => {
  it('燕尾是隱性：母燕尾 × 帶因公約一半燕尾；燕尾公魚很難配', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 3, 'swallow');
    const dad = { ...storeGenome(r, 'male', 3), swallow: [1, 0] as [1, 0] };
    const p = share(4000, () => !!phenotype(cross(r, mom, dad, 'male')).swallow);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
    expect(matingSuccess(storeGenome(r, 'male', 3, 'swallow'))).toBeLessThan(0.1);
    expect(matingSuccess(mom)).toBe(1);
  });

  it('緞帶是顯性：母緞帶 × 一般公約一半緞帶；緞帶公魚不能配', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 3, 'ribbon');
    const dad = storeGenome(r, 'male', 3);
    const p = share(4000, () => !!phenotype(cross(r, mom, dad, 'female')).ribbon);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
    expect(matingSuccess(storeGenome(r, 'male', 3, 'ribbon'))).toBe(0);
  });

  it('大耳是隱性：帶因 × 帶因約 25% 大耳', () => {
    const r = rng();
    const mom = { ...storeGenome(r, 'female', 3), dumbo: [1, 0] as [1, 0] };
    const dad = { ...storeGenome(r, 'male', 3), dumbo: [0, 1] as [0, 1] };
    const p = share(4000, () => !!phenotype(cross(r, mom, dad, 'male')).dumbo);
    expect(p).toBeGreaterThan(0.21);
    expect(p).toBeLessThan(0.29);
  });

  it('劍尾在 Y 上：雙劍爸爸的兒子都是雙劍，女兒都沒有', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 0);
    const dad = storeGenome(r, 'male', 0, 'sword');
    expect(share(300, () => phenotype(cross(r, mom, dad, 'male')).sword === 3)).toBe(1);
    expect(share(300, () => !!phenotype(cross(r, mom, dad, 'female')).sword)).toBe(0);
  });

  it('大C 不穩定：大C 母魚的子代只有少數長成大C，其他是緞帶或一般', () => {
    const r = rng();
    const mom = storeGenome(r, 'female', 0, 'bigC');
    expect(phenotype(mom).bigC).toBe(true);
    const dad = storeGenome(r, 'male', 0);
    const p = share(4000, () => !!phenotype(cross(r, mom, dad, 'female')).bigC);
    expect(p).toBeGreaterThan(0.01);
    expect(p).toBeLessThan(0.15);
  });

  it('品系名自動組合花紋和鰭型；配對預測也看得到', () => {
    const r = rng();
    expect(strainName(phenotype(storeGenome(r, 'male', 3, 'dumbo')))).toBe('藍尾禮服大耳');
    expect(strainName(phenotype(storeGenome(r, 'male', 0, 'sword')))).toBe('藍草尾雙劍');
    const mom = storeGenome(r, 'female', 3, 'swallow');
    const dad = { ...storeGenome(r, 'male', 3), swallow: [1, 0] as [1, 0] };
    const pred = predictOffspring(mom, dad);
    expect(pred.sons.some(([k]) => k.includes('燕尾'))).toBe(true);
    expect(pred.daughters.some(([k]) => k.includes('燕尾'))).toBe(true);
  });

  it('缸裡只有緞帶公魚：母魚不會懷孕', () => {
    const s = createTank({ tank: TANKS.std90, filter: FILTERS.canister, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true });
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', strain: 3, fin: 'ribbon' });
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', strain: 3, pregnant: false });
    for (let h = 0; h < 24 * 20; h++) {
      if (h % 12 === 0) for (const f of s.fish) f.hunger = 0.2;
      simulate(s, 1);
    }
    expect(s.fish.filter((f) => f.sex === 'female').every((f) => f.pregnancy === 0)).toBe(true);
  });
});
