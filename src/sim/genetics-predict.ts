import { type GuppyGenome, type GuppyPhenotype, GUPPY_STRAIN_PRICES, cross, phenotype, finWords, strainName, lookIndex } from './genetics';

// 預測小魚長相、算外觀分數：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
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

/** 表現型的身價：照最接近的品系，白子、黃金這類隱性品系比較稀有。 */
export function phenotypeValue(p: GuppyPhenotype): number {
  const fin = p.bigC ? 3 : (p.ribbon ? 1.5 : 1) * (p.swallow ? 1.5 : 1) * (p.dumbo ? 1.4 : 1);
  const sword = p.sword === 3 ? 1.3 : p.sword ? 1.15 : 1;
  const shape = p.tailShape === 'halfmoon' ? 1.2 : 1;
  return GUPPY_STRAIN_PRICES[lookIndex(p)] * (p.albino && !p.red ? 1.2 : 1) * fin * sword * shape;
}
