/**
 * 底沙是真正的一層（差距清單 D9）：依底材換外觀，前低後高，從前玻璃看得到斷面。
 * 這裡只有幾何和配色，畫圖在 scenery.ts，tank-view.ts 用 floor 讓飼料、蝦、死魚停在沙面上。
 */

export type SubstrateLook = 'sand' | 'soil' | 'coral' | 'bare';

export function substrateLook(id: string | null | undefined): SubstrateLook {
  if (id === 'soil' || id === 'coral' || id === 'sand') return id;
  return 'bare';
}

/** 缸裡實際畫哪種底：套缸附一層石英砂，存檔沒記底材（新缸、舊存檔）就是石英砂；明確拆掉（null）才是裸缸。 */
export function tankSubstrateLook(sub: { spec: { id: string } } | null | undefined): SubstrateLook {
  return substrateLook(sub === null ? null : (sub?.spec.id ?? 'sand'));
}

interface Palette {
  /** 沙面受光漸層：後（暗）→ 前（亮）。 */
  top: [string, string, string];
  /** 斷面（隔著前玻璃看進去）：上層、下層。 */
  face: [string, string];
  /** 顆粒的顏色。 */
  grains: string[];
  /** 顆粒大小（相對 hs）與密度（每多少平方像素一顆）。 */
  grainSize: number;
  grainEvery: number;
  /** 殘餌、魚便累積的髒點顏色。 */
  dirt: number;
}

export const SUBSTRATE_PALETTES: Record<Exclude<SubstrateLook, 'bare'>, Palette> = {
  // 石英砂：米白細沙，斷面有一層層的沉積紋
  sand: {
    top: ['#b8a27a', '#e2d1a6', '#f3e7c8'],
    face: ['#d8c69c', '#bfa97e'],
    grains: ['rgba(120,90,50,0.28)', 'rgba(255,255,240,0.4)', 'rgba(160,130,90,0.3)'],
    grainSize: 1.4,
    grainEvery: 55,
    dirt: 0x5a4628,
  },
  // 水草泥：黑褐色的圓顆粒，下面墊一層偏紅的基肥
  soil: {
    top: ['#2a1d14', '#4a3424', '#5c4330'],
    face: ['#3a2a1d', '#5a3b22'],
    grains: ['rgba(20,12,6,0.7)', 'rgba(110,80,55,0.6)', 'rgba(70,50,34,0.7)'],
    grainSize: 3.2,
    grainEvery: 22,
    dirt: 0x8a7a5a,
  },
  // 珊瑚砂：白色碎粒，夾著貝殼碎片
  coral: {
    top: ['#c9c4b8', '#ece8de', '#fbf9f3'],
    face: ['#e8e2d4', '#d3cab6'],
    grains: ['rgba(255,255,255,0.75)', 'rgba(200,180,160,0.5)', 'rgba(230,190,180,0.45)'],
    grainSize: 2.6,
    grainEvery: 30,
    dirt: 0x6a5838,
  },
};

const qbez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

/**
 * 沙面最後面那條線的 y（從前面看到的沙面頂端）。左邊微微隆起、右邊下凹，跟原本的構圖一樣。
 * 裸缸沒有沙，就是缸底玻璃。
 */
export function sandSurface(look: SubstrateLook, x: number, width: number, bottom: number, hs: number): number {
  if (look === 'bare') return bottom + 6 * hs;
  const u = Math.min(1, Math.max(0, x / width));
  // 兩段二次曲線，x 方向幾乎是等速，直接用比例當參數
  if (u <= 0.545) return bottom + qbez(4, -14, 2, u / 0.545) * hs;
  return bottom + qbez(2, 18, -2, (u - 0.545) / 0.455) * hs;
}

/** 前玻璃那條邊（沙面的最前面）：斷面從這裡往下。前低後高，所以比沙面低一截。 */
export function frontLip(look: SubstrateLook, x: number, width: number, bottom: number, hs: number): number {
  if (look === 'bare') return bottom + 6 * hs;
  return bottom + (30 + 3 * Math.sin((x / width) * Math.PI * 3.1)) * hs;
}

/** 東西停下來的地方（飼料、蝦、死魚）：沙面稍微前面一點，看起來是在沙上而不是埋在後面。 */
export function floorY(look: SubstrateLook, x: number, width: number, bottom: number, hs: number): number {
  if (look === 'bare') return bottom + 3 * hs;
  return sandSurface(look, x, width, bottom, hs) + 6 * hs;
}

/** 沙面上的髒點數：殘餌、魚便、死葉變成的有機物（每公升 mg），平常幾乎沒有，餵太多會越積越多。 */
export function dirtSpots(organicMgPerL: number): number {
  return Math.round(Math.min(48, Math.max(0, (organicMgPerL - 1.5) * 5)));
}
