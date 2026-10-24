import { slotPrice, stabilityPct, tankSetPrice, TANKS, type TankSizeId, type TankState } from '../sim';
import { choiceState, isDreamLook } from '../sim/choices';
import { midgamePlayer, type MidgameNight } from './midgame-player';

/** 固定品系長期劇本（strain-fixing.md §5、§7、§8，#344、#351）一個種子跑 360 天記下來的東西。 */
export interface StrainRun {
  nights: MidgameNight[];
  /** 品系每窩：第幾代、第幾天生、n 尾裡 k 尾夢想魚。 */
  broods: Array<{ gen: number; day: number; n: number; k: number }>;
  /** C18 取名、品系完成是第幾天（沒有是 Infinity）。 */
  namedDay: number;
  doneDay: number;
  /** 每一代夢想魚尾鰭分數的平均（看得到的那幾尾，活著時記的）。 */
  tails: Map<number, number>;
  /** 留種那對母魚懷著這對的小孩的那幾天。 */
  pregnantDays: Set<number>;
  /** 每天買缸花的錢（缸數變多的那天）。 */
  tankSpend: Map<number, number>;
}

const dayOf = (hours: number) => Math.floor(hours / 24) + 1;

export function strainRun(seed: number, days = 360): StrainRun {
  const tails = new Map<number, Map<number, number>>();
  const pregnantDays = new Set<number>();
  const tankSpend = new Map<number, number>();
  let last: TankState[] = [];
  let tankCount = 1;
  const nights = midgamePlayer(seed, days, {
    onDay: (tanks, day) => {
      last = tanks;
      // 買了缸：照買的時候的價錢記（套缸 + 第幾缸的位子）
      for (let n = tankCount; n < tanks.length; n++) {
        const size = (Object.keys(TANKS) as TankSizeId[]).find((k) => TANKS[k].id === tanks[n].equipment.tank.id);
        if (size) tankSpend.set(day, (tankSpend.get(day) ?? 0) + tankSetPrice(size) + slotPrice(n));
      }
      tankCount = tanks.length;
      const s = choiceState(tanks);
      const fish = tanks.flatMap((t) => t.fish);
      const mom = s.pair && fish.find((f) => f.id === s.pair![0] && f.alive);
      if (mom && mom.pregnancy > 0 && mom.sire?.id === s.pair![1]) pregnantDays.add(day);
      for (const b of s.line?.broods ?? []) {
        const m = (tails.get(b.gen) ?? new Map<number, number>());
        tails.set(b.gen, m);
        for (const f of fish) if (f.alive && f.genome && f.motherId === b.momId && f.bornHours !== undefined && Math.abs(f.bornHours - b.born) < 24 && isDreamLook(f.genome)) m.set(f.id, f.genome.tail);
      }
    },
  });
  const s = choiceState(last);
  const avg = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0) / m.size;
  return {
    nights,
    broods: (s.line?.broods ?? []).map((b) => ({ gen: b.gen, day: dayOf(b.born), n: b.n, k: b.k })),
    namedDay: s.lineNamed ? dayOf(s.lineNamed.hours) : Infinity,
    doneDay: s.lineNamed?.done ? dayOf(s.lineNamed.done.hours) : Infinity,
    tails: new Map([...tails].filter(([, m]) => m.size > 0).map(([g, m]) => [g, avg(m)])),
    pregnantDays,
    tankSpend,
  };
}

/** 一代所有窩加起來的穩定度 %。 */
export function genStability(run: StrainRun, gen: number): number {
  const bs = run.broods.filter((b) => b.gen === gen);
  return stabilityPct({ n: bs.reduce((a, b) => a + b.n, 0), k: bs.reduce((a, b) => a + b.k, 0) });
}

/** 驗收要看的數字（strain-fixing.md §3、§5、§7）。 */
export interface StrainFacts {
  /** 開獎那窩有幾尾夢想魚。 */
  revealDream: number;
  gen1: number;
  gen2: number;
  /** 第 80～300 天擠缸死魚。 */
  crowdDeaths: number;
  /** 整段餓死的種魚（midgame.md §7.9 要是 0）。 */
  breederStarved: number;
  /** 同一天出了早上的卡又出交貨卡的那幾天。 */
  doubleCards: number[];
  /** 第 80～200 天節奏空太久的段落（懷孕期間 > 7 天、其他 > 6 天）。 */
  gaps: string[];
  coins120: number;
  coins260: number;
  /** 第 121～260 天買缸花的錢（strain-fixing.md §9：缸算半價的資產）。 */
  tankSpend: number;
  /** 第 120～260 天最少的金幣。 */
  minCoins: number;
  /** 第一代夢想魚尾鰭平均減最新一代的。 */
  tailDrop: number;
  log: string;
}

export function strainFacts(run: StrainRun): StrainFacts {
  const { nights } = run;
  const coins = (d: number) => nights.find((n) => n.day === d)?.coins ?? 0;
  const points = nights.filter((n) => n.choice || n.orderChoice || /\b(milestone|line|belly|birth|reveal)\b/.test(n.line)).map((n) => n.day);
  const gaps: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (b < 80 || a > 200) continue;
    if (b - a > (run.pregnantDays.has(a) && run.pregnantDays.has(b) ? 7 : 6)) gaps.push(`${a}→${b}`);
  }
  const gens = [...run.tails.keys()].sort((a, b) => a - b);
  const late = nights.filter((n) => n.day >= 120 && n.day <= 260);
  return {
    revealDream: run.broods[0]?.k ?? 0,
    gen1: genStability(run, 1),
    gen2: genStability(run, 2),
    crowdDeaths: nights.filter((n) => n.day >= 80).reduce((a, n) => a + n.crowdDeaths, 0),
    breederStarved: nights.reduce((a, n) => a + n.breederStarved, 0),
    doubleCards: nights.filter((n) => n.choice && n.orderChoice).map((n) => n.day),
    gaps,
    coins120: coins(120),
    coins260: coins(260),
    tankSpend: [...run.tankSpend].filter(([d]) => d > 120 && d <= 260).reduce((a, [, c]) => a + c, 0),
    minCoins: Math.min(...late.map((n) => n.coins)),
    tailDrop: gens.length > 1 ? Math.round(run.tails.get(gens[0])! - run.tails.get(gens[gens.length - 1])!) : 0,
    log: `broods ${run.broods.map((b) => `${b.gen}:${b.day}:${b.k}/${b.n}`).join(' ')} named=${run.namedDay} done=${run.doneDay} tails ${gens.map((g) => `${g}:${Math.round(run.tails.get(g)!)}`).join(' ')} | ${nights.filter((n) => n.day >= 80 && (n.choice || n.orderChoice)).map((n) => `${n.day}${n.choice ?? ''}${n.orderChoice ? `{${n.orderChoice}}` : ''}`).join(' ')}`,
  };
}
