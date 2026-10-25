import { installHeater } from './actions';
import { economy, fishBuybackPrice, householdTanks, price } from './economy';
import { moveFish } from './household';
import { crowdingRatio } from './processes/fauna';
import { sizeRatio } from './processes/population';
import { emergencySale } from './raise-cash';
import { HEATERS } from './equipment';
import { FISH_SPECIES } from './species';
import type { Fish, TankState } from './state';

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

/** 為什麼不能跟阿德賒加熱棒；可以回 null（mvp.md §4.4.6：錢不夠、今天賣魚也湊不到、水溫已經低於適溫，同時間只能賒一支）。 */
export function heaterCreditRefusal(t: TankState): string | null {
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

/** 跟阿德賒一支加熱棒裝上去，回傳欠多少（不能賒回 0）。之後每筆收入扣一半來還（noteEarned）。 */
export function takeHeaterCredit(t: TankState): number {
  if (heaterCreditRefusal(t)) return 0;
  const cost = creditCost(t);
  installHeater(t, creditHeater(t));
  economy(t).heaterLoan = cost;
  return cost;
}

/** 冬天搬魚救急時，暖缸最多塞到多擠（每公升 1 cm；擠幾天比冷死好，之後再分缸或賣）。 */
export const WARM_MOVE_CROWD = 1;

/**
 * 冷缸的魚可以先搬去哪一缸（#400，g30：賒帳只能賒一支，另一缸保溫撐不住 16°C 的室溫）：
 * 別缸的加熱棒是好的、水溫在這缸魚的適溫內，選空位最多的那缸。留種、選好的種魚先搬，再來照賣價高的，塞到 WARM_MOVE_CROWD 為止。
 * 搬不了（沒有暖缸、暖缸滿了、這缸不冷或沒魚）回 null。
 */
export function warmMove(tanks: TankState[], from: number): { to: number; fish: Fish[]; total: number } | null {
  const t = tanks[from];
  if (!t || !hasLiving(t) || !coldWithoutHeater(t)) return null;
  const limit = coldLimitC(t);
  const room = (x: TankState) => (WARM_MOVE_CROWD - crowdingRatio(x)) * x.equipment.tank.volumeL;
  const to = tanks
    .map((_, i) => i)
    .filter((i) => i !== from && workingHeater(tanks[i]) && tanks[i].water.tempC >= limit && room(tanks[i]) > 0)
    .sort((a, b) => room(tanks[b]) - room(tanks[a]))[0];
  if (to === undefined) return null;
  const choices = economy(tanks[0]).choices;
  const seed = new Set([...(choices?.pair ?? []), ...(choices?.sires ?? []), ...(choices?.lineKeep ?? [])]);
  const first = (f: Fish) => (f.keeper || seed.has(f.id) ? 0 : 1);
  const living = t.fish.filter((f) => f.alive);
  let left = room(tanks[to]);
  const fish: Fish[] = [];
  for (const f of [...living].sort((a, b) => first(a) - first(b) || fishBuybackPrice(b) - fishBuybackPrice(a))) {
    const cm = f.lengthCm * sizeRatio(f);
    if (cm > left) continue;
    fish.push(f);
    left -= cm;
  }
  return fish.length > 0 ? { to, fish, total: living.length } : null;
}

/** 照 warmMove 把魚連袋子泡進暖缸、慢慢對水再放；回傳搬到哪缸、搬了幾尾（搬不了回 null）。 */
export function moveToWarmTank(tanks: TankState[], from: number): { to: number; count: number } | null {
  const plan = warmMove(tanks, from);
  if (!plan) return null;
  let count = 0;
  for (const f of plan.fish) if (moveFish(tanks[from], tanks[plan.to], f.id, true)) count++;
  return count > 0 ? { to: plan.to, count } : null;
}
