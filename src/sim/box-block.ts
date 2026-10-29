import { economy } from './economy';
import { moveFish, tankLabel } from './household';
import { BOX_DUE, daysToBirth, moveToNursery } from './nursery';
import { isCycled } from './processes/nitrogen';
import { DENSE_COVER, plantCover } from './processes/population';
import { needsSetup } from './setup';
import { FISH_SPECIES } from './species';
import { fryHome } from './split';
import { isJuvenile, type Fish, type TankState } from './state';

/**
 * C15 選了「等快生再放育幼盒」，盒子卻被小魚佔著（g41 #457）：夢想窩的媽媽快生了放不進去，整窩生在外面被吃光。
 * 早上報告和任務卡事先說，給一鍵把小魚搬走的做法。放在這裡（不在 choices.ts），任務卡才不用載入整個選擇卡。
 */

/** 開獎前幾天早上報告第一行倒數（polish-to-9.md §12.1）。 */
export const COUNTDOWN_DAYS = 3;
/** 開獎前幾天（含）開始說育幼盒被小魚佔著：比倒數早一天，玩家才來得及搬。 */
export const BOX_BLOCK_DAYS = COUNTDOWN_DAYS + 1;

const mouthCm = (f: Fish) => f.lengthCm * FISH_SPECIES[f.species].mouthRatio;

/** 照 C15 該放進育幼盒的那尾母魚：開獎前是夢想窩的媽媽，開獎後是懷著留種那對小孩的母魚（#359）。已經在盒裡的不算。 */
export function boxMom(tanks: TankState[]): { fish: Fish; tank: number } | null {
  const s = economy(tanks[0]).choices;
  const r = s?.reveal;
  if (!r?.box) return null;
  const momId = !r.done ? r.momId : s!.pair?.[0];
  for (let tank = 0; tank < tanks.length; tank++) {
    const fish = tanks[tank].fish.find((f) => f.id === momId && f.alive);
    if (!fish) continue;
    if (fish.nursery || (r.done && fish.sire?.id !== s!.pair![1])) return null;
    return { fish, tank };
  }
  return null;
}

/** 盒裡母魚吞得下的小魚：放回主缸也會被吃，盒子就被佔著。 */
const boxPrey = (t: TankState, mom: Fish): Fish[] => t.fish.filter((f) => f.alive && f.nursery && isJuvenile(f) && f.lengthCm <= mouthCm(mom));

/**
 * 小魚搬去哪裡，才能把育幼盒空出來：沒有大魚的缸最好（fryHome）；
 * 沒有的話，挑別缸裡水草夠密（≥ DENSE_COVER）、最密的那缸，小魚大多躲得住。都沒有回傳 null。
 */
function boxFryHome(tanks: TankState[], from: number): number | null {
  const safe = fryHome(tanks, from);
  if (safe !== null) return safe;
  const dense = tanks
    .map((t, i) => ({ i, cover: plantCover(t), ok: i !== from && !needsSetup(t) && isCycled(t) }))
    .filter((x) => x.ok && x.cover >= DENSE_COVER)
    .sort((a, b) => b.cover - a.cover)[0];
  return dense?.i ?? null;
}

export interface BoxBlock {
  tank: number;
  momId: number;
  /** 盒裡佔著的小魚幾尾。 */
  fry: number;
  /** 小魚可以搬去哪一缸；沒有是 null。 */
  to: number | null;
  /** 還沒開獎（夢想窩那一胎）。 */
  dream: boolean;
}

/** 選了育幼盒、母魚 BOX_BLOCK_DAYS 天內要生，盒子卻被她吞得下的小魚佔著。沒有回傳 null。 */
export function boxBlock(tanks: TankState[]): BoxBlock | null {
  const m = boxMom(tanks);
  if (!m) return null;
  const t = tanks[m.tank];
  const left = daysToBirth(t, m.fish);
  if (!t.nurseryBox || left === null || left > BOX_BLOCK_DAYS) return null;
  const fry = boxPrey(t, m.fish).length;
  return fry > 0 ? { tank: m.tank, momId: m.fish.id, fry, to: boxFryHome(tanks, m.tank), dream: !economy(tanks[0]).choices!.reveal!.done } : null;
}

/** 早上報告、任務卡那一句：搬得走就說搬去哪，搬不走說那缸水草多密。 */
export function boxBlockText(tanks: TankState[], b: BoxBlock, name: string): string {
  const head = `${name}快生了，育幼盒還被 ${b.fry} 尾小魚佔著`;
  if (b.to !== null) return `${head}：小魚搬去${tankLabel(tanks, b.to)}，盒子留給她`;
  const pct = Math.round(plantCover(tanks[b.tank]) * 100);
  const where = tankLabel(tanks, b.tank);
  return pct / 100 < DENSE_COVER ? `${head}，別缸也收不了小魚。${where}水草才 ${pct}%，先種密一點，這窩比較躲得住` : `${head}，別缸也收不了小魚。${where}水草 ${pct}%，這窩大多躲得住`;
}

/**
 * 把佔著育幼盒的小魚慢慢對水搬去別缸；母魚已經快生（≥ BOX_DUE）就接著放進盒子，還沒的話快生時照 C15 自己放。
 * 搬不了回傳 null。
 */
export function clearBoxForMom(tanks: TankState[]): { to: number; count: number; momId: number; placed: boolean } | null {
  const b = boxBlock(tanks);
  if (!b || b.to === null) return null;
  const t = tanks[b.tank];
  const mom = t.fish.find((f) => f.id === b.momId)!;
  let count = 0;
  for (const f of boxPrey(t, mom)) if (moveFish(t, tanks[b.to], f.id, true)) count++;
  const placed = mom.pregnancy >= BOX_DUE && moveToNursery(t, mom.id);
  return { to: b.to, count, momId: mom.id, placed };
}
