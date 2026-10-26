import { growthStage } from './growth';
import { isShrimpSpecies } from './species';
import type { TankState } from './state';
import { type TankPurpose, TANK_PURPOSES, purposeCost } from './tank-purpose';

/** 換缸用途（設定和建議）：開機用不到，分出來讓開機少載一點。 */
/**
 * 推薦哪一種（開缸卡上標「推薦」）：主缸已經有懷孕的母魚或一群小魚，先開繁殖缸；
 * 不然看錢夠不夠買水草燈那一套，夠就推薦展示缸，不夠還是繁殖缸（便宜）。
 */
export function suggestPurpose(tanks: TankState[], coins: number): TankPurpose {
  // 早上的 C3 卡已經選過用途（design/midgame.md）：照玩家選的
  const picked = tanks[0]?.economy?.choices?.picked.C3;
  if (picked === 'breeding' || picked === 'display') return picked;
  const fish = tanks.flatMap((t) => t.fish.filter((f) => f.alive && !isShrimpSpecies(f.species)));
  const busy = fish.some((f) => f.pregnancy > 0.5) || fish.filter((f) => growthStage(f) === 'fry' || growthStage(f) === 'juvenile').length >= 5;
  if (busy) return 'breeding';
  return coins >= purposeCost('display') ? 'display' : 'breeding';
}

/** 選定用途：記在缸上；缸還沒取名就用用途當名字。換用途也可以（目標跟著換）。 */
export function setTankPurpose(state: TankState, purpose: TankPurpose): void {
  const was = state.purpose ? TANK_PURPOSES[state.purpose].label : undefined;
  state.purpose = purpose;
  if (!state.label || state.label === was) state.label = TANK_PURPOSES[purpose].label;
}
