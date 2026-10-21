import { describe, expect, it } from 'vitest';
import { couldBeStoreGenome, storeGenome, type FinTrait, type GuppyGenome } from './genetics';
import { addFish, createTank, FILTERS, HEATERS, LIGHTS, TANKS } from './index';

const FINS: Array<FinTrait | undefined> = [undefined, 'swallow', 'ribbon', 'dumbo', 'sword', 'halfmoon', 'bigC'];

describe('店魚生得出來的基因（#76，genome-check.ts）', () => {
  it('店裡每個品系、每種鰭型、公母都認得；懷孕母魚肚子裡的精子也認得', () => {
    let seed = 1;
    for (let strain = 0; strain < 5; strain++)
      for (const fin of FINS)
        for (const sex of ['male', 'female'] as const)
          for (let i = 0; i < 40; i++) {
            const g = storeGenome({ seed: seed++ }, sex, strain, fin);
            expect(couldBeStoreGenome(g), `${strain} ${fin} ${sex} ${JSON.stringify(g)}`).toBe(true);
          }
    const t = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, seed: 3 });
    for (let strain = 0; strain < 5; strain++)
      for (const fin of FINS) {
        const f = addFish(t, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true, strain, fin });
        expect(couldBeStoreGenome(f.sire!.genome), `${strain} ${fin}`).toBe(true);
      }
  });

  it('全隱性加滿鰭型的公魚、兩種鰭型疊在一起、尾鰭太高的都不是店魚', () => {
    const g = storeGenome({ seed: 7 }, 'male', 0, 'sword');
    const stacked: GuppyGenome = {
      albino: [1, 1], gold: [1, 1], tuxedo: [1, 1], red: [1, 1], snakeX: [1], y: { snake: 1, grass: 1, sword: 3 },
      tail: 90, fins: 100, swallow: [1, 1], ribbon: [1, 1], dumbo: [1, 1],
    };
    expect(couldBeStoreGenome(stacked)).toBe(false);
    expect(couldBeStoreGenome({ ...g, dumbo: [1, 1] })).toBe(false);
    expect(couldBeStoreGenome({ ...g, tail: 95 })).toBe(false);
    expect(couldBeStoreGenome({ ...g, albino: [1, 1] })).toBe(false);
    expect(couldBeStoreGenome(g)).toBe(true);
  });
});
