import { addCuttings, economy } from './economy';
import { filterBacteriaShare } from './processes/nitrogen';
import type { PlantSpeciesId } from './species';
import { PLANT_SPECIES } from './species';
import type { TankState } from './state';

/**
 * 好友互贈（friends.md §2.2）的模擬面：送出時從自己的缸拿走，收到時放進缸裡。
 * 成熟濾材能幫新缸接種硝化菌；送的人缸裡有白點蟲，濾材會把蟲卵一起帶過去。
 */

/** 送一份濾材會分走過濾器裡多少的硝化菌。 */
export const MEDIA_SHARE = 0.25;
/** 濾材上至少要有這麼多菌才算「成熟」，值得送。 */
export const MEDIA_MIN_BACTERIA = 0.5;

export interface MediaGift {
  /** 帶過去的硝化菌（和 bacteria.aob／nob 同單位）。 */
  bacteria: number;
  filter: string;
  /** 送的人缸裡有白點蟲（游走期或孢囊）。 */
  ich: boolean;
}

/** 這缸的濾材能分多少菌出去（0 表示還不成熟或沒有過濾器）。 */
export function mediaAvailable(state: TankState): number {
  if (!state.equipment.filter) return 0;
  const share = filterBacteriaShare(state);
  const amount = Math.min(state.bacteria.aob, state.bacteria.nob) * share * MEDIA_SHARE;
  return amount >= MEDIA_MIN_BACTERIA * MEDIA_SHARE ? amount : 0;
}

/** 從過濾器分一份濾材出來（自己的缸少一些菌）。不夠成熟就回傳 null。 */
export function packMedia(state: TankState): MediaGift | null {
  const amount = mediaAvailable(state);
  if (amount <= 0) return null;
  state.bacteria.aob -= amount;
  state.bacteria.nob -= amount;
  const w = state.water;
  return { bacteria: amount, filter: state.equipment.filter!.spec.name, ich: w.ichPathogen > 0.01 || w.ichCysts > 0.01 };
}

/** 把朋友送的濾材放進過濾器。 */
export function applyMedia(state: TankState, gift: MediaGift): void {
  const amount = Math.max(0, Math.min(gift.bacteria, 50));
  state.bacteria.aob += amount;
  state.bacteria.nob += amount;
  if (gift.ich) state.water.ichCysts += 5 * (state.equipment.tank.volumeL / 40);
}

export function isPlantSpecies(id: string): id is PlantSpeciesId {
  return id in PLANT_SPECIES;
}

/** 從手上的插枝拿出 count 株要送人；不夠就不拿、回傳 false。 */
export function takeCuttingsForGift(state: TankState, species: PlantSpeciesId, count: number): boolean {
  const e = economy(state);
  if ((e.cuttings[species] ?? 0) < count || count <= 0) return false;
  e.cuttings[species]! -= count;
  return true;
}

/** 收到插枝：放進手上的插枝（可以種、可以賣）。 */
export function receiveCuttings(state: TankState, species: string, count: number): boolean {
  if (!isPlantSpecies(species)) return false;
  addCuttings(state, species, Math.max(0, Math.min(10, Math.floor(count))));
  return true;
}
