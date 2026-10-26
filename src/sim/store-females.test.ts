import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, economy, PREGNANCY_DUE, storeFemales, storeOffer, takeStoreFemales } from '.';

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

  it('同一天連買照懷孕程度往下挑，卡上標的跟著換；賣完照一般機率；隔天換一批（midgame.md §6.6）', () => {
    const s = newGameState(3);
    economy(s).firstMomBought = true;
    const list = storeFemales(s.hours, 3);
    expect(storeOffer(s, 3)).toBe(list[0]);
    expect(takeStoreFemales(s, 3, 1)).toEqual([list[0]]);
    expect(storeOffer(s, 3)).toBe(list[1]);
    expect(storeOffer(s, 4)).toBe(storeFemales(s.hours, 4)[0]);
    expect(takeStoreFemales(s, 3, 4)).toEqual([list[1], list[2], list[3], undefined]);
    expect(storeOffer(s, 3)).toBeUndefined();
    s.hours += 24;
    expect(storeOffer(s, 3)).toBe(storeFemales(s.hours, 3)[0]);
    expect(economy(s).storeSold?.counts).toEqual({});
  });

  it('開局第一次買的母魚已經快生（0.88～0.92，polish-to-9.md §7.1），買過之後照原本的規則', () => {
    const s = newGameState(3);
    const first = storeOffer(s, 3)!;
    expect(first).toBeGreaterThanOrEqual(0.88);
    expect(first).toBeLessThanOrEqual(0.92);
    const [a, b] = takeStoreFemales(s, 3, 2);
    expect(a).toBe(first);
    expect(b).toBeLessThan(PREGNANCY_DUE);
    expect(storeOffer(s, 4)).toBe(storeFemales(s.hours, 4)[0]);
    expect(storeOffer(s, 4)).toBeLessThan(0.8);
  });
});
