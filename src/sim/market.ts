import { addCuttings, BETTA_FEMALE_PRICE, economy, FISH_PRICES, fishBuybackPrice, guppyBuybackTier, JUVENILE_SHARE, PLANT_PRICES, plantBuybackPrice, sellableCuttings, STRAIN_TIER } from './economy';
import { phenotype, strainName } from './genetics';
import { hasVisible } from './processes/disease';
import { createFish } from './processes/population';
import { isShrimpSpecies, FISH_SPECIES, PLANT_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import { isJuvenile, type Fish, type TankState } from './state';

/**
 * 玩家市場的模擬面（market-and-breeding.md §3）：上架的魚還留在自己的缸裡繼續養（§3.3），
 * 成交後才撈出來裝袋出貨；買家收到時決定要慢慢對水還是直接倒進去（§3.5）。
 */

/** 上架費：售價的 1%，最少 1 元，不退。 */
export const LISTING_FEE = 0.01;
/** 成交稅：成交價的 8%，賣家付。 */
export const MARKET_TAX = 0.08;

export type PackagingId = 'bag' | 'oxygen' | 'box';

/** 包裝（買家選、買家付）：越好越不容易死在路上，到貨也比較不緊迫。和伺服器的 MarketRules 一致。 */
export const PACKAGING: Record<PackagingId, { name: string; cost: number; note: string }> = {
  bag: { name: '普通袋', cost: 0, note: '不用錢，路上久了容易緊迫' },
  oxygen: { name: '充氧袋', cost: 30, note: '袋子裡打滿氧氣，運輸死亡少一半以上' },
  box: { name: '保溫箱', cost: 120, note: '保麗龍箱加暖暖包，幾乎不會死在路上' },
};

export function listingFee(price: number): number {
  return Math.max(1, Math.round(price * LISTING_FEE));
}

/** 賣出後實際拿到的錢（扣掉成交稅）。 */
export function marketPayout(price: number): number {
  return price - Math.round(price * MARKET_TAX);
}

/** 買家看到的名字，例如「藍草孔雀魚 公」「櫻花蝦 母（抱卵）」。 */
export function listingTitle(fish: Fish): string {
  const sp = FISH_SPECIES[fish.species];
  const shrimp = isShrimpSpecies(fish.species);
  const strain = fish.genome ? strainName(phenotype(fish.genome)) : '';
  const sex = isJuvenile(fish) ? (shrimp ? '仔蝦' : '幼魚') : fish.sex === 'male' ? '公' : '母';
  const carrying = fish.pregnancy > 0.05 ? (shrimp ? '（抱卵）' : '（懷孕）') : '';
  return `${strain}${sp.name} ${sex}${carrying}`;
}

/** 為什麼這條魚不能上架；可以就回傳 null。 */
export function listingRefusal(fish: Fish): string | null {
  if (!fish.alive) return '死掉了';
  if (fish.listing) return '已經上架了';
  if (fish.gift) return '老闆送的魚不能賣（牠生的可以）';
  if (fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * 0.5) return '還太小，養大一點再賣';
  if (hasVisible(fish) || fish.ich.stage === 'visible' || fish.health < 0.5) return '生病的魚不能上架';
  return null;
}

/** 最低售價 = 水族店收購價（防止用 1 元賣給自己的小號，繞過送禮限額，§3.4）。 */
export function minFishPrice(fish: Fish): number {
  return fishBuybackPrice(fish);
}

export function minPlantPrice(species: PlantSpeciesId, count: number): number {
  return plantBuybackPrice(species) * count;
}

/**
 * 建議售價：魚種店價 × 稀有度倍率（跟收購同一套分級，以普通品系為 1），不設店售價上限。
 * 普通品系的成年孔雀魚約 60 元，自己選育的稀有品系可以比店價高（mvp.md §4.3）。
 */
export function suggestedFishPrice(fish: Fish): number {
  const base = fish.genome
    ? FISH_PRICES.guppy * (guppyBuybackTier(phenotype(fish.genome)) / STRAIN_TIER) * (0.5 + fish.genome.tail / 100)
    : fish.species === 'betta' && fish.sex === 'female'
      ? BETTA_FEMALE_PRICE
      : FISH_PRICES[fish.species];
  return Math.max(minFishPrice(fish), Math.round(base * (isJuvenile(fish) ? JUVENILE_SHARE : 1)));
}

/** 插枝建議售價：約一盆店價的三分之一（一株插枝的店價）。 */
export function suggestedPlantPrice(species: PlantSpeciesId, count: number): number {
  return Math.max(minPlantPrice(species, count), Math.round((PLANT_PRICES[species] / 3) * count));
}

/** 上架或出貨時送給市場的魚資料（listing 是自己這邊的標記，不帶過去）。 */
export function marketItem(fish: Fish): Record<string, unknown> {
  const { listing: _listing, ...rest } = fish;
  return JSON.parse(JSON.stringify(rest));
}

export interface ListedFish {
  tank: TankState;
  fish: Fish;
  inQuarantine: boolean;
}

/** 在所有缸（含檢疫盒）裡找某個上架編號的魚。 */
export function findListedFish(tanks: TankState[], listingId: number): ListedFish | null {
  for (const tank of tanks) {
    const main = tank.fish.find((f) => f.listing === listingId);
    if (main) return { tank, fish: main, inQuarantine: false };
    const q = tank.quarantine?.fish.find((f) => f.listing === listingId);
    if (q) return { tank, fish: q, inQuarantine: true };
  }
  return null;
}

/** 所有缸裡已上架的魚。 */
export function listedFish(tanks: TankState[]): ListedFish[] {
  const out: ListedFish[] = [];
  for (const tank of tanks) {
    for (const fish of tank.fish) if (fish.listing) out.push({ tank, fish, inQuarantine: false });
    for (const fish of tank.quarantine?.fish ?? []) if (fish.listing) out.push({ tank, fish, inQuarantine: true });
  }
  return out;
}

export interface Shipment {
  item: Record<string, unknown>;
  /** 袋子裡的水（買家對水用）。 */
  bagTemp: number;
  bagPh: number;
}

/**
 * 成交後出貨：把魚從缸裡撈出來裝袋。魚還活著才能出貨。
 * 賣家缸裡有白點蟲在游時，魚會被帶上蟲（買家看不到，只能靠檢疫，§3.5 潛伏病原）。
 */
export function packFish(tanks: TankState[], listingId: number): Shipment | null {
  const found = findListedFish(tanks, listingId);
  if (!found || !found.fish.alive) return null;
  const { tank, fish, inQuarantine } = found;
  if (inQuarantine) {
    tank.quarantine!.fish = tank.quarantine!.fish.filter((f) => f !== fish);
    delete tank.quarantine!.since[fish.id];
  } else tank.fish = tank.fish.filter((f) => f !== fish);
  if (!inQuarantine && FISH_SPECIES[fish.species].susceptibleToIch && fish.ich.stage === 'none' && tank.water.ichPathogen > 0.05) {
    fish.ich = { stage: 'incubating', progress: 0 };
  }
  delete fish.listing;
  return { item: marketItem(fish), bagTemp: inQuarantine ? 26 : tank.water.tempC, bagPh: inQuarantine ? 7 : tank.water.ph };
}

/** 取消上架：把魚身上的標記拿掉。 */
export function unlistFish(tanks: TankState[], listingId: number): boolean {
  const found = findListedFish(tanks, listingId);
  if (!found) return false;
  delete found.fish.listing;
  return true;
}

export interface Arrival {
  /** 到貨時的緊迫（包裝與運輸時間決定）。 */
  stress: number;
  bagTemp: number;
  bagPh: number;
  /** 慢慢滴水對水（花點時間，但不會因為水溫、pH 差而緊迫）。 */
  drip: boolean;
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** 直接倒進缸裡的緊迫：水溫、pH 差越多越嚴重（和換缸一樣）。 */
export function dumpShock(state: TankState, bagTemp: number, bagPh: number): number {
  const dT = Math.abs(bagTemp - state.water.tempC);
  const dPh = Math.abs(bagPh - state.water.ph);
  return Math.min(0.5, dT * 0.08 + dPh * 0.15);
}

/**
 * 收貨：把買到的魚放進缸裡（有檢疫盒就先放檢疫盒）。
 * 魚在這邊是新的個體編號、自成一個血統；身上潛伏的病照樣帶過來。
 */
export function receiveFish(state: TankState, item: Record<string, unknown>, arrival: Arrival): Fish | null {
  const species = item.species as FishSpeciesId;
  if (!(species in FISH_SPECIES)) return null;
  const sp = FISH_SPECIES[species];
  const fish = createFish(state, species, {
    sex: item.sex === 'male' ? 'male' : 'female',
    lengthCm: num(item.lengthCm, 0.1, sp.adultLengthCm * 1.5, sp.adultLengthCm),
    ageDays: num(item.ageDays, 0, 3650, sp.daysToAdult),
  });
  fish.health = num(item.health, 0.05, 1, 1);
  fish.hunger = num(item.hunger, 0, 1, 0.3);
  fish.constitution = num(item.constitution, 0.7, 1.3, fish.constitution);
  fish.finDamage = num(item.finDamage, 0, 1, 0);
  fish.pregnancy = fish.sex === 'female' && sp.breeding ? num(item.pregnancy, 0, 0.99, 0) : 0;
  for (const key of ['nutrition', 'colorBoost', 'breedingCondition'] as const) if (typeof item[key] === 'number') fish[key] = num(item[key], 0, 1, 0.5);
  fish.generation = Math.floor(num(item.generation, 0, 999, 0));
  fish.inbreeding = num(item.inbreeding, 0, 1, 0);
  // 新的個體編號，自成一個血統（不會和自己缸裡的魚被當成近親）
  fish.lineage = fish.id;
  if (species === 'guppy' && item.genome && typeof item.genome === 'object') fish.genome = item.genome as Fish['genome'];
  const sire = item.sire as Fish['sire'];
  if (fish.pregnancy > 0 && sire && typeof sire === 'object' && sire.genome) fish.sire = { genome: sire.genome, lineage: -fish.id, inbreeding: num(sire.inbreeding, 0, 1, 0) };
  const ich = item.ich as Fish['ich'] | undefined;
  if (sp.susceptibleToIch && ich && (ich.stage === 'incubating' || ich.stage === 'visible')) fish.ich = { stage: ich.stage, progress: num(ich.progress, 0, 1, 0), cause: 'new_fish' };
  const infections = Array.isArray(item.infections) ? (item.infections as Fish['infections'])! : [];
  fish.infections = infections
    .filter((i) => i && (i.kind === 'columnaris' || i.kind === 'flukes'))
    .map((i) => ({ kind: i.kind, stage: i.stage === 'visible' ? ('visible' as const) : ('latent' as const), progress: num(i.progress, 0, 1, 0) }));
  // 賣家缸裡習慣的水跟著魚過來（舊資料沒有就用袋子裡的水）
  const habit = item.acclimated as Fish['acclimated'];
  fish.acclimated =
    habit && typeof habit === 'object'
      ? { ph: num(habit.ph, 4, 10, arrival.bagPh), gh: num(habit.gh, 0, 30, 6), tempC: num(habit.tempC, 10, 35, arrival.bagTemp) }
      : { ph: arrival.bagPh, gh: 6, tempC: arrival.bagTemp };
  fish.stress = Math.min(1, num(arrival.stress, 0, 1, 0.4) + (arrival.drip ? 0 : dumpShock(state, arrival.bagTemp, arrival.bagPh)));
  const q = state.quarantine;
  if (q) {
    q.fish.push(fish);
    q.since[fish.id] = state.hours;
  } else state.fish.push(fish);
  return fish;
}

/** 收到買的插枝。 */
export function receivePlants(state: TankState, item: Record<string, unknown>): boolean {
  const species = item.species as PlantSpeciesId;
  if (!(species in PLANT_SPECIES)) return false;
  addCuttings(state, species, Math.max(0, Math.min(50, Math.floor(num(item.count, 0, 50, 0)))));
  return true;
}

/** 上架插枝：先從手上拿走（放在架上），下架或沒賣掉再拿回來。 */
export function takeCuttingsForSale(state: TankState, species: PlantSpeciesId, count: number): boolean {
  const e = economy(state);
  // 寶箱來的插枝不能上架換錢（polish-to-9.md §4）
  if (count <= 0 || sellableCuttings(state, species) < count) return false;
  e.cuttings[species]! -= count;
  return true;
}
