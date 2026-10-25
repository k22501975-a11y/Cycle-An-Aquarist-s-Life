import { installHeater } from './actions';
import { economy, householdTanks, price } from './economy';
import { emergencySale } from './raise-cash';
import { HEATERS } from './equipment';
import { FISH_SPECIES } from './species';
import type { TankState } from './state';

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
  return coldWithoutHeater(t) && !insulateRefusal(t);
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

/** 為什麼不能跟阿德賒加熱棒；可以回 null（mvp.md §4.4.6：錢不夠、今天賣魚也湊不到、水溫已經低於適溫，同時間只能賒一支）。 */
export function heaterCreditRefusal(t: TankState): string | null {
  const owed = economy(t).heaterLoan ?? 0;
  if (owed > 0) return `還欠阿德 ${owed} 元，還清之前不能再賒`;
  if (workingHeater(t)) return '這缸的加熱棒是好的';
  const short = creditCost(t) - economy(t).coins;
  if (short <= 0) return '錢夠了，直接買一支就好';
  // §4.4.6：賣魚還湊得到就先賣，設備面板的按鈕跟任務卡同一個條件（#398 架構）
  if (emergencySale(householdTanks(t), short).coins >= short) return '今天賣幾尾魚給水族店就湊得到，先賣魚';
  if (t.water.tempC >= coldLimitC(t)) return '水溫還撐得住，先想辦法湊錢';
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
