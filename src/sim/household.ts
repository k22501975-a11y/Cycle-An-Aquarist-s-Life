import { economy, PRICES, registerHousehold } from './economy';
import { PESTS_VISIBLE } from './snails';
import { FILTERS, HEATERS, TANKS, type FilterSpec, type HeaterSpec, type TankSpec } from './equipment';
import type { TankState } from './state';

/**
 * 多缸（GAME_DESIGN 第 14 節：缸位只看錢，但缸越多越難顧）。
 * 每個缸是一份獨立的 TankState，各自有水、細菌、魚和設備；
 * 錢包、房間（地區、冷氣、停電）是共用的，所有缸跟著同一個時鐘走。
 */

/** 房間最多放幾缸。 */
export const MAX_TANKS = 6;
/** 原本的櫃子放得下幾缸；再多就要買缸架。 */
export const FREE_SLOTS = 2;
/** 一層缸架（多一個缸位）的價錢。 */
export const RACK_PRICE = 800;
/** 每缸 id 區段的大小。 */
export const ID_BLOCK = 10_000_000;
/** 收掉空缸時，缸和套組可以折價賣回幾成。 */
export const TANK_RESALE_SHARE = 0.3;

export type TankSizeId = keyof typeof TANKS;

/**
 * 套缸：缸＋過濾＋加熱棒＋燈，買回來就能開始養水。大缸配大一點的設備。
 * tankPrice 只是缸本身；玩家看到、mvp.md §4.3 寫的是 tankSetPrice 的整組價（20L 1,430、90L 3,500，#283）。
 */
export const TANK_SETS: Record<TankSizeId, { tank: TankSpec; filter: FilterSpec; heater: HeaterSpec; tankPrice: number }> = {
  nano20: { tank: TANKS.nano20, filter: FILTERS.sponge, heater: HEATERS.h25, tankPrice: 600 },
  std40: { tank: TANKS.std40, filter: FILTERS.hangOn, heater: HEATERS.h50, tankPrice: 900 },
  std90: { tank: TANKS.std90, filter: FILTERS.hangOn, heater: HEATERS.h100, tankPrice: 2200 },
};

/** 套缸的總價（缸本身加上配的設備）。 */
export function tankSetPrice(id: TankSizeId): number {
  const set = TANK_SETS[id];
  return set.tankPrice + (PRICES[`filter:${set.filter.id}`] ?? 0) + (PRICES[`heater:${set.heater.id}`] ?? 0) + (PRICES['light:basic'] ?? 0);
}

/** 第 count + 1 個缸要不要先買缸架。 */
export function slotPrice(count: number): number {
  return count >= FREE_SLOTS ? RACK_PRICE : 0;
}

export function newTankCost(tanks: TankState[], id: TankSizeId): number {
  return tankSetPrice(id) + slotPrice(tanks.length);
}

/**
 * 按「餵食」要餵哪一缸：這缸有活魚就這缸；這缸是空的（剛買的新缸還在養水）就換成別缸裡最餓的那缸，
 * 主缸的魚才不會因為畫面停在空缸、每天的餵食都落空而整批餓死（#315）。
 * 這缸有魚就不跳缸：別缸餓了由 feedOtherTanks 一起餵（#325）。
 */
export function feedTarget(tanks: TankState[], active: number): number {
  const living = (t: TankState) => t.fish.filter((f) => f.alive);
  if (!tanks[active] || living(tanks[active]).length > 0) return active;
  let best = active;
  let hunger = -1;
  tanks.forEach((t, i) => {
    const most = Math.max(-1, ...living(t).map((f) => f.hunger));
    if (most > hunger) [best, hunger] = [i, most];
  });
  return best;
}

export function tankLabel(tanks: TankState[], index: number): string {
  return tanks[index]?.label || `第 ${index + 1} 缸`;
}

/** 共用錢包和房間：讀檔、加缸、復原之後都要再連一次。 */
export function linkTanks(tanks: TankState[]): void {
  const home = tanks[0];
  if (!home) return;
  const wallet = economy(home);
  wallet.nextTankBlock ??= Math.max(1, ...tanks.map((t) => Math.floor(t.nextId / ID_BLOCK) + 1));
  for (const t of tanks) {
    t.economy = wallet;
    if (t === home) continue;
    syncRoom(home, t);
  }
  registerHousehold(tanks);
}

/** 把房間的設定（地區、冷氣、室溫、停電）從 from 抄到 to。 */
export function syncRoom(from: TankState, to: TankState): void {
  const a = from.environment;
  const b = to.environment;
  b.region = a.region;
  b.airConditioned = a.airConditioned;
  b.roomTempC = a.roomTempC;
  b.roomSwingC = a.roomSwingC;
  b.powerOut = a.powerOut;
}

/** 連袋子泡進新缸慢慢對水（#400 冬天搬去暖缸）：水溫、pH 差造成的緊迫只剩幾分之一。 */
export const ACCLIMATED_SHOCK_SHARE = 0.25;

/**
 * 把一條魚撈到另一缸。沒對水就換缸會緊迫：水溫、pH 差越多越嚴重；acclimate 是連袋子泡進去慢慢對水，緊迫小得多。
 * 身上的病跟著過去（新缸也可能被傳染）。
 */
export function moveFish(from: TankState, to: TankState, fishId: number, acclimate = false): boolean {
  // 收納箱裡的魚（tub.ts）也撈得出來：C17 挑中箱裡的品系小魚時直接搬過去
  const inTub = from.tub?.fish.find((f) => f.id === fishId && f.alive);
  const fish = from.fish.find((f) => f.id === fishId && f.alive) ?? inTub;
  if (!fish || (from === to && !inTub)) return false;
  const dT = Math.abs(from.water.tempC - to.water.tempC);
  const dPh = Math.abs(from.water.ph - to.water.ph);
  const shock = Math.min(0.5, dT * 0.08 + dPh * 0.15) * (acclimate ? ACCLIMATED_SHOCK_SHARE : 1);
  fish.stress = Math.min(1, Math.max(fish.stress, 0.3 + shock));
  from.fish = from.fish.filter((f) => f !== fish);
  if (inTub) from.tub!.fish = from.tub!.fish.filter((f) => f !== fish);
  // 從育幼盒撈出來換缸：到了新缸就是在缸裡游（#191）
  fish.nursery = undefined;
  fish.arrivedHours = to.hours;
  to.fish.push(fish);
  return true;
}

/**
 * 讀舊存檔時補上新欄位（存檔層級，所有缸一起看）：
 * - 錢包沒有 plantBuys：任一缸已經有水草（或舊版記過買水草）就當作第一次已經用掉，之後買水草照 30% 算。
 * - 缸裡的害蟲小螺已經 ≥ PESTS_VISIBLE：直接當作看過了，不會一讀檔就補記 pests_seen、老闆突然說話。
 */
export function migrateHousehold(tanks: TankState[]): void {
  const home = tanks[0];
  if (!home) return;
  const e = economy(home);
  if (e.plantBuys === undefined) e.plantBuys = tanks.some((t) => t.plants.length > 0 || (t.snails?.plantBuys ?? 0) > 0) ? 1 : 0;
  for (const t of tanks) {
    const s = t.snails;
    if (s && s.pestsSeen === undefined && s.pests.ramshorn + s.pests.bladder + s.pests.mts >= PESTS_VISIBLE) s.pestsSeen = true;
  }
}
