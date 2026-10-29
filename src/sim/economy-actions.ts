import { noteAct, type Fish, type TankState } from './state';
import { isShrimpSpecies, type PlantSpeciesId } from './species';
import { buybackRefusal, canClaimStarterPack, chestCuttingsOf, countSale, economy, fishBuybackPrice, householdTanks, isFrySale, MAX_KEEPERS, noteBredSale, noteEarned, plantBuybackPrice, sellableCuttings } from './economy';

// 賣魚、賣插枝、剪插枝、留種標記、領起步包、對帳：玩家在面板上按的動作，只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
export function sellFish(state: TankState, fishId: number): number {
  // 收納箱裡的也能賣（tub.ts）
  const fish = state.fish.find((f) => f.id === fishId) ?? state.tub?.fish.find((f) => f.id === fishId);
  if (!fish || buybackRefusal(fish, true) || !countSale(state, isFrySale(fish))) return 0;
  const coins = fishBuybackPrice(fish);
  state.fish = state.fish.filter((f) => f !== fish);
  if (state.tub) state.tub.fish = state.tub.fish.filter((f) => f !== fish);
  const e = economy(state);
  e.coins += coins;
  // 一尾 2 元的小魚不算真收入（g33：擠缸自動賣小魚，保底單一直不出）
  noteEarned(state, coins, !isFrySale(fish));
  e.fishSold = (e.fishSold ?? 0) + 1;
  noteBredSale(state, fish, coins, 'shop');
  return coins;
}

/** 把手上的插枝全部賣掉（算一次），回傳拿到多少錢。寶箱來的不收，留在手上可以種。 */
export function sellCuttings(state: TankState, species: PlantSpeciesId): number {
  const e = economy(state);
  const n = sellableCuttings(state, species);
  if (n <= 0 || !countSale(state)) return 0;
  const coins = n * plantBuybackPrice(species);
  e.cuttings[species] = (e.cuttings[species] ?? 0) - n;
  e.coins += coins;
  noteEarned(state, coins);
  noteAct(state, 'cutting');
  return coins;
}

/** 標或取消「留種」（design/midgame.md C2）。回傳不能標的原因；成功回傳 null。 */
export function setKeeper(state: TankState, fishId: number, on: boolean): string | null {
  const fish = [...state.fish, ...(state.quarantine?.fish ?? [])].find((f) => f.id === fishId);
  if (!fish) return '這條魚不在缸裡';
  if (!on) {
    delete fish.keeper;
    return null;
  }
  const why = keeperRefusal(state, fish);
  if (why) return why;
  fish.keeper = true;
  return null;
}

/** 種一株手上的插枝回缸裡（不用錢）。 */
export function takeCutting(state: TankState, species: PlantSpeciesId): boolean {
  const e = economy(state);
  if ((e.cuttings[species] ?? 0) <= 0) return false;
  // 先種寶箱來的（種下去就是缸裡的草了）
  const chest = chestCuttingsOf(state, species);
  if (chest > 0) e.chestCuttings![species] = chest - 1;
  e.cuttings[species]! -= 1;
  noteAct(state, 'cutting');
  return true;
}

/** 領起步包：1 公 2 母、確認健康的孔雀魚。送的魚不能賣回店裡（牠們生的可以）。 */
export function claimStarterPack(state: TankState, addGuppy: (state: TankState, sex: 'male' | 'female') => Fish, others: TankState[] = []): boolean {
  if (!canClaimStarterPack(state, others)) return false;
  for (const sex of ['male', 'female', 'female'] as const) addGuppy(state, sex).gift = true;
  economy(state).starterPackHours = state.hours;
  return true;
}

/**
 * 套用一筆伺服器帳本的收支（市場的扣款、入帳，docs/ledger.md §3.3）：照 delta 加減，不用伺服器回傳的餘額覆蓋，
 * 不然這中間本機花掉的錢會被加回來。已經套用過的（ledgerSeq 不比現在大）不再加。回傳有沒有套用。
 */
export function applyLedger(state: TankState, entry: { delta: number; ledgerSeq: number }): boolean {
  const e = economy(state);
  if (entry.ledgerSeq <= (e.ledgerSeq ?? 0)) return false;
  e.coins += entry.delta;
  if (entry.delta > 0) noteEarned(state);
  e.ledgerSeq = entry.ledgerSeq;
  return true;
}

/** 為什麼這尾不能標留種；可以就回傳 null（取消留種永遠可以）。 */
export function keeperRefusal(state: TankState, fish: Fish): string | null {
  if (fish.keeper) return null;
  if (!fish.alive) return '死掉了';
  if (isShrimpSpecies(fish.species)) return '蝦子不用留種，留一群自己就會繁殖';
  if (fish.listing) return '已經在市場上架了，先下架';
  const n = householdTanks(state).reduce((k, t) => k + [...t.fish, ...(t.quarantine?.fish ?? [])].filter((f) => f.alive && f.keeper).length, 0);
  if (n >= MAX_KEEPERS) return `最多留 ${MAX_KEEPERS} 尾種魚，先取消一尾`;
  return null;
}
