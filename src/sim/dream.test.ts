import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, cross, DREAM_FISH, dreamRoute, economy, GUPPY_STRAINS, phenotype, storeGenome, strainName } from '.';

const mature = (f: ReturnType<typeof addFish>) => {
  f.ageDays = 120;
  return f;
};

describe('夢想魚與路線（P2、固定品系）', () => {
  it('夢想魚配方的爸媽品系都找得到（品系改名時一鍵買和配對預覽不會壞）', () => {
    expect(GUPPY_STRAINS[DREAM_FISH.parents.male]).toBe('紅蛇王');
    expect(GUPPY_STRAINS[DREAM_FISH.parents.female]).toBe('全紅白子');
  });

  it('夢想魚店裡買不到，照配方兩代做得出來', () => {
    expect(GUPPY_STRAINS).not.toContain(DREAM_FISH.name);
    const rng = { seed: 7 };
    const mom = storeGenome(rng, 'female', GUPPY_STRAINS.indexOf('全紅白子'));
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
    expect(r.steps.map((x) => x.title)).toEqual(['養好缸', '第一窩小魚', '第一尾自己選育的魚', '讓一窩小魚裡，有 3／4 以上是白子紅蛇王']);
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
    const plain = mature(addFish(s, 'guppy', { sex: 'male', strain: GUPPY_STRAINS.indexOf('藍草尾') }));
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

  it('第 4 步固定品系：最近說過的一窩穩定度到 75% 才算，之後不倒退', () => {
    const s = newGameState(1);
    const line = { broods: [{ momId: 1, born: 0, n: 10, k: 1, gen: 2, told: true }] };
    economy(s).choices = { shown: {}, picked: {}, line };
    let r = dreamRoute([s]);
    expect(r.stability).toBe(10);
    expect(r.steps[3].done).toBe(false);
    // 還沒說的那窩不算
    line.broods.push({ momId: 2, born: 70 * 24, n: 8, k: 7, gen: 3, told: false });
    expect(dreamRoute([s]).stability).toBe(10);
    line.broods[1].told = true;
    r = dreamRoute([s]);
    expect(r.stability).toBe(88);
    expect(r.steps[3].done).toBe(true);
    line.broods.push({ momId: 3, born: 140 * 24, n: 10, k: 5, gen: 4, told: true });
    expect(dreamRoute([s]).steps[3].done).toBe(true);
  });
});
