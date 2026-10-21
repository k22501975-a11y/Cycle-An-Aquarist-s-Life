import { describe, expect, it } from 'vitest';
import { DREAM_FISH, previewShopPair } from '../sim';
import { dotsOn, GUPPY_PICKS, kidArt } from './pair-preview-card';

describe('配一對看看（P3）', () => {
  it('機率點：幾成亮幾顆，最少一顆、最多十顆', () => {
    expect(dotsOn(2)).toBe(1);
    expect(dotsOn(48)).toBe(5);
    expect(dotsOn(100)).toBe(10);
  });

  it('預設配方（全紅白子母 × 紅蛇王公）的孫代看得到夢想魚', () => {
    const mom = GUPPY_PICKS.find((p) => p.name === '全紅白子')!;
    const dad = GUPPY_PICKS.find((p) => p.name === '紅蛇王')!;
    const pv = previewShopPair(mom, dad);
    expect(pv.grandkids.some((k) => k.sex === 'male' && k.name === DREAM_FISH.name)).toBe(true);
  });

  it('小魚的圖：母魚都是素的，公魚照品系和尾型', () => {
    expect(kidArt({ sex: 'female', name: '全紅', look: 2, fins: [], tailShape: 'round', pct: 50 })).toBe('fish/guppy-female-base.webp');
    expect(kidArt({ sex: 'male', name: '藍尾禮服', look: 3, fins: ['燕尾'], tailShape: 'round', pct: 50 })).toBe('fish/guppy-male-tuxedo-swallow.webp');
    expect(kidArt({ sex: 'male', name: '全紅白子', look: 2, fins: [], tailShape: 'halfmoon', pct: 50 })).toBe('fish/guppy-male-albino-red-halfmoon.webp');
  });
});
