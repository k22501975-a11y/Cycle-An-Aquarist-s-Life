import { economy, PRICES, registerHousehold, spend } from './economy';
import { PESTS_VISIBLE } from './snails';
import { tankLock, unlockHint } from './goals';
import { FILTERS, HEATERS, LIGHTS, TANKS, type FilterSpec, type HeaterSpec, type TankSpec } from './equipment';
import { nextRandom } from './random';
import { HUNGRY } from './readings';
import { createTank, type TankState } from './state';

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
 * 這缸的魚不餓、別缸卻有魚餓了（例如搬去繁殖缸的小魚），也換過去（#322）。
 */
export function feedTarget(tanks: TankState[], active: number): number {
  const living = (t: TankState) => t.fish.filter((f) => f.alive);
  const most = (t: TankState) => Math.max(-1, ...living(t).map((f) => f.hunger));
  if (!tanks[active]) return active;
  let best = active;
  let hunger = most(tanks[active]);
  if (hunger >= HUNGRY) return active;
  tanks.forEach((t, i) => {
    const h = most(t);
    // 這缸有魚的話，別缸要真的餓了才換過去
    if (h > hunger && (hunger < 0 || h >= HUNGRY)) [best, hunger] = [i, h];
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

/** 為什麼不能再加缸；可以加就回傳 null。 */
export function buyTankRefusal(tanks: TankState[], id: TankSizeId): string | null {
  if (tanks.length >= MAX_TANKS) return `房間最多放 ${MAX_TANKS} 缸`;
  const lock = tankLock(tanks, id);
  if (lock) return unlockHint(lock);
  if (economy(tanks[0]).coins < newTankCost(tanks, id)) return '錢不夠';
  return null;
}

/** 買一個新缸（套缸，還沒養水）。回傳新缸；買不起就回傳 null。 */
export function buyTank(tanks: TankState[], id: TankSizeId): TankState | null {
  if (buyTankRefusal(tanks, id)) return null;
  linkTanks(tanks);
  spend(tanks[0], newTankCost(tanks, id));
  return placeTankSet(tanks, id);
}

/** 把一組套缸擺進房間（不收錢；商城的熟成套缸 matureMedia 是 true）。呼叫前要先確認還有缸位。 */
export function placeTankSet(tanks: TankState[], id: TankSizeId, matureMedia = false): TankState {
  linkTanks(tanks);
  const home = tanks[0];
  const set = TANK_SETS[id];
  const tank = createTank({
    tank: set.tank,
    filter: set.filter,
    heater: { spec: set.heater, targetC: 25 },
    light: { spec: LIGHTS.basic },
    roomTempC: home.environment.roomTempC,
    tap: home.environment.tap,
    seed: Math.max(1, Math.floor(nextRandom(home.rng) * 2147483646)),
    matureMedia,
  });
  tank.hours = home.hours;
  const wallet = economy(home);
  tank.nextId = wallet.nextTankBlock! * ID_BLOCK + 1;
  wallet.nextTankBlock! += 1;
  tanks.push(tank);
  linkTanks(tanks);
  return tank;
}

/**
 * 把一條魚撈到另一缸。沒對水就換缸會緊迫：水溫、pH 差越多越嚴重。
 * 身上的病跟著過去（新缸也可能被傳染）。
 */
export function moveFish(from: TankState, to: TankState, fishId: number): boolean {
  const fish = from.fish.find((f) => f.id === fishId && f.alive);
  if (!fish || from === to) return false;
  const dT = Math.abs(from.water.tempC - to.water.tempC);
  const dPh = Math.abs(from.water.ph - to.water.ph);
  fish.stress = Math.min(1, Math.max(fish.stress, 0.3 + Math.min(0.5, dT * 0.08 + dPh * 0.15)));
  from.fish = from.fish.filter((f) => f !== fish);
  // 從育幼盒撈出來換缸：到了新缸就是在缸裡游（#191）
  fish.nursery = undefined;
  fish.arrivedHours = to.hours;
  to.fish.push(fish);
  return true;
}

/** 為什麼不能收掉這缸；可以就回傳 null。 */
export function removeTankRefusal(tanks: TankState[], index: number): string | null {
  const t = tanks[index];
  if (!t) return '沒有這缸';
  if (tanks.length <= 1) return '至少要留一缸';
  if (t.fish.some((f) => f.alive) || (t.quarantine?.fish ?? []).some((f) => f.alive)) return '缸裡還有活的魚蝦，先移到別缸或賣掉';
  return null;
}

/** 收掉一個空缸：缸和設備折價賣掉，水草、造景跟著丟掉。回傳拿回多少錢。 */
export function removeTank(tanks: TankState[], index: number): number {
  if (removeTankRefusal(tanks, index)) return 0;
  const t = tanks[index];
  const id = t.equipment.tank.id as TankSizeId;
  const refund = Math.round((TANK_SETS[id]?.tankPrice ?? 0) * TANK_RESALE_SHARE);
  tanks.splice(index, 1);
  economy(tanks[0]).coins += refund;
  linkTanks(tanks);
  return refund;
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
