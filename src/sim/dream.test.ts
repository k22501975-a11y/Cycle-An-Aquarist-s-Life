import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, cross, DREAM_FISH, dreamRoute, economy, GUPPY_STRAINS, phenotype, storeGenome, strainName } from '.';

const mature = (f: ReturnType<typeof addFish>) => {
  f.ageDays = 120;
  return f;
};

describe('夢想魚與 3 步路線（P2）', () => {
  it('夢想魚店裡買不到，照配方兩代做得出來', () => {
    expect(GUPPY_STRAINS).not.toContain(DREAM_FISH.name);
    const rng = { seed: 7 };
    const mom = storeGenome(rng, 'female', GUPPY_STRAINS.indexOf('白子全紅'));
    const dad = storeGenome(rng, 'male', GUPPY_STRAINS.indexOf('紅蛇王'));
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const son = cross(rng, mom, dad, 'male');
      const daughter = cross(rng, mom, dad, 'female');
      if (strainName(phenotype(cross(rng, daughter, son, 'male'))) === DREAM_FISH.name) hits++;
    }
    // 兒子裡大約一成
    expect(hits / 400).toBeGreaterThan(0.05);
  });

  it('一開始在第 1 步；做到的步驟不會倒退', () => {
    const s = newGameState(1);
    let r = dreamRoute([s]);
    expect(r.steps.map((x) => x.title)).toEqual(['養好缸', '第一窩小魚', '第一尾自己選育的魚']);
    expect(r.steps[0].current).toBe(true);
    s.bacteria.aob = s.bacteria.nob = 1e9;
    r = dreamRoute([s]);
    expect(r.steps[0].done).toBe(true);
    expect(r.steps[1].current).toBe(true);
    // 菌掉回去（例如換了濾材）：第 1 步還是做到了
    s.bacteria.aob = s.bacteria.nob = 0;
    expect(dreamRoute([s]).steps[0].done).toBe(true);
  });

  it('第一窩、自己選育的公魚、選出夢想魚', () => {
    const s = newGameState(1);
    const fry = addFish(s, 'guppy', { sex: 'female' });
    fry.generation = 1;
    expect(dreamRoute([s]).steps[1].done).toBe(true);

    // 店裡也賣的品系不算自己選育
    const plain = mature(addFish(s, 'guppy', { sex: 'male', strain: GUPPY_STRAINS.indexOf('藍草') }));
    plain.generation = 1;
    expect(dreamRoute([s]).steps[2].done).toBe(false);

    const dream = mature(addFish(s, 'guppy', { sex: 'male', strain: GUPPY_STRAINS.indexOf('紅蛇王') }));
    dream.generation = 2;
    dream.genome!.albino = [1, 1];
    const r = dreamRoute([s]);
    expect(r.steps[2].done).toBe(true);
    expect(r.bredName).toBe(DREAM_FISH.name);
    expect(r.achieved).toBe(true);
    expect(economy(s).dreamAchieved).toBe(true);
  });
});
