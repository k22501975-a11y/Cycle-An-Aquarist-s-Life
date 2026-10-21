import type { GuppyPhenotype } from '../sim';

/**
 * 依基因上色的公孔雀魚（差距清單 C3）。
 *
 * 花紋來自精繪圖本身：蛇紋用蛇王的圖、草尾點用藍草尾、禮服用禮服、素色用全紅。
 * 顏色照基因換：把圖裡原本那一族的顏色（紅、金、藍）轉成目標顏色，黑色花紋保留；
 * 白子沒有黑色素，黑色的花紋淡化成淺色。這樣雜交出來的紅草、紅尾禮服、藍蛇王都有自己的樣子，
 * 不用每種組合都另外生一張圖。
 */

export type ColorFamily = 'red' | 'gold' | 'blue';

/** 各色系的代表色相（度）。 */
const HUE: Record<ColorFamily, number> = { red: 4, gold: 46, blue: 212 };

/** 有整條魚精繪圖的鰭型（緞帶、燕尾、半月、大C、上劍、下劍、雙劍）；大耳的胸鰭另外疊一片圖。 */
export type WholeFin = 'ribbon' | 'swallow' | 'halfmoon' | 'bigc' | 'sword1' | 'sword2' | 'sword3';
export const WHOLE_FINS: WholeFin[] = ['ribbon', 'swallow', 'halfmoon', 'bigc', 'sword1', 'sword2', 'sword3'];

/** 一條魚只用一張圖：同時有好幾種鰭型時，挑最顯眼的那個（大C ＞ 緞帶 ＞ 燕尾 ＞ 劍 ＞ 半月），其他的照樣用程式補畫。 */
export function wholeFin(p: GuppyPhenotype): WholeFin | null {
  if (p.bigC) return 'bigc';
  if (p.ribbon) return 'ribbon';
  if (p.swallow) return 'swallow';
  if (p.sword) return `sword${p.sword}` as WholeFin;
  if (p.tailShape === 'halfmoon') return 'halfmoon';
  return null;
}

/** 去掉鰭型後綴，回到花紋圖本身。 */
export function patternBase(base: string): string {
  for (const f of WHOLE_FINS) if (base.endsWith(`-${f}`)) return base.slice(0, -f.length - 1);
  return base;
}

export interface PhenotypeRecipe {
  /** 花紋來源的精繪圖（有鰭型圖時帶「-鰭型」後綴）。 */
  base: string;
  from: ColorFamily;
  to: ColorFamily;
  /** 要把黑色花紋淡化（白子，但來源圖本身不是白子）。 */
  albino: boolean;
}

export function phenotypeRecipe(p: GuppyPhenotype): PhenotypeRecipe {
  const r = patternRecipe(p);
  const fin = wholeFin(p);
  return fin ? { ...r, base: `${r.base}-${fin}` } : r;
}

function patternRecipe(p: GuppyPhenotype): PhenotypeRecipe {
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
  const pat = patternBase(base);
  // 單片鰭圖（fin-…）都是藍色的
  const from: ColorFamily = pat.startsWith('fin-') ? 'blue' : pat.endsWith('cobra') && !pat.endsWith('redcobra') ? 'gold' : pat.endsWith('bluegrass') || pat.endsWith('tuxedo') ? 'blue' : 'red';
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

/** 整張圖（RGBA）就地改色。給了寬度時，白子的眼睛改成紅色（沒有黑色素，看得到血色）。 */
export function recolorImage(data: Uint8ClampedArray, recipe: PhenotypeRecipe, width = 0): void {
  const eye = recipe.albino && width > 0 ? eyePixels(data, width) : [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = recolorPixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, recipe);
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
  for (const [i, k] of eye) {
    data[i] = 110 + 120 * k;
    data[i + 1] = 8 + 30 * k;
    data[i + 2] = 22 + 30 * k;
  }
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;

/** 魚頭朝右：右邊 20% 最暗的點是瞳孔；回傳瞳孔附近暗像素的位置和亮度（0–1）。 */
export function eyePixels(data: Uint8ClampedArray, width: number): [number, number][] {
  const height = data.length / 4 / width;
  let best = -1, bestL = 2;
  for (let y = 0; y < height; y++) {
    for (let x = Math.floor(width * 0.8); x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      const l = lum(data, i);
      if (l < bestL) { bestL = l; best = i / 4; }
    }
  }
  if (best < 0) return [];
  const cx = best % width, cy = Math.floor(best / width), out: [number, number][] = [];
  for (let y = Math.max(0, cy - 16); y <= Math.min(height - 1, cy + 16); y++) {
    for (let x = Math.max(0, cx - 16); x <= Math.min(width - 1, cx + 16); x++) {
      const i = (y * width + x) * 4;
      const l = lum(data, i);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 256 && data[i + 3] > 0 && l < 90 / 255) out.push([i, l / (90 / 255)]);
    }
  }
  return out;
}
