import { growthStage, sexVisible } from './growth';
import { moveFish } from './household';
import { crowdingRatio } from './processes/fauna';
import { moveToQuarantine } from './quarantine';
import { FISH_SPECIES } from './species';
import { isJuvenile, type Fish, type TankState } from './state';

/**
 * 分缸提示（design/growth.md §4.1）：小魚長大後缸會越來越擠，成魚會吃小魚，轉色後公母混著會太早亂配。
 * 遊戲主動提醒，並建議怎麼分；玩家按一下就照建議把魚撈到別缸。
 */

/** 依大小分：把小魚移走；公母分開：把年輕公魚移走；分一半：太擠時移走一半。 */
export type SplitPlan = 'by_size' | 'by_sex' | 'half';

export interface SplitAdvice {
  reason: 'crowded' | 'fry_with_adults' | 'sexes_mixed';
  tone: 'warn' | 'bad';
  text: string;
  plan: SplitPlan;
}

export const SPLIT_PLAN_LABELS: Record<SplitPlan, string> = {
  by_size: '依大小分：小魚移過去',
  by_sex: '公母分開：年輕公魚移過去',
  half: '分一半過去',
};

const young = (f: Fish) => {
  const st = growthStage(f);
  return st === 'fry' || st === 'juvenile';
};

/** 會被缸裡成魚吃掉的小魚（嘴巴塞得下）。 */
function preyAtRisk(all: Fish[]): Fish[] {
  // 育幼盒裡的魚隔著網子，不算
  const living = all.filter((f) => !f.nursery);
  const mouths = living.filter((f) => !isJuvenile(f) && FISH_SPECIES[f.species].mouthRatio > 0).map((f) => f.lengthCm * FISH_SPECIES[f.species].mouthRatio);
  const biggest = Math.max(0, ...mouths);
  // 媽媽還帶著的仔魚有人保護，先不用撈（離巢後再分）
  return living.filter((f) => isJuvenile(f) && f.lengthCm < biggest && f.guardian === undefined);
}

/** 轉色、亞成期看得出公母的自家小魚，公母都有。 */
function youngPairs(living: Fish[]): { males: Fish[]; females: Fish[] } {
  const growing = living.filter((f) => f.species === 'guppy' && sexVisible(f) && ['coloring', 'subadult'].includes(growthStage(f)));
  return { males: growing.filter((f) => f.sex === 'male'), females: living.filter((f) => f.species === 'guppy' && f.sex === 'female' && sexVisible(f)) };
}

export function splitAdvice(state: TankState): SplitAdvice[] {
  const living = state.fish.filter((f) => f.alive);
  const out: SplitAdvice[] = [];
  const crowd = crowdingRatio(state);
  const hasYoung = living.some(young);
  if (crowd > 1) out.push({ reason: 'crowded', tone: 'bad', text: `缸裡太擠了（${living.length} 條），缺氧、氨升高，最弱的會先死：分缸、賣掉一些或換大缸`, plan: hasYoung ? 'by_size' : 'half' });
  else if (crowd > 0.8) out.push({ reason: 'crowded', tone: 'warn', text: `魚快養滿了（${living.length} 條），該分缸或賣掉一些了`, plan: hasYoung ? 'by_size' : 'half' });
  const prey = preyAtRisk(living);
  if (prey.length > 0) out.push({ reason: 'fry_with_adults', tone: prey.length >= 5 ? 'bad' : 'warn', text: `成魚會吃小魚：把 ${prey.length} 條仔魚撈到${state.nurseryBox ? '育幼盒' : state.quarantine ? '檢疫盒' : '育幼盒（商店 150 元）'}或別缸`, plan: 'by_size' });
  const pairs = youngPairs(living);
  if (pairs.males.length > 0 && pairs.females.length > 0 && pairs.males.some((m) => (m.generation ?? 0) > 0))
    out.push({ reason: 'sexes_mixed', tone: 'warn', text: `小魚分得出公母了（${pairs.males.length} 條小公魚）：公母分開，免得太早亂配`, plan: 'by_sex' });
  return out;
}

/** 照這個分法要移走哪些魚。 */
export function splitGroup(state: TankState, plan: SplitPlan): Fish[] {
  const living = state.fish.filter((f) => f.alive && f.listing === undefined && !f.nursery);
  if (plan === 'by_size') {
    // 先移會被吃的那些；沒有掠食者時就移所有還沒長大的
    const prey = preyAtRisk(living);
    return prey.length > 0 ? prey : living.filter((f) => isJuvenile(f));
  }
  if (plan === 'by_sex') return youngPairs(living).males;
  // 分一半：每個魚種各移一半，留下的群體還是完整的
  const out: Fish[] = [];
  const bySpecies = new Map<string, Fish[]>();
  for (const f of living) bySpecies.set(f.species, [...(bySpecies.get(f.species) ?? []), f]);
  for (const list of bySpecies.values()) out.push(...list.filter((_, i) => i % 2 === 1));
  return out;
}

/** 一鍵分缸：把這組魚撈到另一缸。回傳移了幾條。 */
export function splitTank(from: TankState, to: TankState, plan: SplitPlan): number {
  if (from === to) return 0;
  let moved = 0;
  for (const f of splitGroup(from, plan)) if (moveFish(from, to, f.id)) moved++;
  return moved;
}

/**
 * 只有一缸時的仔魚救援（#144）：把會被吃的仔魚撈進檢疫盒，盒子當育幼盒用，長到成魚吞不下再放回主缸。
 * 沒有檢疫盒回 0；回傳撈了幾條。
 */
export function rescueFryToBox(state: TankState): number {
  if (!state.quarantine) return 0;
  let moved = 0;
  for (const f of splitGroup(state, 'by_size')) if (isJuvenile(f) && moveToQuarantine(state, f.id)) moved++;
  return moved;
}
