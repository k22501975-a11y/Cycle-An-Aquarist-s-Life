import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, firstBiteText, firstEater, PERSONALITIES, PERSONALITY_SPECS, personalityOf, simulate } from '.';

describe('魚的個性（F6）', () => {
  it('每尾魚都有個性，同一尾永遠一樣，五種都會出現', () => {
    const s = newGameState(1);
    const fish = Array.from({ length: 60 }, () => addFish(s, 'guppy', { carriesIch: false, carries: [] }));
    const seen = new Set(fish.map(personalityOf));
    expect(seen).toEqual(new Set(PERSONALITIES));
    const copy = structuredClone(fish[0]);
    expect(personalityOf(copy)).toBe(personalityOf(fish[0]));
  });

  it('不用亂數：加不加個性，模擬結果一模一樣', () => {
    const a = newGameState(5);
    const b = newGameState(5);
    addFish(a, 'guppy', { carriesIch: false, carries: [] });
    addFish(b, 'guppy', { carriesIch: false, carries: [] });
    personalityOf(a.fish[0]);
    simulate(a, 48);
    simulate(b, 48);
    expect(a.rng.seed).toBe(b.rng.seed);
    expect(a.water).toEqual(b.water);
  });

  it('改過的個性（商城道具）以存檔欄位為準', () => {
    expect(personalityOf({ id: 1, personality: 'shy' })).toBe('shy');
  });

  it('手指餵食：貪吃的就算遠一點也先吃到，膽小的近也慢', () => {
    const greedy = { id: 1, personality: 'greedy' as const, alive: true };
    const shy = { id: 2, personality: 'shy' as const, alive: true };
    const dead = { id: 3, personality: 'greedy' as const, alive: false };
    expect(firstEater([{ fish: shy, distance: 100 }, { fish: greedy, distance: 140 }])?.fish).toBe(greedy);
    expect(firstEater([{ fish: shy, distance: 30 }, { fish: greedy, distance: 140 }])?.fish).toBe(shy);
    expect(firstEater([{ fish: dead, distance: 1 }])).toBeNull();
    expect(firstBiteText(greedy, '阿藍')).toBe('貪吃的阿藍第一個吃到');
  });

  it('每種個性都有標籤、說明和行為係數', () => {
    for (const p of PERSONALITIES) {
      const spec = PERSONALITY_SPECS[p];
      expect(spec.label && spec.blurb).toBeTruthy();
      for (const k of ['hide', 'approach', 'display'] as const) expect(spec[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
