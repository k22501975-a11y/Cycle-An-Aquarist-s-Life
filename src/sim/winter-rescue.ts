import { installHeater } from './actions';
import { economy, fishBuybackPrice, householdTanks, price, spend } from './economy';
import { moveFish, tankLabel } from './household';
import { moveToNursery, nurseryFish, NURSERY_FRY_CAPACITY, usesNursery } from './nursery';
import { hasVisible } from './processes/disease';
import { ICH_MED_WORKING } from './next-step';
import { crowdingRatio } from './processes/fauna';
import { sizeRatio } from './processes/population';
import { emergencySale } from './raise-cash';
import { HEATERS, type HeaterSpec } from './equipment';
import { heaterLiftC } from './processes/thermal';
import { coldestRoomC } from './season';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { isJuvenile, type Fish, type TankState } from './state';

/** 臨時保溫撐幾小時、一按水溫回升幾度（mvp.md §4.4.6）。 */
export const INSULATE_HOURS = 12;
export const INSULATE_BUMP_C = 1;

/** 缸裡最怕冷那種魚的適溫下限（沒魚就照孔雀魚）。 */
export function coldLimitC(t: TankState): number {
  const living = t.fish.filter((f) => f.alive);
  return living.length > 0 ? Math.max(...living.map((f) => FISH_SPECIES[f.species].temp.min)) : FISH_SPECIES.guppy.temp.min;
}

const workingHeater = (t: TankState) => !!t.equipment.heater && !t.equipment.heater.broken;
const today = (t: TankState) => Math.floor(t.hours / 24);

/** 這缸冷到要救急：水溫低於魚的適溫、也沒有能用的加熱棒（#397）。 */
export function coldWithoutHeater(t: TankState): boolean {
  return t.water.tempC < coldLimitC(t) - 0.5 && !workingHeater(t);
}

/** 缸裡還有活的魚蝦（空缸不用保溫，#400）。 */
const hasLiving = (t: TankState) => t.fish.some((f) => f.alive);

/** 臨時保溫還在撐。 */
export function insulated(t: TankState): boolean {
  return (t.insulatedUntil ?? -1) > t.hours;
}

/** 為什麼現在不能保溫；可以回 null。 */
export function insulateRefusal(t: TankState): string | null {
  if (insulated(t)) return '毛巾和溫水瓶還在保溫';
  if (t.insulatedDay === today(t)) return '今天已經保溫過了，明天再換一次溫水';
  return null;
}

/** 冷到要救急、而且今天還沒保溫：任務卡和早上報告第一行叫玩家先保溫。 */
export function needsInsulation(t: TankState): boolean {
  return hasLiving(t) && coldWithoutHeater(t) && !insulateRefusal(t);
}

/** 臨時保溫：缸外包毛巾、寶特瓶裝溫水泡進缸裡。INSULATE_HOURS 小時內散熱減半、水溫回升 INSULATE_BUMP_C 度；每天一次，不花錢。 */
export function insulateTank(t: TankState): boolean {
  if (insulateRefusal(t)) return false;
  t.insulatedUntil = t.hours + INSULATE_HOURS;
  t.insulatedDay = today(t);
  t.water.tempC += INSULATE_BUMP_C;
  return true;
}

/** 跟阿德賒的加熱棒：同款（缸的大小撐得住），沒有就給 25W。 */
export function creditHeater(t: TankState) {
  return t.equipment.heater?.spec ?? HEATERS.h25;
}

export function creditCost(t: TankState): number {
  return price(`heater:${creditHeater(t).id}`);
}

/** 今天賣魚就湊得到同款加熱棒的話，要賣幾尾（湊不到或錢已經夠回 0；設備面板改寫「賣 N 尾給阿德就夠換」）。 */
export function creditSale(t: TankState): number {
  const short = creditCost(t) - economy(t).coins;
  if (short <= 0) return 0;
  const sale = emergencySale(householdTanks(t), short);
  return sale.coins >= short ? sale.count : 0;
}

/** 只看這一缸能不能賒（mvp.md §4.4.6：錢不夠、今天賣魚也湊不到、水溫已經低於適溫，同時間只能賒一支）。 */
function creditRefusalHere(t: TankState): string | null {
  const owed = economy(t).heaterLoan ?? 0;
  if (owed > 0) return `還欠阿德 ${owed} 元，還清之前不能再賒`;
  if (workingHeater(t)) return '這缸的加熱棒是好的';
  const short = creditCost(t) - economy(t).coins;
  if (short <= 0) return '錢夠了，直接買一支就好';
  // §4.4.6：賣魚還湊得到就先賣，設備面板的按鈕跟任務卡同一個條件（#398 架構）
  if (creditSale(t)) return '今天賣幾尾魚給水族店就湊得到，先賣魚';
  // 水溫已經低於適溫，或室溫低於適溫、水溫正在往下掉（mvp.md §4.4.6 收緊）
  const limit = coldLimitC(t);
  const falling = t.environment.roomTempC < limit && t.water.tempC < t.water.tempAvgC;
  if (t.water.tempC >= limit && !falling) return '水溫還撐得住，先想辦法湊錢';
  return null;
}

/** 這個冬天沒加熱棒會冷死幾尾：室溫最低點（今天和地區最冷月取低的）撐不住的活魚蝦。 */
function coldDeaths(t: TankState): number {
  const low = Math.min(t.environment.roomTempC - (t.environment.roomSwingC ?? 1.5), coldestRoomC(t.environment.region));
  return t.fish.filter((f) => f.alive && low < FISH_SPECIES[f.species].tempLethal.min + 1).length;
}

/**
 * 只能賒一支時給哪一缸（#407，g32：賒給正在看的 20L 小缸，90L 大缸 38 尾冷死）：能賒的缸裡沒加熱棒會冷死最多尾的那缸，
 * 一樣多給大的缸（小缸的魚再搬過去）。跟玩家正在看哪一缸無關；有活魚的缸都不能賒回 null。
 */
export function creditTarget(tanks: TankState[]): TankState | null {
  const ok = tanks.filter((t) => hasLiving(t) && !creditRefusalHere(t));
  return ok.sort((a, b) => coldDeaths(b) - coldDeaths(a) || b.equipment.tank.volumeL - a.equipment.tank.volumeL)[0] ?? null;
}

/** 為什麼不能跟阿德賒加熱棒給這缸；可以回 null。別缸更需要的話叫你賒給那缸（#407）。 */
export function heaterCreditRefusal(t: TankState): string | null {
  const here = creditRefusalHere(t);
  if (here) return here;
  const tanks = householdTanks(t);
  const best = creditTarget(tanks);
  if (best && best !== t && coldDeaths(best) > coldDeaths(t)) return `阿德只能先賒一支，先給${tankLabel(tanks, tanks.indexOf(best))}（那缸的魚比較多），這缸的魚再搬過去`;
  return null;
}

/** 跟阿德賒一支加熱棒裝上去，回傳欠多少（不能賒回 0）。之後每筆收入扣一半來還（noteEarned）。 */
export function takeHeaterCredit(t: TankState): number {
  if (heaterCreditRefusal(t)) return 0;
  const cost = creditCost(t);
  installHeater(t, creditHeater(t));
  economy(t).heaterLoan = cost;
  return cost;
}

/**
 * 錢不夠換同款加熱棒時，買得起、又撐得住的最便宜那支（#404，g31：手上 227～312 元買得起 25W，任務卡卻只叫你湊同款 350 元）。
 * 撐得住：室溫最低點（今天和這地區最冷那個月取低的，才撐得過整個冬天）加上這支一直開著能升的溫度，比缸裡最怕冷那種魚的致死低溫高 1°C 以上。comfy 是連適溫下限都撐得到。
 * 這缸不冷、加熱棒是好的、錢夠換同款、或都撐不住回 null（mvp.md §4.4.6 救急第 0 步）。
 */
export function cheapHeater(t: TankState): { spec: HeaterSpec; cost: number; comfy: boolean } | null {
  if (!hasLiving(t) || !coldWithoutHeater(t)) return null;
  const coins = economy(t).coins;
  const same = t.equipment.heater?.spec;
  if (same && coins >= price(`heater:${same.id}`)) return null;
  const living = t.fish.filter((f) => f.alive);
  const lethal = Math.max(...living.map((f) => FISH_SPECIES[f.species].tempLethal.min));
  const low = Math.min(t.environment.roomTempC - (t.environment.roomSwingC ?? 1.5), coldestRoomC(t.environment.region));
  const volume = t.equipment.tank.volumeL;
  const fit = Object.values(HEATERS)
    .map((spec) => ({ spec, cost: price(`heater:${spec.id}`), holds: low + heaterLiftC(volume, spec.watts) }))
    .filter((x) => x.cost <= coins && x.holds >= lethal + 1)
    .sort((a, b) => a.cost - b.cost)[0];
  return fit ? { spec: fit.spec, cost: fit.cost, comfy: fit.holds >= coldLimitC(t) } : null;
}

/** 買下 cheapHeater 那支裝上去；回傳裝了哪支（買不了回 null）。 */
export function buyCheapHeater(t: TankState): HeaterSpec | null {
  const pick = cheapHeater(t);
  if (!pick || !spend(t, pick.cost)) return null;
  installHeater(t, pick.spec);
  return pick.spec;
}

/** 冬天搬魚救急時，暖缸最多塞到多擠（每公升 1 cm；擠幾天比冷死好，之後再分缸或賣）。 */
export const WARM_MOVE_CROWD = 1;

/** 看得到病的魚（白點或其他病）：搬過去會傳染暖缸，先留在原缸。 */
const visiblySick = (f: Fish) => f.ich.stage === 'visible' || hasVisible(f);

/** 這缸有魚看得到病：搬過去會被傳染，不當暖缸（mvp.md §4.4.6）。 */
const hasSick = (t: TankState) => t.fish.some((f) => f.alive && visiblySick(f));

/** 水裡的藥還在作用（白點藥、抗生素、驅蟲藥）：魚照搬（一起泡藥沒關係），蝦不搬（會中毒，#404）。 */
function medicated(t: TankState): boolean {
  const w = t.water;
  return Math.max(w.medication, w.antibiotic ?? 0, w.dewormer ?? 0) >= ICH_MED_WORKING;
}

/** 加熱棒是好的、水溫在這缸魚適溫內的別缸（還沒看生病、滿不滿）。 */
function warmCandidates(tanks: TankState[], from: number): number[] {
  const t = tanks[from];
  const min = coldLimitC(t);
  const max = Math.min(...t.fish.filter((f) => f.alive).map((f) => FISH_SPECIES[f.species].temp.max));
  return tanks.map((_, i) => i).filter((i) => i !== from && workingHeater(tanks[i]) && tanks[i].water.tempC >= min && tanks[i].water.tempC <= max);
}

const warmRoom = (x: TankState) => (WARM_MOVE_CROWD - crowdingRatio(x)) * x.equipment.tank.volumeL;

/** 暖缸的育幼盒還放得下幾尾小魚（沒有盒子、或母魚在盒裡回 0）。 */
function boxRoom(t: TankState): number {
  if (!t.nurseryBox) return 0;
  const inside = nurseryFish(t);
  return inside.some((f) => !isJuvenile(f)) ? 0 : Math.max(0, NURSERY_FRY_CAPACITY - inside.length);
}

/** 這缸大魚的嘴最大吞得下幾公分（沿用 splitMove：育幼盒裡的、幼魚不算）。 */
function mouthCm(t: TankState): number {
  return Math.max(0, ...t.fish.filter((f) => f.alive && !f.nursery && !isJuvenile(f)).map((f) => f.lengthCm * FISH_SPECIES[f.species].mouthRatio));
}

/**
 * 冷缸的魚可以先搬去哪一缸（#400、#401，mvp.md §4.4.6「搬去暖缸」）：
 * 暖缸的加熱棒是好的、水溫在適溫內、沒有魚看得到病；搬過去不超過 WARM_MOVE_CROWD。在下藥的缸只搬魚，蝦留著（shrimp 是留下的蝦數，#404）。
 * 放不下全部就先搬留種的、懷孕的、小魚，再照賣價高的。暖缸有大魚吞得下的小魚先放進那缸的育幼盒（box）；
 * 盒子放不下的照樣搬（exposed，冷缸已經低於適溫，留著一定冷死；企劃 2026-10-25）。
 * 會吞小魚的暖缸排後面，再選空位最多的。看得到病的魚不搬（會傳染），sick 是留在原缸的病魚數。
 * 沒有合格的缸（或這缸不冷、沒魚、全都在生病）回 null。
 */
export function warmMove(tanks: TankState[], from: number): { to: number; fish: Fish[]; box: Fish[]; exposed: number; total: number; sick: number; shrimp: number } | null {
  const t = tanks[from];
  if (!t || !hasLiving(t) || !coldWithoutHeater(t)) return null;
  const living = t.fish.filter((f) => f.alive);
  const healthy = living.filter((f) => !visiblySick(f));
  if (healthy.length === 0) return null;
  const room = warmRoom;
  // 在下藥的缸只搬魚，蝦先留著
  const movable = (x: TankState) => (medicated(x) ? healthy.filter((f) => !isShrimpSpecies(f.species)) : healthy);
  const swallowed = (x: TankState) => movable(x).filter((f) => isJuvenile(f) && f.lengthCm <= mouthCm(x)).length;
  const to = warmCandidates(tanks, from)
    .filter((i) => !hasSick(tanks[i]) && room(tanks[i]) > 0 && movable(tanks[i]).length > 0)
    .sort((a, b) => Math.max(0, swallowed(tanks[a]) - boxRoom(tanks[a])) - Math.max(0, swallowed(tanks[b]) - boxRoom(tanks[b])) || room(tanks[b]) - room(tanks[a]))[0];
  if (to === undefined) return null;
  const dest = tanks[to];
  const choices = economy(tanks[0]).choices;
  const seed = new Set([...(choices?.pair ?? []), ...(choices?.sires ?? []), ...(choices?.lineKeep ?? [])]);
  const rank = (f: Fish) => (f.keeper || seed.has(f.id) ? 0 : !isJuvenile(f) && f.pregnancy > 0 ? 1 : isJuvenile(f) ? 2 : 3);
  const mouth = mouthCm(dest);
  let left = room(dest);
  let boxLeft = boxRoom(dest);
  const fish: Fish[] = [];
  const box: Fish[] = [];
  let exposed = 0;
  const cands = movable(dest);
  for (const f of [...cands].sort((a, b) => rank(a) - rank(b) || fishBuybackPrice(b) - fishBuybackPrice(a))) {
    const cm = f.lengthCm * sizeRatio(f);
    if (cm > left) continue;
    fish.push(f);
    left -= cm;
    if (!isJuvenile(f) || f.lengthCm > mouth) continue;
    // 蝦苗、親魚自己顧的苗不能放育幼盒：直接算會被吃（#402 架構）
    if (!usesNursery(f.species)) {
      exposed++;
      continue;
    }
    // 盒子放不下的小魚照樣搬（冷缸已經低於適溫，留著一定冷死；搬過去只是可能被吃）
    if (boxLeft > 0) {
      box.push(f);
      boxLeft--;
    } else exposed++;
  }
  return fish.length > 0 ? { to, fish, box, exposed, total: living.length, sick: living.length - healthy.length, shrimp: healthy.length - cands.length } : null;
}

/**
 * 有暖缸卻搬不過去時說為什麼（#404，g31：繁殖缸在下白點藥，搬魚完全不出現，玩家不知道為什麼）。
 * 搬得了、這缸不冷、或根本沒有加熱棒好的暖缸回 null。
 */
export function warmMoveRefusal(tanks: TankState[], from: number): string | null {
  const t = tanks[from];
  if (!t || !hasLiving(t) || !coldWithoutHeater(t) || warmMove(tanks, from)) return null;
  const warm = warmCandidates(tanks, from);
  if (warm.length === 0) return null;
  const name = tankLabel(tanks, warm[0]);
  if (t.fish.every((f) => !f.alive || visiblySick(f))) return `這缸的魚都在生病，搬去${name}會傳染`;
  if (warm.every((i) => hasSick(tanks[i]))) return `${name}有魚在生病，搬過去會被傳染`;
  const healthy = t.fish.filter((f) => f.alive && !visiblySick(f));
  if (warm.every((i) => hasSick(tanks[i]) || (medicated(tanks[i]) && healthy.every((f) => isShrimpSpecies(f.species))))) return `${name}在下藥，蝦搬過去會中毒`;
  return `${name}已經滿了，搬不過去`;
}

/** 照 warmMove 把魚連袋子泡進暖缸、慢慢對水再放（會被吞的小魚直接放進育幼盒）；回傳搬到哪缸、搬了幾尾、幾尾進盒子（搬不了回 null）。 */
export function moveToWarmTank(tanks: TankState[], from: number): { to: number; count: number; boxed: number } | null {
  const plan = warmMove(tanks, from);
  if (!plan) return null;
  const dest = tanks[plan.to];
  let count = 0;
  for (const f of plan.fish) if (moveFish(tanks[from], dest, f.id, true)) count++;
  let boxed = 0;
  for (const f of plan.box) if (moveToNursery(dest, f.id)) boxed++;
  return count > 0 ? { to: plan.to, count, boxed } : null;
}
