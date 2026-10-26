import { economy } from './economy';
import { type GuppyPhenotype } from './genetics';
import { FIN_NAMES } from './orders';
import type { Fish, TankState } from './state';

/**
 * 長得像誰（polish-to-9.md G2）：自己繁殖的第一窩孔雀魚出生滿 12 天，早上報告出一張比較卡，
 * 爸爸、媽媽、小魚並排，標出小魚的特徵（顏色、鰭型、尾型）是跟誰的；爸媽身上都看不到的叫「隔代冒出來」。
 * 自己繁殖的魚第一次賣掉或交單的慶祝在 economy.ts（noteBredSale）。
 */

export type TraitFrom = 'mother' | 'father' | 'both' | 'hidden';

export interface LookTrait {
  key: string;
  name: string;
  from: TraitFrom;
}

export interface LookalikeCard {
  childId: number;
  motherId: number;
  /** 店裡買來就懷孕的母魚沒有爸爸的魚，只有基因。 */
  fatherId?: number;
  mother: GuppyPhenotype;
  father: GuppyPhenotype;
  /** 小魚長大後會變成的樣子（基因決定；出卡時才出生 12 天，缸裡還沒轉色）。 */
  child: GuppyPhenotype;
  /** 小魚身上的每個特徵跟誰的。 */
  traits: LookTrait[];
  /** 整體比較像誰（特徵數多的那邊；一樣多是 both）。 */
  looksLike: 'mother' | 'father' | 'both';
}

const COLORS: Array<[keyof GuppyPhenotype, string]> = [
  ['albino', '白子'],
  ['gold', '黃金'],
  ['tuxedo', '禮服'],
  ['red', '紅'],
  ['snake', '蛇王'],
  ['grass', '藍草尾'],
];
const TAILS = { halfmoon: '大三角', delta: '扇尾', round: '圓尾' } as const;

/** 看得出來的特徵：顏色、鰭型、尾型（沒有任何顏色基因的是「原生色」）。 */
export function guppyTraits(p: GuppyPhenotype): Array<{ key: string; name: string }> {
  const out: Array<{ key: string; name: string }> = COLORS.filter(([k]) => p[k]).map(([k, name]) => ({ key: k, name }));
  if (out.length === 0) out.push({ key: 'wild', name: '原生色' });
  for (const fin of ['swallow', 'ribbon', 'dumbo', 'bigC'] as const) if (p[fin]) out.push({ key: fin, name: FIN_NAMES[fin] });
  if ((p.sword ?? 0) > 0) out.push({ key: 'sword', name: FIN_NAMES.sword });
  const tail = p.tailShape ?? 'delta';
  out.push({ key: `tail:${tail}`, name: TAILS[tail] });
  return out;
}

/** 小魚的每個特徵跟誰的，整體像誰。 */
export function compareLooks(child: GuppyPhenotype, mother: GuppyPhenotype, father: GuppyPhenotype): Pick<LookalikeCard, 'traits' | 'looksLike'> {
  const has = (p: GuppyPhenotype) => new Set(guppyTraits(p).map((t) => t.key));
  const m = has(mother);
  const f = has(father);
  const traits = guppyTraits(child).map((t): LookTrait => ({ ...t, from: m.has(t.key) && f.has(t.key) ? 'both' : m.has(t.key) ? 'mother' : f.has(t.key) ? 'father' : 'hidden' }));
  const mom = traits.filter((t) => t.from === 'mother').length;
  const dad = traits.filter((t) => t.from === 'father').length;
  return { traits, looksLike: mom > dad ? 'mother' : dad > mom ? 'father' : 'both' };
}

/**
 * 小魚出生滿幾天出比較卡（polish-to-9.md G2「約出生後第 10～14 天」）。
 * 要等到真的轉色（約 2.2 cm、出生一個月）的話，中魚單常在 2 cm 就把整窩收走，玩家一張卡都看不到。
 */
export const LOOKALIKE_DAYS = 12;

/** 比較卡出來前最多記幾窩（較舊的那窩通常已經賣光了）。 */
const BROOD_LOG = 6;

type Brood = NonNullable<ReturnType<typeof economy>['broodLog']>[number];

/** 生小魚時呼叫：還沒出過比較卡就把這窩爸媽的基因記下來（爸媽之後賣掉、死掉也比得了）。 */
export function noteBrood(state: TankState, mother: Fish, sire: NonNullable<Fish['sire']>): void {
  const e = economy(state);
  if (e.lookalikeShown || !mother.genome) return;
  e.broodLog = [...(e.broodLog ?? []), { motherId: mother.id, fatherId: sire.id, hours: state.hours, mother: mother.genome, father: sire.genome }].slice(-BROOD_LOG);
}

export const broodOf = (f: Fish, log: Brood[]) => (f.alive && f.genome ? log.find((b) => f.motherId === b.motherId && f.bornHours === b.hours) : undefined);

const FROM: Record<TraitFrom, string> = { mother: '像媽媽', father: '像爸爸', both: '爸媽都有', hidden: '隔代冒出來' };

/** 早上報告那一行，例如「小魚看得出像誰了！長大後比較像爸爸：禮服（像爸爸）、大三角（像媽媽）」。 */
export function lookalikeLine(card: LookalikeCard): string {
  const who = card.looksLike === 'mother' ? '比較像媽媽' : card.looksLike === 'father' ? '比較像爸爸' : '爸媽各像一點';
  return `小魚看得出像誰了！長大後${who}：${card.traits.map((t) => `${t.name}（${FROM[t.from]}）`).join('、')}`;
}
