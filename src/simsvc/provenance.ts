import { FISH_SPECIES, GUPPY_STRAINS, type Fish, type GuppyGenome } from '../sim';

/**
 * 新出現的魚從哪裡來（#76）：伺服器上一份沒有的魚，只能是
 * - 店裡買的（第 0 代；孔雀魚的基因要是店裡品系的樣子）
 * - 市場買到的（跟伺服器記錄的到貨魚身分一樣，一筆只算一條）
 * - 缸裡生的（媽媽在上一份或已經確認過的新魚裡；孔雀魚的每個基因要能從媽媽和她配過的公魚各拿一個，
 *   尾鰭、鰭長不能高出父母太多；一個媽媽這段時間生的數量有上限）
 * 不是這些來源的魚回傳出來，由 verify 擋下。
 */

/** 市場到貨的魚（市場用的魚資料）：品種、性別、第幾代、基因，懷孕母魚還有配過的公魚。 */
export interface ReceivedFish {
  species?: unknown;
  sex?: unknown;
  generation?: unknown;
  genome?: unknown;
  sire?: unknown;
}

/** 子代尾鰭、鰭長最多比父母預期高幾個標準差（cross 的變異：尾鰭 8、鰭長 12）。 */
export const TRAIT_SIGMAS = 5;
const TAIL_SD = 8;
const FINS_SD = 12;
/** 沒有懷孕期的魚種（親魚護卵）一胎的間隔至少當成一週。 */
const MIN_BROOD_DAYS = 7;

const FIN_KEYS = ['swallow', 'ribbon', 'dumbo'] as const;
const PAIR_KEYS = ['albino', 'gold', 'tuxedo', 'red'] as const;

/** 店裡的孔雀魚（storeGenome）：品系的純種基因型，可能偷帶一個白子；鰭型品系的鰭基因。 */
export function looksStoreBought(g: GuppyGenome, sex: 'male' | 'female'): boolean {
  if (!validGenome(g, sex)) return false;
  for (let index = 0; index < GUPPY_STRAINS.length; index++) {
    const t = strainTemplate(index);
    const pairsOk = PAIR_KEYS.every((k) => {
      const p = g[k];
      if (t[k] === 1) return p[0] === 1 && p[1] === 1;
      return k === 'albino' ? p[0] === 0 : p[0] === 0 && p[1] === 0;
    });
    const xOk = g.snakeX.every((x) => x === t.snake);
    const yOk = sex === 'female' || (g.y!.snake === t.snake && g.y!.grass === t.grass && (g.y!.sword === undefined || g.y!.sword === 3));
    // 鰭型：純合，或帶一個（緞帶、店裡配種用的燕尾公魚）
    const finsOk = FIN_KEYS.every((k) => g[k] === undefined || (g[k]![0] === 1 && (g[k]![1] === 1 || g[k]![1] === 0)));
    if (pairsOk && xOk && yOk && finsOk) return true;
  }
  return false;
}

/** 品系的純種基因（跟 genetics.ts 的 template 同一張表）。 */
function strainTemplate(index: number): Record<'albino' | 'gold' | 'tuxedo' | 'red' | 'snake' | 'grass', 0 | 1> {
  const t = { albino: 0, gold: 0, tuxedo: 0, red: 0, snake: 0, grass: 0 } as Record<'albino' | 'gold' | 'tuxedo' | 'red' | 'snake' | 'grass', 0 | 1>;
  if (index === 0) t.grass = 1;
  if (index === 1) t.gold = t.snake = 1;
  if (index === 2) t.albino = t.red = 1;
  if (index === 3) t.tuxedo = 1;
  if (index === 4) t.red = t.snake = 1;
  return t;
}

const bit = (v: unknown): boolean => v === 0 || v === 1;
const pair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(bit);
const score = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** 基因的形狀對不對：每個等位基因是 0 或 1，公魚一條 X 一條 Y、母魚兩條 X。 */
function validGenome(g: GuppyGenome, sex: 'male' | 'female'): boolean {
  if (!g || typeof g !== 'object') return false;
  if (!PAIR_KEYS.every((k) => pair(g[k]))) return false;
  if (!FIN_KEYS.every((k) => g[k] === undefined || pair(g[k]))) return false;
  if (!score(g.tail) || (g.fins !== undefined && !score(g.fins))) return false;
  if (!Array.isArray(g.snakeX) || g.snakeX.length !== (sex === 'female' ? 2 : 1) || !g.snakeX.every(bit)) return false;
  if (sex === 'female') return g.y === null;
  const y = g.y;
  return !!y && bit(y.snake) && bit(y.grass) && (y.sword === undefined || [0, 1, 2, 3].includes(y.sword));
}

/** 子代的基因能不能從這對父母配出來（cross）。 */
export function couldInherit(child: GuppyGenome, sex: 'male' | 'female', mother: GuppyGenome, father: GuppyGenome): boolean {
  if (!validGenome(child, sex)) return false;
  const fromBoth = (c: readonly number[], m: readonly number[], d: readonly number[]) =>
    (m.includes(c[0]) && d.includes(c[1])) || (m.includes(c[1]) && d.includes(c[0]));
  if (!PAIR_KEYS.every((k) => fromBoth(child[k], mother[k], father[k]))) return false;
  for (const k of FIN_KEYS) {
    const m = mother[k] ?? [0, 0];
    const d = father[k] ?? [0, 0];
    if (!mother[k] && !father[k]) {
      if (child[k] && (child[k]![0] || child[k]![1])) return false;
    } else if (!fromBoth(child[k] ?? [0, 0], m, d)) return false;
  }
  // 性染色體：媽媽的一條 X；爸爸的 X 給女兒、Y 給兒子（蛇紋偶爾在爸爸的 X、Y 之間換位）
  const dadY = father.y ?? { snake: 0, grass: 0 };
  const dadSnake = [father.snakeX[0] ?? 0, dadY.snake];
  if (!mother.snakeX.includes(child.snakeX[0])) return false;
  if (sex === 'female' && !dadSnake.includes(child.snakeX[1])) return false;
  if (sex === 'male') {
    const y = child.y!;
    if (!dadSnake.includes(y.snake) || y.grass !== dadY.grass || (y.sword ?? 0) !== (dadY.sword ?? 0)) return false;
  }
  // 多基因：子代平均約為父母平均（往 50、45 回歸），近交只會往下拉
  const tailMid = (mother.tail + father.tail) / 2;
  if (child.tail > tailMid + (50 - tailMid) * 0.3 + TRAIT_SIGMAS * TAIL_SD) return false;
  if (child.fins !== undefined) {
    const fm = ((mother.fins ?? 45) + (father.fins ?? 45)) / 2;
    if (child.fins > fm + (45 - fm) * 0.4 + TRAIT_SIGMAS * FINS_SD) return false;
  }
  return true;
}

const same = (a: unknown, b: unknown): boolean => canonical(a ?? null) === canonical(b ?? null);

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * 找出來源說不通的新魚。prev／next 是兩份存檔裡所有的魚（含檢疫盒），ranHours 是這段時間的遊戲小時。
 */
export function unexplainedFish(prev: readonly Fish[], next: readonly Fish[], ranHours: number, received: readonly ReceivedFish[] = []): Fish[] {
  const before = new Map(prev.map((f) => [f.id, f]));
  const after = new Map(next.map((f) => [f.id, f]));
  const fresh = next.filter((f) => !before.has(f.id));
  if (fresh.length === 0) return [];
  const pending = new Set(fresh);
  const trusted: Fish[] = [...prev];
  const store = new Set<Fish>();
  const arrived = new Map<Fish, ReceivedFish>();
  const accept = (f: Fish) => {
    pending.delete(f);
    trusted.push(f);
  };

  // 市場到貨：身分一樣的到貨紀錄，一筆只能對一條
  const unused = [...received];
  for (const f of fresh) {
    const i = unused.findIndex((r) => r.species === f.species && r.sex === f.sex && Number(r.generation ?? 0) === (f.generation ?? 0) && same(r.genome, f.genome));
    if (i < 0) continue;
    arrived.set(f, unused[i]);
    unused.splice(i, 1);
    accept(f);
  }
  // 店裡買的：第 0 代，孔雀魚的基因是店裡品系的樣子（舊存檔沒有基因的孔雀魚由讀檔補上，也是品系的樣子）
  for (const f of [...pending]) {
    if ((f.generation ?? 0) !== 0) continue;
    if (f.species === 'guppy' && f.genome && !looksStoreBought(f.genome, f.sex)) continue;
    store.add(f);
    accept(f);
  }

  /** 這條母魚可能配過的公魚：上一份記的、這次存檔記的（要是缸裡有過的公魚、店裡或市場帶來的）。 */
  const males = () => trusted.filter((m) => m.species === 'guppy' && m.sex === 'male' && m.genome).map((m) => m.genome!);
  const sires = (mother: Fish): GuppyGenome[] => {
    const out: GuppyGenome[] = [];
    const old = before.get(mother.id)?.sire?.genome;
    if (old) out.push(old);
    const now = after.get(mother.id)?.sire?.genome;
    if (now) {
      const ok =
        (old && same(now, old)) ||
        males().some((g) => same(g, now)) ||
        (store.has(mother) && looksStoreBought(now, 'male')) ||
        (arrived.has(mother) && same((arrived.get(mother)!.sire as { genome?: unknown } | undefined)?.genome, now));
      if (ok) out.push(now);
    }
    return [...out, ...males()];
  };

  // 缸裡生的：一代一代往下認（離線很久時，這段時間出生的魚也可能已經生了下一代）
  const used = new Map<Fish, number>();
  let progress = true;
  while (progress && pending.size > 0) {
    progress = false;
    const born = new Map<Fish, Fish[]>();
    for (const f of [...pending].sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))) {
      const g = f.generation ?? 0;
      const mothers = trusted.filter(
        (m) =>
          m.species === f.species &&
          m.sex === 'female' &&
          (m.generation ?? 0) === g - 1 &&
          (f.species !== 'guppy' || !f.genome || ((m.lineage ?? m.id) === f.lineage && !!m.genome)),
      );
      const mother = mothers.find((m) => !f.genome || !m.genome || sires(m).some((s) => couldInherit(f.genome!, f.sex, m.genome!, s)));
      if (g < 1 || !mother) continue;
      const kids = born.get(mother) ?? [];
      kids.push(f);
      born.set(mother, kids);
    }
    // 一個媽媽這段時間最多生幾胎
    for (const [mother, kids] of born) {
      const b = FISH_SPECIES[mother.species].breeding;
      if (!b) continue;
      const broods = 1 + Math.floor(Math.max(0, ranHours) / (Math.max(b.gestationDays, MIN_BROOD_DAYS) * 24));
      const room = Math.max(0, b.broodMax * broods - (used.get(mother) ?? 0));
      if (room === 0) continue;
      for (const kid of kids.slice(0, room)) accept(kid);
      used.set(mother, (used.get(mother) ?? 0) + Math.min(room, kids.length));
      progress = true;
    }
  }
  return fresh.filter((f) => pending.has(f));
}
