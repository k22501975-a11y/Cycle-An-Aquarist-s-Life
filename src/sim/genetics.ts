import { nextRandom, type RngState } from './random';

/**
 * 孔雀魚遺傳（strains.md §1.6、§6）：簡化成幾個真實的單基因加一個多基因數值。
 * - 白子 a、黃金 g：體染色體隱性，兩個都有才表現（Aa × Aa → 25%）
 * - 禮服 HB：體染色體顯性（簡化設定）
 * - 紅尾 R：顯性，沒有就是藍尾（簡化設定）
 * - 蛇紋 Ss：性聯，大多在公魚的 Y 上，只傳兒子；每次繁殖 1% 機率在 X、Y 之間換位
 * - 草尾 Gr：Y 連鎖，公魚 100% 傳給兒子、女兒 0%
 * - 尾鰭分數：多基因，子代約為父母平均再加上隨機變異；近親繁殖會退化。分數也決定尾型（圓尾、扇尾、大三角）
 * 鰭型（strains.md §1.3）：
 * - 燕尾 sw：體染色體隱性，所有鰭條拉長；公魚交接器也長，交配成功率只剩 5%
 * - 緞帶 Ri：體染色體顯性，腹鰭和交接器拉長；公魚實質不育，要用母緞帶 × 正常公
 * - 大耳：體染色體隱性，胸鰭變大
 * - 劍尾：Y 連鎖，上劍、下劍、雙劍
 * - 大C：帶緞帶、而且鰭長（多基因）夠高才表現，背鰭臀鰭拉長成 C 字；約 20 尾挑 1 尾，公魚是長公不能配
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
  y: { snake: 0 | 1; grass: 0 | 1; sword?: Sword } | null;
  /** 尾鰭分數 0–100（大小與形狀），評比和賣價看這個。 */
  tail: number;
  /** 燕尾、緞帶、大耳（舊存檔沒有，當作都沒帶）。 */
  swallow?: Pair;
  ribbon?: Pair;
  dumbo?: Pair;
  /** 鰭長 0–100（多基因）：跟緞帶一起決定會不會長成大C。 */
  fins?: number;
}

/** 劍尾：0 沒有、1 上劍、2 下劍、3 雙劍。 */
export type Sword = 0 | 1 | 2 | 3;
export type TailShape = 'round' | 'delta' | 'halfmoon';

/** 帶緞帶時，鰭長分數到這裡以上才長成大C（店裡的緞帶約 5% 達標）。 */
export const BIG_C_FINS = 66;

export interface GuppyPhenotype {
  albino: boolean;
  gold: boolean;
  tuxedo: boolean;
  red: boolean;
  snake: boolean;
  grass: boolean;
  swallow?: boolean;
  ribbon?: boolean;
  dumbo?: boolean;
  bigC?: boolean;
  sword?: Sword;
  tailShape?: TailShape;
  /** 鰭長多基因分數（0–1）：大C 的弧度、劍和拖絲的長度跟著變。 */
  finLength?: number;
}

/** 尾型：尾鰭分數越高越大越開，70 分以上展開到接近 180°（大三角）。程式裡的 id 還是 halfmoon，只改顯示名稱（YenWel 2026-10-21：孔雀魚沒有「半月」這個品系，台灣叫大三角）。 */
export function tailShape(tail: number): TailShape {
  return tail >= 70 ? 'halfmoon' : tail >= 40 ? 'delta' : 'round';
}

/** 公魚能不能配：緞帶、大C 的交接器太長幾乎不能交配，燕尾只剩一成不到。母魚都可以。 */
export function matingSuccess(g: GuppyGenome): number {
  if (!g.y) return 1;
  const p = phenotype(g);
  if (p.ribbon || p.bigC) return 0;
  if (p.swallow) return 0.05;
  return 1;
}

/** 店裡賣的鰭型品系（花紋照 GUPPY_STRAINS 的索引）。 */
export type FinTrait = 'swallow' | 'ribbon' | 'dumbo' | 'sword' | 'halfmoon' | 'bigC';
export const GUPPY_FIN_STRAINS: Array<{ name: string; strain: number; fin: FinTrait; price: number }> = [
  { name: '藍尾禮服大耳', strain: 3, fin: 'dumbo', price: 150 },
  { name: '藍尾禮服燕尾', strain: 3, fin: 'swallow', price: 180 },
  { name: '藍草尾雙劍', strain: 0, fin: 'sword', price: 120 },
  { name: '全紅白子大三角', strain: 2, fin: 'halfmoon', price: 160 },
  { name: '藍尾禮服緞帶', strain: 3, fin: 'ribbon', price: 200 },
  { name: '藍草尾大C', strain: 0, fin: 'bigC', price: 380 },
];

/** 店裡常見的五個品系（順序和畫面的品系外觀表一致）。 */
export const GUPPY_STRAINS = ['藍草尾', '黃金蛇王', '全紅白子', '藍尾禮服', '紅蛇王'] as const;
/** 各品系的店價（台灣水族館行情，元）。 */
export const GUPPY_STRAIN_PRICES = [60, 120, 100, 60, 80];

/** 表現型的身價：照最接近的品系，白子、黃金這類隱性品系比較稀有。 */
export function phenotypeValue(p: GuppyPhenotype): number {
  const fin = p.bigC ? 3 : (p.ribbon ? 1.5 : 1) * (p.swallow ? 1.5 : 1) * (p.dumbo ? 1.4 : 1);
  const sword = p.sword === 3 ? 1.3 : p.sword ? 1.15 : 1;
  const shape = p.tailShape === 'halfmoon' ? 1.2 : 1;
  return GUPPY_STRAIN_PRICES[lookIndex(p)] * (p.albino && !p.red ? 1.2 : 1) * fin * sword * shape;
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
    const label = [d.albino ? '白子' : '', d.gold ? '黃金' : '', d.tuxedo ? '禮服' : '', d.snake ? '蛇紋' : '', ...finWords(d)].filter(Boolean).join('、') || '一般';
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
export function storeGenome(rng: RngState, sex: 'male' | 'female', strain?: number, fin?: FinTrait): GuppyGenome {
  const index = strain ?? Math.floor(nextRandom(rng) * GUPPY_STRAINS.length);
  const g = template(index, sex);
  if (g.albino[0] === 0 && nextRandom(rng) < 0.2) g.albino = [0, 1];
  g.tail = Math.round(Math.min(100, Math.max(0, 45 + gaussian(rng) * 10)));
  if (fin) applyFin(rng, g, fin);
  return g;
}

/** 鰭型品系：純合（隱性）或帶一個（緞帶）；劍尾在公魚的 Y 上，母魚的兒子才會有。 */
function applyFin(rng: RngState, g: GuppyGenome, fin: FinTrait): void {
  g.fins = Math.round(Math.min(100, Math.max(0, 45 + gaussian(rng) * 12)));
  if (fin === 'swallow') g.swallow = [1, 1];
  if (fin === 'dumbo') g.dumbo = [1, 1];
  if (fin === 'ribbon' || fin === 'bigC') g.ribbon = [1, 0];
  if (fin === 'bigC') g.fins = Math.max(g.fins, BIG_C_FINS + 4);
  // 鰭長到大C 的緞帶魚店家會挑出來當大C 賣，一般緞帶的貨不會有
  else if (fin === 'ribbon') g.fins = Math.min(g.fins, BIG_C_FINS - 1);
  if (fin === 'sword' && g.y) g.y.sword = 3;
  if (fin === 'halfmoon') g.tail = Math.max(g.tail, 72);
}

/** 店魚尾鰭分數最高（45 + gaussian × 10，4.5 個標準差）。 */
export const STORE_TAIL_MAX = 90;

const samePair = (a: Pair | undefined, b: Pair | undefined) => (a ?? [0, 0])[0] === (b ?? [0, 0])[0] && (a ?? [0, 0])[1] === (b ?? [0, 0])[1];

/**
 * 這份基因是不是店裡買得到的（storeGenome 生得出來，或店裡懷孕母魚肚子裡的精子）：花紋要是某個品系的模板（白子可以多帶一個隱性），
 * 鰭型最多一種（applyFin），尾鰭分數在店魚範圍內。伺服器檢查新出現的魚用（genome-check.ts）。
 */
export function couldBeStoreGenome(g: GuppyGenome): boolean {
  if (!(g.tail >= 0 && g.tail <= STORE_TAIL_MAX)) return false;
  if (g.fins !== undefined && !(g.fins >= 0 && g.fins <= 100)) return false;
  const sex = g.y ? 'male' : 'female';
  const strainOk = GUPPY_STRAINS.some((_, i) => {
    const t = template(i, sex);
    const albino = samePair(g.albino, t.albino) || (samePair(t.albino, [0, 0]) && samePair(g.albino, [0, 1]));
    const y = !t.y ? !g.y : !!g.y && g.y.snake === t.y.snake && g.y.grass === t.y.grass;
    return albino && samePair(g.gold, t.gold) && samePair(g.tuxedo, t.tuxedo) && samePair(g.red, t.red) && g.snakeX.join() === t.snakeX.join() && y;
  });
  if (!strainOk) return false;
  const sword = g.y?.sword ?? 0;
  const none = (k: 'swallow' | 'ribbon' | 'dumbo') => samePair(g[k], [0, 0]);
  const only = (k: 'swallow' | 'ribbon' | 'dumbo' | null) => (['swallow', 'ribbon', 'dumbo'] as const).every((x) => x === k || none(x));
  if (g.fins === undefined) {
    // 沒有鰭型；或燕尾母魚肚子裡的精子（帶一個燕尾的正常公魚）
    return sword === 0 && (only(null) || (only('swallow') && samePair(g.swallow, [1, 0])));
  }
  if (only('swallow') && samePair(g.swallow, [1, 1])) return sword === 0;
  if (only('dumbo') && samePair(g.dumbo, [1, 1])) return sword === 0;
  if (only('ribbon') && samePair(g.ribbon, [1, 0])) return sword === 0 && (g.fins <= BIG_C_FINS - 1 || g.fins >= BIG_C_FINS + 4);
  if (!only(null)) return false;
  // 劍尾（公魚 Y 上雙劍；母魚看不出來）、大三角（尾鰭至少 72）
  return sex === 'female' || sword === 3 || (sword === 0 && g.tail >= 72);
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
  // 鰭型基因：舊存檔沒有，當作都沒帶（不多抽亂數，舊魚的子代跟以前一樣）
  const fins: Partial<GuppyGenome> = {};
  for (const key of ['swallow', 'ribbon', 'dumbo'] as const) {
    if (mother[key] || father[key]) fins[key] = inherit(rng, mother[key] ?? [0, 0], father[key] ?? [0, 0]);
  }
  if (mother.fins !== undefined || father.fins !== undefined) {
    const fm = ((mother.fins ?? 45) + (father.fins ?? 45)) / 2;
    // 大C 很不穩定：鰭長的變異大，二十尾才挑得出一尾
    fins.fins = Math.round(Math.min(100, Math.max(0, fm + (45 - fm) * 0.4 + gaussian(rng) * 12 - inbreeding * 20)));
  }
  return {
    ...fins,
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
    swallow: !!g.swallow && g.swallow[0] === 1 && g.swallow[1] === 1,
    ribbon: !!g.ribbon?.includes(1),
    dumbo: !!g.dumbo && g.dumbo[0] === 1 && g.dumbo[1] === 1,
    bigC: !!g.ribbon?.includes(1) && (g.fins ?? 0) >= BIG_C_FINS,
    sword: male ? (g.y!.sword ?? 0) : 0,
    tailShape: tailShape(g.tail),
    finLength: (g.fins ?? 45) / 100,
  };
}

/** 鰭型的稱呼（品系名的最後一段）。 */
export function finWords(p: GuppyPhenotype): string[] {
  const out: string[] = [];
  if (p.sword) out.push(['', '上劍', '下劍', '雙劍'][p.sword]);
  if (p.dumbo) out.push('大耳');
  if (p.swallow) out.push('燕尾');
  if (p.bigC) out.push('大C');
  else if (p.ribbon) out.push('緞帶');
  if (!out.length && p.tailShape === 'halfmoon') out.push('大三角');
  return out;
}

/** 品系名：[白子][黃金／紅／藍] + 花紋。 */
export function strainName(p: GuppyPhenotype): string {
  return baseStrainName(p) + finWords(p).join('');
}

function baseStrainName(p: GuppyPhenotype): string {
  const pre = p.albino ? '白子' : '';
  const color = p.red ? '紅' : '藍';
  if (p.snake) return `${pre}${p.gold ? '黃金' : color}蛇王`;
  if (p.grass) return `${pre}${p.gold ? '黃金' : ''}${color}草尾`;
  if (p.tuxedo) return `${pre}${color}尾禮服`;
  // 台灣店家寫「全紅白子」：白子放後面（design/naming.md）
  return `${p.gold ? '黃金' : ''}全${color}${pre}`;
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
