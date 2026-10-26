import { economy } from './economy';
import { growthStage, sexVisible } from './growth';
import { moveFish, newTankCost } from './household';
import { crowdingRatio } from './processes/fauna';
import { BELLY_SHOWS, NURSERY_FRY_CAPACITY, nurseryFish, usesNursery } from './nursery';
import { isCycled } from './processes/nitrogen';
import { moveToQuarantine } from './quarantine';
import { needsSetup } from './setup';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { BACTERIA_SEED, isJuvenile, type Fish, type TankState } from './state';

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

/** 擁擠度到這裡就提醒「快養滿了」（crowdingRatio，每公升幾公分魚）。 */
export const CROWD_WARN = 0.8;

export function splitAdvice(state: TankState): SplitAdvice[] {
  const living = state.fish.filter((f) => f.alive);
  const out: SplitAdvice[] = [];
  const crowd = crowdingRatio(state);
  const hasYoung = living.some(young);
  if (crowd > 1) out.push({ reason: 'crowded', tone: 'bad', text: `缸裡太擠了（${living.length} 條），缺氧、氨升高，最弱的會先死：分缸、賣掉一些或換大缸`, plan: hasYoung ? 'by_size' : 'half' });
  else if (crowd > CROWD_WARN) out.push({ reason: 'crowded', tone: 'warn', text: `魚快養滿了（${living.length} 條），該分缸或賣掉一些了`, plan: hasYoung ? 'by_size' : 'half' });
  const prey = preyAtRisk(living);
  if (prey.length > 0) out.push({ reason: 'fry_with_adults', tone: prey.length >= 5 ? 'bad' : 'warn', text: `成魚會吃小魚：把 ${prey.length} 條仔魚撈到${state.nurseryBox ? '育幼盒' : state.quarantine ? '檢疫盒' : '育幼盒（商店 150 元）'}或別缸`, plan: 'by_size' });
  const pairs = youngPairs(living);
  if (pairs.males.length > 0 && pairs.females.length > 0 && pairs.males.some((m) => (m.generation ?? 0) > 0))
    out.push({ reason: 'sexes_mixed', tone: 'warn', text: `小魚分得出公母了（${pairs.males.length} 條小公魚）：公母分開，免得太早亂配`, plan: 'by_sex' });
  return out;
}

/** 照這個分法要移走哪些魚。 */
export function splitGroup(state: TankState, plan: SplitPlan): Fish[] {
  // 選好的那對種魚不拆開（年輕的種公也算「年輕公魚」，照公母分開會被撈走，之後一直配不到）；C12 輪流的另一尾種公也留著
  const choices = economy(state).choices;
  const pair: readonly number[] = [...(choices?.pair ?? []), ...(choices?.sires ?? [])];
  const living = state.fish.filter((f) => f.alive && f.listing === undefined && !f.nursery && !pair.includes(f.id));
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

/**
 * 育幼盒幫不上忙了：盒子滿了（再生的只能在外面被吃），或盒裡還有小魚、又有母魚肚子大了
 * （母魚放進去會吃牠們，下一窩只能生在外面；g37 #428）。
 */
export function boxBlocked(state: TankState): boolean {
  if (!state.nurseryBox) return false;
  const inside = nurseryFish(state).filter(isJuvenile);
  if (inside.length >= NURSERY_FRY_CAPACITY) return true;
  return inside.length > 0 && state.fish.some((f) => f.alive && !f.nursery && f.sex === 'female' && !isJuvenile(f) && usesNursery(f.species) && f.pregnancy >= BELLY_SHOWS);
}

/** 這缸的小魚需要搬家：缸裡有成魚吞得下的小魚（掛在市場上的不算，搬不走），或育幼盒幫不上忙了。 */
export function fryNeedHome(state: TankState): boolean {
  const living = state.fish.filter((f) => f.alive);
  if (preyAtRisk(living).some((f) => f.listing === undefined)) return true;
  return boxBlocked(state);
}

/** 收得了小魚的缸：開好缸、硝化菌長好，而且沒有吞得下小魚的成魚。沒有回傳 null。 */
export function fryHome(tanks: TankState[], from: number): number | null {
  const at = tanks.findIndex(
    (t, i) => i !== from && !needsSetup(t) && isCycled(t) && !t.fish.some((f) => f.alive && !isJuvenile(f) && FISH_SPECIES[f.species].mouthRatio > 0),
  );
  return at >= 0 ? at : null;
}

/**
 * 一鍵把小魚搬進新缸（g36 #425：買了第二缸卻沒人叫你搬，前 15 天被吃 17 尾）：主缸外面和育幼盒裡還沒長大的魚
 * 都慢慢對水搬過去，育幼盒空出來給下一窩。掛在市場上的不搬。沒有能收的缸或沒有小魚回傳 null。
 */
export function moveFryHome(tanks: TankState[], from: number): { to: number; count: number; shrimp: number } | null {
  const to = fryHome(tanks, from);
  if (to === null) return null;
  const src = tanks[from];
  const fry = src.fish.filter((f) => f.alive && isJuvenile(f) && f.listing === undefined && f.guardian === undefined);
  let count = 0;
  let shrimp = 0;
  for (const f of fry)
    if (moveFish(src, tanks[to], f.id, true)) {
      count++;
      if (isShrimpSpecies(f.species)) shrimp++;
    }
  return count > 0 ? { to, count, shrimp } : null;
}

/** 新缸開始養水了（分過舊缸濾材或倒過硝化菌液，菌比空氣帶來的多很多）。 */
const CYCLING_STARTED = BACTERIA_SEED * 5;

/**
 * 小魚要搬家、可是還沒有能收的缸時，下一步是什麼（g37 #428：第二缸買了 5 天都空著，沒人叫你養水）：
 * - cycle：有開好、沒魚、還沒養好水的缸，先養水（started：已經分過濾材或倒過菌液，等就好）
 * - buy：只有這一缸、育幼盒幫不上忙：買第二缸（afford：錢夠不夠）
 * 有能收的缸（直接搬）、或不用搬，回傳 null。
 */
export function fryPrep(tanks: TankState[], from: number): { kind: 'cycle'; tank: number; started: boolean } | { kind: 'buy'; afford: boolean } | null {
  const t = tanks[from];
  if (!t || !fryNeedHome(t) || fryHome(tanks, from) !== null) return null;
  const fresh = tanks.findIndex((x, i) => i !== from && !needsSetup(x) && !!x.equipment.filter && !isCycled(x) && !x.fish.some((f) => f.alive));
  if (fresh >= 0) return { kind: 'cycle', tank: fresh, started: Math.min(tanks[fresh].bacteria.aob, tanks[fresh].bacteria.nob) >= CYCLING_STARTED };
  if (tanks.length !== 1 || !boxBlocked(t)) return null;
  return { kind: 'buy', afford: economy(t).coins >= newTankCost(tanks, 'nano20') };
}
