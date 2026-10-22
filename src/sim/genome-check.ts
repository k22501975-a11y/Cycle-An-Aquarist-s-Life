import { couldBeStoreGenome, legacyGenome, type GuppyGenome, type Pair } from './genetics';
import { type Fish, type TankState } from './state';

/**
 * 新生魚的基因檢查（L2，#76）：伺服器重播不了整段模擬（亂數跟著每個動作走），改成檢查兩份存檔之間新出現的孔雀魚，
 * 基因是不是真的生得出來、買得到。抓的是「改存檔把小魚改成好基因」：
 * - 缸裡生的（有媽媽編號或出生時間）：每個基因座有一個要來自媽媽（cross 的順序），另一個來自缸裡的某尾公魚或媽媽存的精子；
 *   對不上缸裡任何公魚時，當作已經賣掉的店魚當爸爸，只看媽媽那一半。尾鰭分數、鰭長不能高過爸媽平均能變異到的範圍。
 * - 媽媽找不到：這段時間要長到夠生小魚的媽媽又死掉、撈掉才可能，太短就不收。
 * - 不是缸裡生的：要跟伺服器知道的魚一樣（上一份裡的、市場出貨或買到的），不然就是店裡的魚，要在店魚的範圍裡。
 * - 母魚存的精子換了：要是缸裡某尾公魚的基因，或是店魚範圍內的。
 * 範圍都放寬（4.5 個標準差），正常繁殖幾乎不會碰到；只擋一看就不可能的。
 *
 * 來歷查不到（untraced，#76）：媽媽不在存檔裡、時間又夠長（或沒有上一份可比）的小魚，基因沒辦法查。
 * 不擋存檔（正常養很久，媽媽早就死了），但標出來，伺服器記下這幾尾不能上架；牠們生的小魚也跟著標
 * （媽媽是查不到的，或媽媽存的精子是查不到的公魚的）。
 */

/** 子代尾鰭分數的變異（cross：每尾加 gaussian × 8）、鰭長的變異（× 12），幾個標準差以上算不可能。 */
const TAIL_SD = 8;
const FINS_SD = 12;
export const GENOME_SIGMAS = 4.5;
/** 已經賣掉、存檔裡找不到的店魚當爸爸時，照這個尾鰭分數算（店魚的 2 個標準差；缸裡有更好的公魚就照那尾）。 */
export const UNKNOWN_FATHER_TAIL = 65;
/** 媽媽在上一份之後才出生、又在下一份之前死掉撈掉，至少要這麼多遊戲天（長大加懷孕）。 */
export const MIN_MOTHER_DAYS = 20;

const PAIRS = ['albino', 'gold', 'tuxedo', 'red'] as const;
const FIN_PAIRS = ['swallow', 'ribbon', 'dumbo'] as const;

export interface ForgedFish {
  id: number;
  reason: string;
  /** 來歷查不到：不擋存檔，只是不能上架。 */
  untraced?: { genome: unknown };
}

/** 伺服器記得的來歷查不到的魚（編號＋基因：新遊戲編號會重來，同編號不同基因是另一條）。 */
export interface UntracedFish {
  id: number;
  genome: unknown;
}

export interface GenomeCheckOptions {
  /** 沒有上一份可比（雲端第一次上傳、強制覆蓋）：媽媽不在的都算查不到，不看時間。 */
  alone?: boolean;
  untraced?: readonly UntracedFish[];
}

const allFish = (tanks: TankState[]): Fish[] => tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]);

/** 基因比對用的字串（不看欄位順序、沒有值的欄位）。 */
export function genomeKey(g: unknown): string {
  if (Array.isArray(g)) return `[${g.map(genomeKey).join(',')}]`;
  if (g && typeof g === 'object') {
    const o = g as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${genomeKey(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(g ?? null);
}

const has = (pair: Pair | undefined, allele: number) => (pair ?? [0, 0]).includes(allele as 0 | 1);

/** 媽媽那一半對得上：每個體染色體基因座的第一個來自媽媽，X 上的蛇紋來自媽媽的一條 X。 */
function maternalOk(c: GuppyGenome, m: GuppyGenome): boolean {
  for (const k of PAIRS) if (!has(m[k], c[k][0])) return false;
  for (const k of FIN_PAIRS) if (c[k] && !has(m[k], c[k]![0])) return false;
  return m.snakeX.includes(c.snakeX[0] ?? 0);
}

/** 爸爸那一半對得上：第二個來自爸爸；女兒拿爸爸的 X、兒子拿爸爸的 Y（蛇紋偶爾在 X、Y 之間換位）。 */
function paternalOk(c: GuppyGenome, f: GuppyGenome): boolean {
  if (!f.y) return false;
  for (const k of PAIRS) if (!has(f[k], c[k][1])) return false;
  for (const k of FIN_PAIRS) if (c[k] && !has(f[k], c[k]![1])) return false;
  const dadX = f.snakeX[0] ?? 0;
  const snakes = [dadX, f.y.snake];
  if (c.y) return snakes.includes(c.y.snake) && c.y.grass === f.y.grass && (c.y.sword ?? 0) === (f.y.sword ?? 0);
  return snakes.includes(c.snakeX[1] ?? 0);
}

/** 爸媽是這樣時，子代的尾鰭分數、鰭長最高能到多少（cross 的平均往族群回歸，再加變異；不算近交扣分，寬一點）。 */
function quantOk(c: GuppyGenome, m: GuppyGenome, fatherTail: number, fatherFins: number | undefined): boolean {
  const mid = (m.tail + fatherTail) / 2;
  if (c.tail > mid + (50 - mid) * 0.3 + GENOME_SIGMAS * TAIL_SD) return false;
  if (c.fins === undefined) return true;
  const fm = ((m.fins ?? 45) + (fatherFins ?? 45)) / 2;
  return c.fins <= fm + (45 - fm) * 0.4 + GENOME_SIGMAS * FINS_SD;
}

/** 店魚生得出來的（storeGenome：品系模板、最多一種鰭型、尾鰭分數不會太高）。 */
const storeOk = (g: GuppyGenome) => couldBeStoreGenome(g);

/**
 * 兩份存檔之間新出現、或精子換了的孔雀魚，基因不可能的列出來。
 * known 是伺服器知道的魚資料（這個玩家在市場出貨的、買到的）：一樣的基因就是那條魚。
 */
export function forgedGenomes(prev: TankState[], next: TankState[], known: readonly unknown[] = [], opts: GenomeCheckOptions = {}): ForgedFish[] {
  const before = new Map(allFish(prev).map((f) => [f.id, f]));
  const after = allFish(next);
  const nowById = new Map(after.map((f) => [f.id, f]));
  const guppies = [...before.values(), ...after].filter((f) => f.species === 'guppy' && f.genome);
  const males = guppies.filter((f) => f.genome!.y);
  // 伺服器知道的：上一份裡的魚（還有牠們存的精子），和市場出貨、買到的
  const knownKeys = new Set([...[...before.values()].flatMap((f) => [f.genome, f.sire?.genome]).filter(Boolean).map(genomeKey), ...known.map(genomeKey)]);
  const maleKeys = new Set(males.map((f) => genomeKey(f.genome)));
  const days = (next[0].hours - prev[0].hours) / 24;
  const out: ForgedFish[] = [];
  // 查不到來歷的：伺服器記得的，加上這次新標的（照編號順序，媽媽一定比小魚早）
  const lost = new Set((opts.untraced ?? []).map((u) => `${u.id}|${genomeKey(u.genome)}`));
  const lostGenomes = new Set((opts.untraced ?? []).map((u) => genomeKey(u.genome)));
  const isLost = (f: Fish) => lost.has(`${f.id}|${genomeKey(f.genome)}`);
  const markLost = (c: Fish, reason: string) => {
    out.push({ id: c.id, reason, untraced: { genome: c.genome } });
    lost.add(`${c.id}|${genomeKey(c.genome)}`);
    lostGenomes.add(genomeKey(c.genome));
  };

  for (const c of [...after].sort((a, b) => a.id - b.id)) {
    if (c.species !== 'guppy' || !c.genome) continue;
    const old = before.get(c.id);
    // 精子換了（重新配對、新買來懷孕的）：要是缸裡公魚的、伺服器知道的，或店魚範圍內的
    if (c.sire && genomeKey(c.sire) !== genomeKey(old?.sire ?? null)) {
      const k = genomeKey(c.sire.genome);
      if (!maleKeys.has(k) && !knownKeys.has(k) && !storeOk(c.sire.genome)) out.push({ id: c.id, reason: `#${c.id} 肚子裡的精子不是缸裡任何一尾公魚的` });
    }
    if (old) continue;
    const g = c.genome;
    if (c.motherId === undefined && c.bornHours === undefined) {
      // 不是缸裡生的：伺服器知道的魚（市場），不然就是店裡買的
      if (!knownKeys.has(genomeKey(g)) && ((c.generation ?? 0) > 0 || !storeOk(g))) out.push({ id: c.id, reason: `#${c.id} 這條魚不是店裡買得到的，也不是市場來的` });
      continue;
    }
    const mother = c.motherId !== undefined ? (before.get(c.motherId) ?? nowById.get(c.motherId)) : undefined;
    if (!mother?.genome) {
      if (!opts.alone && days < MIN_MOTHER_DAYS) out.push({ id: c.id, reason: `#${c.id} 這條小魚的媽媽不在存檔裡` });
      else markLost(c, `#${c.id} 這條小魚的媽媽不在存檔裡，查不到來歷`);
      continue;
    }
    const m = mother.genome;
    const momSire = [before.get(mother.id), nowById.get(mother.id)].find((f) => f?.sire)?.sire;
    if (isLost(mother) || (momSire && lostGenomes.has(genomeKey(momSire.genome)))) {
      markLost(c, `#${c.id} 爸媽的來歷查不到`);
      continue;
    }
    // 媽媽沒存精子就生的（舊存檔、市場買來懷孕但沒附精子）：讀檔時照編號補的舊基因，尾鰭 50，不用查
    const sires = [before.get(mother.id), nowById.get(mother.id)].filter((f) => f?.sire);
    if (sires.length === 0 && genomeKey(g) === genomeKey(legacyGenome(c.id, c.sex))) continue;
    if (!maternalOk(g, m)) {
      out.push({ id: c.id, reason: `#${c.id} 這條小魚的基因不可能是牠媽媽生的` });
      continue;
    }
    // 爸爸：媽媽存的精子，或缸裡夠大的公魚（同一胎、剛出生的兄弟不算）
    const born = c.bornHours ?? next[0].hours;
    const adults = males.filter((f) => f.bornHours === undefined || f.bornHours <= born - MIN_MOTHER_DAYS * 24);
    // 來歷查不到的公魚不能當「查得到」的爸爸：只有牠對得上的小魚也查不到
    const grown = adults.filter((f) => !isLost(f)).map((f) => f.genome!);
    const fathers = [before.get(mother.id), nowById.get(mother.id)].flatMap((f) => (f?.sire ? [f.sire.genome] : [])).concat(grown);
    const fitsAny = (dads: GuppyGenome[]) => dads.some((f) => paternalOk(g, f) && quantOk(g, m, f.tail, f.fins));
    if (fitsAny(fathers)) continue;
    if (fitsAny(adults.filter(isLost).map((f) => f.genome!))) {
      markLost(c, `#${c.id} 爸爸的來歷查不到`);
      continue;
    }
    // 已經賣掉的店魚當爸爸：尾鰭分數照店魚偏好的或缸裡最好的公魚算
    const anyFatherTail = Math.max(UNKNOWN_FATHER_TAIL, ...grown.map((f) => f.tail));
    const anyFatherFins = Math.max(45 + 2 * FINS_SD, ...grown.map((f) => f.fins ?? 45));
    if (!quantOk(g, m, anyFatherTail, anyFatherFins)) out.push({ id: c.id, reason: `#${c.id} 這條小魚的尾鰭比爸媽能生出來的好太多` });
  }
  return out;
}
