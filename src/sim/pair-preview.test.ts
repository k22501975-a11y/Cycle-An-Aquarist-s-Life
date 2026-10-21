import { describe, expect, it } from 'vitest';
import { GUPPY_STRAINS, previewPair, previewShopPair, typicalStoreGenome } from '.';

const GRASS = GUPPY_STRAINS.indexOf('藍草尾');
const GOLD_SNAKE = GUPPY_STRAINS.indexOf('黃金蛇王');

describe('選魚時的小魚預覽（P3）', () => {
  it('同品系配：兒子跟爸爸一樣，機率加起來約 100', () => {
    const kids = previewPair(typicalStoreGenome('female', GRASS), typicalStoreGenome('male', GRASS));
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.length).toBeLessThanOrEqual(3);
    const son = kids.find((k) => k.sex === 'male');
    expect(son?.name).toBe('藍草尾');
    expect(son?.pct).toBe(50);
    // 各自四捨五入，加起來可能差 1
    expect(kids.reduce((a, k) => a + k.pct, 0)).toBeLessThanOrEqual(101);
  });

  it('同一對每次看到的預覽都一樣', () => {
    const a = previewShopPair({ strain: GOLD_SNAKE }, { strain: GRASS });
    const b = previewShopPair({ strain: GOLD_SNAKE }, { strain: GRASS });
    expect(a).toEqual(b);
  });

  it('跨品系配：第一窩是店裡配的（像媽媽的品系），之後跟你的公魚配會不一樣', () => {
    const p = previewShopPair({ strain: GOLD_SNAKE }, { strain: GRASS });
    expect(p.firstBrood.find((k) => k.sex === 'male')?.name).toBe('黃金蛇王');
    const mine = p.withYourMale.filter((k) => k.sex === 'male').map((k) => k.name);
    expect(mine).not.toContain('黃金蛇王');
    expect(mine.length).toBeGreaterThan(0);
  });
});

describe('孫代才冒出來的（P3／P2 選育入口）', () => {
  it('藍草尾母配全紅白子公：小魚看不出白子，孫代會冒出白子', () => {
    const p = previewShopPair({ strain: GRASS }, { strain: GUPPY_STRAINS.indexOf('全紅白子') });
    expect(p.withYourMale.some((k) => k.name.includes('白子'))).toBe(false);
    expect(p.grandkids.some((k) => k.name.includes('白子'))).toBe(true);
  });

  it('同品系配沒有隱藏的東西', () => {
    expect(previewShopPair({ strain: GRASS }, { strain: GRASS }).grandkids).toEqual([]);
  });
});
