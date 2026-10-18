import type { GuppyPhenotype } from '../sim';

/**
 * 依基因上色的公孔雀魚（差距清單 C3）。
 *
 * 花紋來自精繪圖本身：蛇紋用蛇王的圖、草尾點用藍草、禮服用禮服、素色用全紅。
 * 顏色照基因換：把圖裡原本那一族的顏色（紅、金、藍）轉成目標顏色，黑色花紋保留；
 * 白子沒有黑色素，黑色的花紋淡化成淺色。這樣雜交出來的紅草、紅尾禮服、藍蛇王都有自己的樣子，
 * 不用每種組合都另外生一張圖。
 */

export type ColorFamily = 'red' | 'gold' | 'blue';

/** 各色系的代表色相（度）。 */
const HUE: Record<ColorFamily, number> = { red: 4, gold: 46, blue: 212 };

export interface PhenotypeRecipe {
  /** 花紋來源的精繪圖。 */
  base: string;
  from: ColorFamily;
  to: ColorFamily;
  /** 要把黑色花紋淡化（白子，但來源圖本身不是白子）。 */
  albino: boolean;
}

export function phenotypeRecipe(p: GuppyPhenotype): PhenotypeRecipe {
  const to: ColorFamily = p.gold && !p.tuxedo ? 'gold' : p.red ? 'red' : 'blue';
  if (p.snake) {
    if (to === 'gold') return { base: 'guppy-male-cobra', from: 'gold', to, albino: p.albino };
    return { base: 'guppy-male-redcobra', from: 'red', to, albino: p.albino };
  }
  if (p.grass) return { base: 'guppy-male-bluegrass', from: 'blue', to, albino: p.albino };
  if (p.tuxedo) return { base: 'guppy-male-tuxedo', from: 'blue', to, albino: p.albino };
  // 素色：全紅的圖本來就是白子
  return { base: 'guppy-male-albino-red', from: 'red', to, albino: false };
}

/** 精繪圖的鍵：不用改色就是原圖，否則是「原圖~顏色」的衍生圖。 */
export function recipeKey(r: PhenotypeRecipe): string {
  if (r.from === r.to && !r.albino) return r.base;
  return `${r.base}~${r.to}${r.albino ? '-albino' : ''}`;
}

export function parseRecipeKey(key: string): PhenotypeRecipe | null {
  const [base, rest] = key.split('~');
  if (!rest) return null;
  const [to, albino] = rest.split('-') as [ColorFamily, string | undefined];
  const from: ColorFamily = base.endsWith('cobra') && !base.endsWith('redcobra') ? 'gold' : base.endsWith('bluegrass') || base.endsWith('tuxedo') ? 'blue' : 'red';
  return { base, from, to, albino: albino === 'albino' };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** 改一個像素（0–1 的 RGB）。只轉來源色系附近、夠鮮豔的顏色；身體的銀白、眼睛不動。 */
export function recolorPixel(r: number, g: number, b: number, recipe: PhenotypeRecipe): [number, number, number] {
  let [h, s, l] = rgbToHsl(r, g, b);
  const src = HUE[recipe.from], dst = HUE[recipe.to];
  const d = ((h - src + 540) % 360) - 180;
  if (recipe.from !== recipe.to && s > 0.2 && Math.abs(d) < 60) {
    const w = Math.min(1, (60 - Math.abs(d)) / 20);
    h = (h + (dst - src) * w + 360) % 360;
    // 藍色的圖比較亮，直接轉成紅會變粉紅：紅、金要壓暗一點、加飽和
    if (recipe.to === 'red') {
      l = l * (1 - 0.18 * w);
      s = Math.max(s, 0.8 * w + s * (1 - w));
    } else if (recipe.to === 'gold') {
      l = Math.min(1, l * (1 + 0.06 * w) + 0.02 * w);
      s = Math.max(s, 0.75 * w + s * (1 - w));
    }
  }
  // 白子：黑色的花紋淡成主色的淺色
  if (recipe.albino && l < 0.32) {
    l = 0.32 + l * 0.9;
    h = HUE[recipe.to];
    s = Math.max(s, 0.45);
  }
  return hslToRgb(h, Math.min(1, s), Math.min(1, l));
}

/** 整張圖（RGBA）就地改色。 */
export function recolorImage(data: Uint8ClampedArray, recipe: PhenotypeRecipe): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = recolorPixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, recipe);
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}
