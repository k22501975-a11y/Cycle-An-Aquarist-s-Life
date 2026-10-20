import { cross, finWords, lookIndex, phenotype, storeGenome, strainName, type FinTrait, type GuppyGenome, type TailShape } from './genetics';

/**
 * 選魚當下就看得到後果（polish-to-9.md §6 P3）：挑公母的時候先預覽「這對可能生出什麼」，
 * 把遺傳的樂趣從第 12 天搬到第 4 分鐘。只出資料：每種小魚的外觀編號、鰭型、尾型和機率，畫面畫成 2～3 尾小魚加機率圖示。
 * 用現有的配種（cross）模擬很多次統計，固定種子，同一對每次看到的都一樣。
 */

export interface PreviewKid {
  sex: 'male' | 'female';
  /** 品系名（母魚多半看起來是素的，名稱照基因寫）。 */
  name: string;
  /** 畫面用的外觀編號（GUPPY_STRAINS 的索引）。 */
  look: number;
  /** 鰭型字（燕尾、緞帶、雙劍…）；沒有就是空的。 */
  fins: string[];
  tailShape: TailShape;
  /** 在所有小魚裡佔幾 %（公母合計 100）。 */
  pct: number;
}

/** 這對公母的小魚，最常見的 top 種（公母混在一起排）。 */
export function previewPair(mother: GuppyGenome, father: GuppyGenome, top = 3, samples = 400): PreviewKid[] {
  const rng = { seed: 24680 };
  const counts = new Map<string, { kid: Omit<PreviewKid, 'pct' | 'tailShape'>; n: number; tails: Map<TailShape, number> }>();
  for (let i = 0; i < samples; i++) {
    const sex = i % 2 === 0 ? 'male' : 'female';
    const p = phenotype(cross(rng, mother, father, sex));
    const kid = { sex, name: strainName(p), look: lookIndex(p), fins: finWords(p) } as const;
    // 尾鰭是多基因、每尾不一樣：同一個品系算一種，尾型取最常見的
    const key = `${sex}:${kid.name}`;
    const hit = counts.get(key) ?? { kid, n: 0, tails: new Map<TailShape, number>() };
    hit.n++;
    const tail = p.tailShape ?? 'round';
    hit.tails.set(tail, (hit.tails.get(tail) ?? 0) + 1);
    counts.set(key, hit);
  }
  return [...counts.values()]
    // 太少見的（< 3%）不列，免得預覽一堆雜項
    .filter((c) => c.n / samples >= 0.03)
    .sort((a, b) => b.n - a.n)
    .slice(0, top)
    .map(({ kid, n, tails }) => ({
      ...kid,
      fins: [...kid.fins],
      tailShape: [...tails.entries()].sort((a, b) => b[1] - a[1])[0][0],
      pct: Math.round((n / samples) * 100),
    }));
}

/** 店裡這個品系一尾「典型」的魚（不帶偷偷的白子基因，尾鰭分數取平均），預覽用。 */
export function typicalStoreGenome(sex: 'male' | 'female', strain: number, fin?: FinTrait): GuppyGenome {
  const g = storeGenome({ seed: 13579 + strain }, sex, strain, fin);
  if (!(g.albino[0] === 1 && g.albino[1] === 1)) g.albino = [0, 0];
  if (fin !== 'halfmoon') g.tail = 45;
  return g;
}

export interface ShopPairPreview {
  /** 店裡的母魚多半已經懷孕（mvp.md §4.6）：第一窩是跟店裡同品系的公魚配的。 */
  firstBrood: PreviewKid[];
  /** 之後跟玩家挑的這尾公魚配。 */
  withYourMale: PreviewKid[];
  /**
   * 再下一代（兄妹配）才會冒出來、這一代看不到的：隱性的白子、黃金、燕尾…藏在小魚身上。
   * 這是「自己選育」的入口（P2 夢想魚路線的第三步）。
   */
  grandkids: PreviewKid[];
}

/** 在商店挑一公一母（品系、鰭型）時的預覽。 */
export function previewShopPair(mother: { strain: number; fin?: FinTrait }, father: { strain: number; fin?: FinTrait }): ShopPairPreview {
  const mom = typicalStoreGenome('female', mother.strain, mother.fin);
  // 店裡配種用的公魚：鰭型只有劍尾、大耳、半月是公魚帶得了的（跟 addFish 一樣）
  const storeFin = mother.fin === 'sword' || mother.fin === 'dumbo' || mother.fin === 'halfmoon' ? mother.fin : undefined;
  const storeSire = typicalStoreGenome('male', mother.strain, storeFin);
  const dad = typicalStoreGenome('male', father.strain, father.fin);
  const withYourMale = previewPair(mom, dad);
  return { firstBrood: previewPair(mom, storeSire), withYourMale, grandkids: hiddenInGrandkids(mom, dad, withYourMale) };
}

/** 子代兄妹配，孫代裡有、子代沒有的外觀（最多 2 種）。 */
function hiddenInGrandkids(mother: GuppyGenome, father: GuppyGenome, kids: PreviewKid[], samples = 400): PreviewKid[] {
  const rng = { seed: 97531 };
  const seen = new Set(kids.map((k) => `${k.sex}:${k.name}`));
  // 爸媽本身的樣子隔代又出現也算，但排在全新的外觀後面
  const parents = new Set([strainName(phenotype(mother)), strainName(phenotype(father))]);
  const counts = new Map<string, { kid: PreviewKid; n: number }>();
  for (let i = 0; i < samples; i++) {
    // 每次抽一對子代來配，涵蓋子代之間的差異
    const son = cross(rng, mother, father, 'male');
    const daughter = cross(rng, mother, father, 'female');
    const sex = i % 2 === 0 ? 'male' : 'female';
    const p = phenotype(cross(rng, daughter, son, sex));
    const name = strainName(p);
    const key = `${sex}:${name}`;
    if (seen.has(key)) continue;
    const hit = counts.get(key) ?? { kid: { sex, name, look: lookIndex(p), fins: finWords(p), tailShape: p.tailShape ?? 'round', pct: 0 }, n: 0 };
    hit.n++;
    counts.set(key, hit);
  }
  const novel = (c: { kid: PreviewKid }) => (parents.has(c.kid.name) ? 0 : 1);
  return [...counts.values()]
    .filter((c) => c.n / samples >= 0.03)
    .sort((a, b) => novel(b) - novel(a) || b.n - a.n)
    .slice(0, 2)
    .map(({ kid, n }) => ({ ...kid, pct: Math.round((n / samples) * 100) }));
}
