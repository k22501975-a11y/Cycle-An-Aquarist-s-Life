import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, PREGNANCY_DUE, storeFemales } from '.';

describe('商店母魚的懷孕程度（midgame.md §6.6，#335）', () => {
  it('每天換一批、大的在前，一定有一尾快生了；同一天看到的都一樣', () => {
    for (let day = 0; day < 30; day++) {
      const list = storeFemales(day * 24 + 8, 3);
      expect(list).toEqual([...list].sort((a, b) => b - a));
      expect(list[0]).toBeGreaterThanOrEqual(PREGNANCY_DUE);
      expect(list[1]).toBeLessThan(PREGNANCY_DUE);
      expect(storeFemales(day * 24 + 20, 3)).toEqual(list);
    }
    expect(storeFemales(24, 3)).not.toEqual(storeFemales(48, 3));
  });

  it('買卡上的那尾：懷孕程度照卡上的', () => {
    const s = newGameState(3);
    const f = addFish(s, 'guppy', { sex: 'female', strain: 3, pregnancy: 0.74, carriesIch: false, carries: [] });
    expect(f.pregnancy).toBe(0.74);
  });
});
