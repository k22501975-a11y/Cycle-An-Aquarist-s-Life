import { nextRandom, type RngState } from './random';

/**
 * 孔雀魚遺傳（strains.md §1.6、§6）：簡化成幾個真實的單基因加一個多基因數值。
 * - 白子 a、黃金 g：體染色體隱性，兩個都有才表現（Aa × Aa → 25%）
 * - 禮服 HB：體染色體顯性（簡化設定）
 * - 紅尾 R：顯性，沒有就是藍尾（簡化設定）
 * - 蛇紋 Ss：性聯，大多在公魚的 Y 上，只傳兒子；每次繁殖 1% 機率在 X、Y 之間換位
 * - 草尾 Gr：Y 連鎖，公魚 100% 傳給兒子、女兒 0%
 * - 尾鰭分數：多基因，子代約為父母平均再加上隨機變異；近親繁殖會退化
 */

/** 一對等位基因，1 表示帶有那個基因。 */
export type Pair = [0 | 1, 0 | 1];

export interface GuppyGenome {
  albino: Pair;
  gold: Pair;
  tuxedo: Pair;
  red: Pair;
  /** X 染色體上的蛇紋：母魚兩條、公魚一條。 */
  snakeX: (0 | 1)[];
  /** 公魚的 Y 染色體；母魚是 null。 */
  y: { snake: 0 | 1; grass: 0 | 1 } | null;
  /** 尾鰭分數 0–100（大小與形狀），評比和賣價看這個。 */
  tail: number;
}

export interface GuppyPhenotype {
  albino: boolean;
  gold: boolean;
  tuxedo: boolean;
  red: boolean;
  snake: boolean;
  grass: boolean;
}

/** 店裡常見的五個品系（順序和畫面的品系外觀表一致）。 */
export const GUPPY_STRAINS = ['藍草', '黃金蛇王', '白子全紅', '藍尾禮服', '紅蛇王'] as const;
/** 各品系的店價（台灣水族館行情，元）。 */
export const GUPPY_STRAIN_PRICES = [60, 120, 100, 60, 80];

/** 表現型的身價：照最接近的品系，白子、黃金這類隱性品系比較稀有。 */
export function phenotypeValue(p: GuppyPhenotype): number {
  return GUPPY_STRAIN_PRICES[lookIndex(p)] * (p.albino && !p.red ? 1.2 : 1);
}

/** 配對預測：模擬很多次配種，統計子代各種外觀的比例（配對預測面板用）。 */
export function predictOffspring(mother: GuppyGenome, father: GuppyGenome, samples = 400): { sons: [string, number][]; daughters: [string, number][] } {
  // 用固定種子，同一對魚每次看到的預測都一樣
  const rng = { seed: 12345 };
  const sons = new Map<string, number>();
  const daughters = new Map<string, number>();
  for (let i = 0; i < samples; i++) {
    const son = phenotype(cross(rng, mother, father, 'male'));
    sons.set(strainName(son), (sons.get(strainName(son)) ?? 0) + 1);
    const d = phenotype(cross(rng, mother, father, 'female'));
    const label = [d.albino ? '白子' : '', d.gold ? '黃金' : '', d.tuxedo ? '禮服' : '', d.snake ? '蛇紋' : ''].filter(Boolean).join('、') || '一般';
    daughters.set(label, (daughters.get(label) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / samples) * 100)] as [string, number]);
  return { sons: sorted(sons), daughters: sorted(daughters) };
}

const both = (v: 0 | 1): Pair => [v, v];

/** 品系的純種基因型（公魚）。 */
function template(index: number, sex: 'male' | 'female'): GuppyGenome {
  const t = { albino: 0, gold: 0, tuxedo: 0, red: 0, snake: 0, grass: 0 } as Record<string, 0 | 1>;
  switch (index % GUPPY_STRAINS.length) {
    case 0:
      t.grass = 1;
      break;
    case 1:
      t.gold = t.snake = 1;
      break;
    case 2:
      t.albino = t.red = 1;
      break;
    case 3:
      t.tuxedo = 1;
      break;
    case 4:
      t.red = t.snake = 1;
      break;
  }
  return {
    albino: both(t.albino),
    gold: both(t.gold),
    tuxedo: both(t.tuxedo),
    red: both(t.red),
    // 品系母魚的 X 上也帶著蛇紋，生的兒子才會穩定
    snakeX: sex === 'female' ? [t.snake, t.snake] : [t.snake],
    y: sex === 'male' ? { snake: t.snake, grass: t.grass } : null,
    tail: 50,
  };
}

function gaussian(rng: RngState): number {
  const u = Math.max(1e-9, nextRandom(rng));
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * nextRandom(rng));
}

/** 店裡的魚：大多是純種品系，約兩成偷偷帶著一個白子基因。 */
export function storeGenome(rng: RngState, sex: 'male' | 'female', strain?: number): GuppyGenome {
  const index = strain ?? Math.floor(nextRandom(rng) * GUPPY_STRAINS.length);
  const g = template(index, sex);
  if (g.albino[0] === 0 && nextRandom(rng) < 0.2) g.albino = [0, 1];
  g.tail = Math.round(Math.min(100, Math.max(0, 45 + gaussian(rng) * 10)));
  return g;
}

/** 舊存檔的孔雀魚：照原本依編號輪替的外觀補上對應的基因，看起來不會變。 */
export function legacyGenome(id: number, sex: 'male' | 'female'): GuppyGenome {
  const g = template(id, sex);
  g.tail = 50;
  return g;
}

const pick = (rng: RngState, pair: Pair): 0 | 1 => pair[nextRandom(rng) < 0.5 ? 0 : 1];
const inherit = (rng: RngState, mom: Pair, dad: Pair): Pair => [pick(rng, mom), pick(rng, dad)];

/** 蛇紋在公魚 X、Y 之間換位的機率（strains.md §6.1）。 */
export const XY_SWAP_CHANCE = 0.01;

/**
 * 配種：子代從父母各拿一個等位基因。兒子拿爸爸的 Y、媽媽的一條 X；女兒拿爸爸的 X、媽媽的一條 X。
 * inbreeding 是近交係數 0–1，會拉低尾鰭分數。
 */
export function cross(rng: RngState, mother: GuppyGenome, father: GuppyGenome, sex: 'male' | 'female', inbreeding = 0): GuppyGenome {
  let dadX = father.snakeX[0] ?? 0;
  let dadY = father.y ?? { snake: 0, grass: 0 };
  if (nextRandom(rng) < XY_SWAP_CHANCE && dadX !== dadY.snake) {
    [dadX, dadY] = [dadY.snake, { ...dadY, snake: dadX }];
  }
  const momX = mother.snakeX[nextRandom(rng) < 0.5 ? 0 : 1] ?? 0;
  const mid = (mother.tail + father.tail) / 2;
  // 選育的力量來自玩家挑魚：子代平均約為父母平均（略往族群平均 50 回歸），再加上變異
  const tail = mid + (50 - mid) * 0.3 + gaussian(rng) * 8 - inbreeding * 25;
  return {
    albino: inherit(rng, mother.albino, father.albino),
    gold: inherit(rng, mother.gold, father.gold),
    tuxedo: inherit(rng, mother.tuxedo, father.tuxedo),
    red: inherit(rng, mother.red, father.red),
    snakeX: sex === 'female' ? [momX, dadX] : [momX],
    y: sex === 'male' ? { ...dadY } : null,
    tail: Math.round(Math.min(100, Math.max(0, tail))),
  };
}

export function phenotype(g: GuppyGenome): GuppyPhenotype {
  const male = g.y !== null;
  return {
    albino: g.albino[0] === 1 && g.albino[1] === 1,
    gold: g.gold[0] === 1 && g.gold[1] === 1,
    tuxedo: g.tuxedo.includes(1),
    red: g.red.includes(1),
    // 母魚兩條 X 都有才看得出蛇紋；公魚 X 或 Y 有一個就會表現
    snake: male ? g.y!.snake === 1 || g.snakeX[0] === 1 : g.snakeX.every((x) => x === 1),
    grass: male && g.y!.grass === 1,
  };
}

/** 品系名：[白子][黃金／紅／藍] + 花紋。 */
export function strainName(p: GuppyPhenotype): string {
  const pre = p.albino ? '白子' : '';
  const color = p.red ? '紅' : '藍';
  if (p.snake) return `${pre}${p.gold ? '黃金' : color}蛇王`;
  if (p.grass) return `${pre}${p.gold ? '黃金' : ''}${color}草`;
  if (p.tuxedo) return `${pre}${color}尾禮服`;
  return `${pre}${p.gold ? '黃金' : ''}全${color}`;
}

/** 對應到畫面上最接近的品系外觀（GUPPY_STRAINS 的索引）。 */
export function lookIndex(p: GuppyPhenotype): number {
  if (p.snake) return p.gold ? 1 : 4;
  if (p.grass) return 0;
  if (p.tuxedo) return 3;
  return p.red ? 2 : 0;
}

/** 近交係數：同一個血統互配，每代往上加。 */
export function childInbreeding(motherCoef: number, fatherCoef: number, sameLine: boolean): number {
  const base = (motherCoef + fatherCoef) / 2;
  return sameLine ? Math.min(1, base + (1 - base) * 0.25) : base * 0.5;
}

/** 畫面用的外觀編號：有基因就照表現型挑，沒有就照舊用個體編號輪替。 */
export function lookVariant(fish: { id: number; genome?: GuppyGenome }): number {
  return fish.genome ? lookIndex(phenotype(fish.genome)) : fish.id;
}
