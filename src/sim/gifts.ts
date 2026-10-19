import { addCuttings, economy } from './economy';
import { bacteriaCapacity, filterBacteriaShare } from './processes/nitrogen';
import type { PlantSpeciesId } from './species';
import { PLANT_SPECIES } from './species';
import { BACTERIA_SEED, type TankState } from './state';

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

/** 一瓶硝化菌液接種多少菌：濾材容量的這個比例（成熟濾材是一半，所以只是加快、不會立刻好）。 */
export const BOTTLED_BACTERIA_SHARE = 0.04;

/**
 * 倒一瓶硝化菌液：給新缸一小批菌，把養水從幾天縮短到一兩天。
 * 菌還是要靠氨才長得起來；自來水沖濾材、下抗生素一樣會殺掉。
 */
export function addBottledBacteria(state: TankState): number {
  const capacity = bacteriaCapacity(state);
  const dose = Math.max(BACTERIA_SEED * 10, capacity * BOTTLED_BACTERIA_SHARE);
  state.bacteria.aob = Math.max(state.bacteria.aob, Math.min(capacity, state.bacteria.aob + dose));
  state.bacteria.nob = Math.max(state.bacteria.nob, Math.min(capacity, state.bacteria.nob + dose));
  return dose;
}

/** 從自己的舊缸分一份濾材到新缸（兩缸都是自己的）。舊缸不夠成熟就回傳 null。 */
export function transferMedia(from: TankState, to: TankState): MediaGift | null {
  if (from === to || !to.equipment.filter || mediaAvailable(from) <= 0) return null;
  // 自己的缸可以分一半濾材過去（送朋友只分一小份）
  const amount = Math.min(from.bacteria.aob, from.bacteria.nob) * filterBacteriaShare(from) * OWN_MEDIA_SHARE;
  from.bacteria.aob -= amount;
  from.bacteria.nob -= amount;
  const w = from.water;
  const gift = { bacteria: amount, filter: from.equipment.filter!.spec.name, ich: w.ichPathogen > 0.01 || w.ichCysts > 0.01 };
  applyMedia(to, gift);
  return gift;
}

/** 分自己舊缸的濾材：分一半過去。 */
export const OWN_MEDIA_SHARE = 0.5;
