import { dropTankEchoes } from './choice-echo';
import { economy, spend } from './economy';
import { LIGHTS } from './equipment';
import { tankLock, unlockHint } from './goals';
import { nextRandom } from './random';
import { createTank, type TankState } from './state';
import { ID_BLOCK, linkTanks, MAX_TANKS, newTankCost, TANK_RESALE_SHARE, TANK_SETS, type TankSizeId } from './household';

/** 買缸、拆缸：開機用不到，分出來讓開機少載一點。 */
/** 買一個新缸（套缸，還沒養水）。回傳新缸；買不起就回傳 null。 */
export function buyTank(tanks: TankState[], id: TankSizeId): TankState | null {
  if (buyTankRefusal(tanks, id)) return null;
  linkTanks(tanks);
  spend(tanks[0], newTankCost(tanks, id));
  return placeTankSet(tanks, id);
}

/** 收掉一個空缸：缸和設備折價賣掉，水草、造景跟著丟掉。回傳拿回多少錢。 */
export function removeTank(tanks: TankState[], index: number): number {
  if (removeTankRefusal(tanks, index)) return 0;
  const t = tanks[index];
  const id = t.equipment.tank.id as TankSizeId;
  const refund = Math.round((TANK_SETS[id]?.tankPrice ?? 0) * TANK_RESALE_SHARE);
  tanks.splice(index, 1);
  dropTankEchoes(economy(tanks[0]).choices, index);
  economy(tanks[0]).coins += refund;
  linkTanks(tanks);
  return refund;
}

/** 為什麼不能再加缸；可以加就回傳 null。 */
export function buyTankRefusal(tanks: TankState[], id: TankSizeId): string | null {
  if (tanks.length >= MAX_TANKS) return `房間最多放 ${MAX_TANKS} 缸`;
  const lock = tankLock(tanks, id);
  if (lock) return unlockHint(lock);
  if (economy(tanks[0]).coins < newTankCost(tanks, id)) return '錢不夠';
  return null;
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

/** 為什麼不能收掉這缸；可以就回傳 null。 */
export function removeTankRefusal(tanks: TankState[], index: number): string | null {
  const t = tanks[index];
  if (!t) return '沒有這缸';
  if (tanks.length <= 1) return '至少要留一缸';
  if (t.fish.some((f) => f.alive) || [...(t.quarantine?.fish ?? []), ...(t.tub?.fish ?? [])].some((f) => f.alive)) return '缸裡還有活的魚蝦，先移到別缸或賣掉';
  return null;
}
