import { economy, price, spend } from './economy';
import { AIR_PUMPS } from './equipment';
import { OXYGEN_HARM_MG } from './processes/fauna';
import { GASP_O2 } from './readings';
import { FISH_SPECIES } from './species';
import { isJuvenile } from './state';
import type { Fish, TankState } from './state';

/**
 * 缺氧（strain-fixing 種子 5：53 尾小魚搬進 20L 缸，溶氧 1.5～2 撐了 9 天沒人說，第 10 天整缸死）。
 * 溶氧低到魚浮頭（GASP_O2，緊迫才剛開始、還沒傷魚）早上報告黃色、任務卡叫玩家處理；低到開始傷魚（OXYGEN_HARM_MG）紅色。
 * 有機物多、魚多的缸，換水只撐幾小時，要靠打氣把水面交換變快才救得回來。
 */

/**
 * 最近浮頭累積這麼久（遊戲小時）才算「連續偏低」要叫玩家處理。每小時浮頭 +1、沒浮頭 −1：
 * 晚上掉幾小時、白天就回來的不會累積；換水後回升幾小時又掉回去的照樣累積。開始傷魚的不用等。
 */
export const LOW_O2_HOURS = 12;

/** 現在缺氧到魚在水面喘氣（會到水面吸氣的鬥魚、蝦不算）。 */
const gasping = (t: TankState) => t.water.o2 < GASP_O2 && t.fish.some((f) => f.alive && !FISH_SPECIES[f.species].airBreather && !FISH_SPECIES[f.species].invertebrate);

/** 每小時記一次的累積時數：有 +1、沒有 −1，最少 0（0 就刪掉，存檔不多一欄）。 */
const tally = (n: number | undefined, on: boolean): number | undefined => {
  const h = Math.max(0, (n ?? 0) + (on ? 1 : -1));
  return h > 0 ? h : undefined;
};

/** 每遊戲小時記一次最近浮頭、傷魚了幾小時（step 呼叫）。 */
export function trackOxygen(t: TankState): void {
  const hour = Math.floor(t.hours + 1e-6);
  if (t.o2CheckedHour === hour) return;
  t.o2CheckedHour = hour;
  const gasp = gasping(t);
  t.lowO2Hours = tally(t.lowO2Hours, gasp);
  t.o2HarmHours = tally(t.o2HarmHours, gasp && t.water.o2 < OXYGEN_HARM_MG);
  if (t.lowO2Hours === undefined) delete t.lowO2Hours;
  if (t.o2HarmHours === undefined) delete t.o2HarmHours;
}

/**
 * 最近的缺氧（早上報告、任務卡用）：累積浮頭 LOW_O2_HOURS 以上（黃，早上報告提早說），或最近低到傷魚（紅，加任務卡）。
 * 剛換完水溶氧暫時回來也算，沒打氣幾小時又會掉回去，要等累積的時數退掉才不說。沒有回 null。
 */
export function breathless(t: TankState): { o2: number; harm: boolean; hours: number } | null {
  const hours = t.lowO2Hours ?? 0;
  const harm = (t.o2HarmHours ?? 0) > 0;
  return harm || hours >= LOW_O2_HOURS ? { o2: t.water.o2, harm, hours } : null;
}
/** 打氣機的價錢。 */
export const airPumpPrice = () => price('air:small');

/** 缺氧怎麼救：打氣機關著就打開、沒有又買得起就買一台，不然先換水。 */
export function oxygenFix(t: TankState): 'air_on' | 'buy_air' | 'water' {
  const pump = t.equipment.airPump;
  if (pump) return pump.on ? 'water' : 'air_on';
  return economy(t).coins >= airPumpPrice() ? 'buy_air' : 'water';
}

/** 打開或買一台打氣機裝上（任務卡、早上報告點下去）。都做不到回 false。 */
export function addAir(t: TankState): boolean {
  const pump = t.equipment.airPump;
  if (pump) {
    if (pump.on) return false;
    pump.on = true;
    return true;
  }
  if (!spend(t, airPumpPrice())) return false;
  t.equipment.airPump = { spec: AIR_PUMPS.small, on: true };
  return true;
}

/** 沒打氣的缸，搬進來的小魚每公升幾尾以上就容易缺氧（20L 缸 10 尾；種子 5 是 53 尾搬進 20L 缸）。 */
export const NO_AIR_FRY_PER_L = 0.5;

/**
 * 搬魚進這缸（C14「搬一些」）會不會缺氧：那缸沒在打氣、搬進來的小魚又多。小魚吃得多、拉得多，有機物分解很耗氧。
 * 會的話回傳打氣機還差幾元（0 是買得起）；不會回 null。
 */
export function moveAirRisk(dest: TankState, fish: readonly Fish[]): { short: number } | null {
  if (dest.equipment.airPump?.on) return null;
  const young = fish.filter(isJuvenile).length;
  if (young < dest.equipment.tank.volumeL * NO_AIR_FRY_PER_L) return null;
  const short = dest.equipment.airPump ? 0 : Math.max(0, airPumpPrice() - economy(dest).coins);
  return { short };
}
