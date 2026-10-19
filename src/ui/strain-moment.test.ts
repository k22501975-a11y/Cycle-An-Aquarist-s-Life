import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, guppyRarity, phenotype, strainName, type TankState } from '../sim';
import { StrainTracker, STRAINS_KEY, strainOwnerLine } from './strain-moment';

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

/** 放一條自家繁殖、長大的公魚（藍尾禮服燕尾：鰭型品系，不是普通魚）。 */
function bredMale(s: TankState, generation = 2) {
  const f = addFish(s, 'guppy', { sex: 'male', strain: 3, fin: 'swallow', carriesIch: false });
  f.generation = generation;
  return f;
}

describe('選育成功的演出', () => {
  it('第一次執行只記下現有品系，不補放演出', () => {
    const store = memoryStore();
    const tracker = new StrainTracker(store);
    const s = newGameState(3);
    bredMale(s);
    expect(tracker.check([s])).toEqual([]);
    expect(store.getItem(STRAINS_KEY)).not.toBeNull();
  });

  it('自家繁殖的公魚長出沒見過的品系就慶祝一次，同一品系不再演', () => {
    const store = memoryStore();
    const tracker = new StrainTracker(store);
    const s = newGameState(3);
    tracker.check([s]);
    const f = bredMale(s);
    const finds = tracker.check([s]);
    expect(finds).toHaveLength(1);
    expect(finds[0].fish).toBe(f);
    expect(finds[0].name).toBe(strainName(phenotype(f.genome!)));
    expect(finds[0].rarity).toBe(guppyRarity(phenotype(f.genome!)));
    bredMale(s);
    expect(tracker.check([s])).toEqual([]);
  });

  it('店裡買的魚、母魚、還沒長大的魚都不算', () => {
    const store = memoryStore();
    const tracker = new StrainTracker(store);
    const s = newGameState(3);
    tracker.check([s]);
    bredMale(s, 0);
    const female = addFish(s, 'guppy', { sex: 'female', strain: 3, fin: 'swallow', carriesIch: false });
    female.generation = 1;
    const young = bredMale(s);
    young.lengthCm = 0.8;
    expect(tracker.check([s])).toEqual([]);
  });

  it('其他缸也算，回傳哪一缸', () => {
    const store = memoryStore();
    const tracker = new StrainTracker(store);
    const a = newGameState(3);
    const b = newGameState(4);
    tracker.check([a, b]);
    bredMale(b);
    expect(tracker.check([a, b])[0].tank).toBe(1);
  });

  it('紀錄只在開遊戲時讀一次，之後不再讀裝置儲存', () => {
    const store = memoryStore();
    let reads = 0;
    const counting = { ...store, getItem: (k: string) => (reads++, store.getItem(k)) };
    const tracker = new StrainTracker(counting);
    const s = newGameState(3);
    for (let i = 0; i < 5; i++) tracker.check([s]);
    expect(reads).toBe(1);
  });

  it('重開遊戲讀回紀錄，同一品系不再演', () => {
    const store = memoryStore();
    const s = newGameState(3);
    new StrainTracker(store).check([s]);
    bredMale(s);
    expect(new StrainTracker(store).check([s])).toHaveLength(1);
    expect(new StrainTracker(store).check([s])).toEqual([]);
  });

  it('老闆的話依稀有度不同', () => {
    expect(strainOwnerLine('prized')).not.toBe(strainOwnerLine('strain'));
    expect(strainOwnerLine('rare')).toContain('種魚');
  });
});
