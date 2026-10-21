import { describe, expect, it } from 'vitest';
import type { GuppyPhenotype } from '../sim';
import { parseRecipeKey, phenotypeRecipe, recipeKey, recolorImage, recolorPixel } from './phenotype-art';

const P = (o: Partial<GuppyPhenotype>): GuppyPhenotype => ({ albino: false, gold: false, tuxedo: false, red: false, snake: false, grass: false, ...o });

describe('依基因上色的公孔雀魚', () => {
  it('店裡的五個品系直接用原圖', () => {
    expect(recipeKey(phenotypeRecipe(P({ grass: true })))).toBe('guppy-male-bluegrass');
    expect(recipeKey(phenotypeRecipe(P({ snake: true, gold: true })))).toBe('guppy-male-cobra');
    expect(recipeKey(phenotypeRecipe(P({ snake: true, red: true })))).toBe('guppy-male-redcobra');
    expect(recipeKey(phenotypeRecipe(P({ tuxedo: true })))).toBe('guppy-male-tuxedo');
    expect(recipeKey(phenotypeRecipe(P({ red: true, albino: true })))).toBe('guppy-male-albino-red');
  });

  it('雜交出來的組合：花紋照原圖、顏色照基因換', () => {
    expect(recipeKey(phenotypeRecipe(P({ grass: true, red: true })))).toBe('guppy-male-bluegrass~red');
    expect(recipeKey(phenotypeRecipe(P({ tuxedo: true, red: true })))).toBe('guppy-male-tuxedo~red');
    expect(recipeKey(phenotypeRecipe(P({ snake: true })))).toBe('guppy-male-redcobra~blue');
    expect(recipeKey(phenotypeRecipe(P({ snake: true, red: true, albino: true })))).toBe('guppy-male-redcobra~red-albino');
  });

  it('鍵可以還原成配方', () => {
    for (const p of [P({ grass: true, gold: true }), P({ snake: true, albino: true }), P({ tuxedo: true, red: true })]) {
      const r = phenotypeRecipe(p);
      expect(parseRecipeKey(recipeKey(r))).toEqual(r);
    }
    expect(parseRecipeKey('guppy-male-bluegrass')).toBeNull();
  });

  it('藍色轉成紅色，銀白的身體和黑色花紋不動', () => {
    const recipe = phenotypeRecipe(P({ grass: true, red: true }));
    const [r, g, b] = recolorPixel(0.2, 0.45, 0.9, recipe);
    expect(r).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(g);
    expect(recolorPixel(0.85, 0.86, 0.88, recipe)).toEqual(expect.arrayContaining([expect.closeTo(0.85, 2)]));
    const dark = recolorPixel(0.05, 0.05, 0.06, recipe);
    expect(Math.max(...dark)).toBeLessThan(0.1);
  });

  it('白子沒有黑色素：黑色花紋淡成淺色', () => {
    const recipe = phenotypeRecipe(P({ snake: true, red: true, albino: true }));
    const [r, g, b] = recolorPixel(0.05, 0.04, 0.04, recipe);
    expect((Math.max(r, g, b) + Math.min(r, g, b)) / 2).toBeGreaterThan(0.3);
  });

  it('白子的眼睛改成紅色，不是主色', () => {
    const w = 20, h = 10, data = new Uint8ClampedArray(w * h * 4).fill(220);
    const eye = (5 * w + 17) * 4;
    data.set([10, 10, 12, 255], eye);
    recolorImage(data, phenotypeRecipe(P({ snake: true, gold: true, albino: true })), w);
    expect(data[eye]).toBeGreaterThan(100);
    expect(data[eye + 1]).toBeLessThan(40);
  });
});

describe('鰭型的整條魚圖（J18）', () => {
  it('緞帶、燕尾、大三角、大C、劍尾都用花紋＋鰭型的圖；改色照花紋判斷', () => {
    expect(recipeKey(phenotypeRecipe(P({ grass: true, ribbon: true })))).toBe('guppy-male-bluegrass-ribbon');
    expect(recipeKey(phenotypeRecipe(P({ grass: true, ribbon: true, bigC: true })))).toBe('guppy-male-bluegrass-bigc');
    expect(recipeKey(phenotypeRecipe(P({ grass: true, sword: 3 })))).toBe('guppy-male-bluegrass-sword3');
    expect(recipeKey(phenotypeRecipe(P({ grass: true, sword: 1, tailShape: 'halfmoon' })))).toBe('guppy-male-bluegrass-sword1');
    expect(recipeKey(phenotypeRecipe(P({ tuxedo: true, red: true, swallow: true })))).toBe('guppy-male-tuxedo-swallow~red');
    expect(recipeKey(phenotypeRecipe(P({ red: true, albino: true, tailShape: 'halfmoon' })))).toBe('guppy-male-albino-red-halfmoon');
    expect(parseRecipeKey('guppy-male-cobra-swallow~red')).toMatchObject({ from: 'gold', to: 'red' });
    expect(parseRecipeKey('fin-pectoral-dumbo~red')).toMatchObject({ from: 'blue', to: 'red' });
  });
});
