import { PLANT_PRICES, price } from './economy';
import { growthStage } from './growth';
import { isShrimpSpecies, PLANT_SPECIES, type PlantSpeciesId } from './species';
import type { TankState } from './state';

/**
 * 第二個缸的用途（design/polish-to-9.md G4）：第二缸開出來（約第 21 天）要有新的玩法壓力，不能只是多一個一樣的缸。
 * 開缸卡建議兩種用途擇一，都用現有的系統：
 * - 繁殖缸：快生的母魚、小魚移過來，大魚吃不到；放育幼盒、多種密草，小魚養大交訂單。
 * - 展示缸：換水草燈（再加 CO₂ 更好），種陽性草，做一個好看的造景。
 * 選了以後，目標串多一個這個用途的目標（goals.ts），缸沒取名的話就叫「繁殖缸」「展示缸」。
 */

export type TankPurpose = NonNullable<TankState['purpose']>;

/** 開缸卡上建議買的東西：price 是現在的店價；required 是這個用途一定要的，其他是之後再加。 */
export interface PurposeItem {
  /** 商店的價格鍵（PRICES）或水草（plant:id）。 */
  key: string;
  label: string;
  price: number;
  required: boolean;
}

export interface PurposeSpec {
  id: TankPurpose;
  /** 卡片標題。 */
  title: string;
  /** 一句話：這缸拿來做什麼、有什麼新目標。 */
  pitch: string;
  /** 缸還沒取名時給的名字。 */
  label: string;
  items: PurposeItem[];
}

/** 陽性草（要強光）：展示缸要種的。 */
export const HIGH_LIGHT_PLANTS = (Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).filter((id) => PLANT_SPECIES[id].lightType === 'high');

const plant = (id: PlantSpeciesId, required: boolean): PurposeItem => ({ key: `plant:${id}`, label: PLANT_SPECIES[id].name, price: PLANT_PRICES[id], required });
const gear = (key: string, label: string, required: boolean): PurposeItem => ({ key, label, price: price(key), required });

export const TANK_PURPOSES: Record<TankPurpose, PurposeSpec> = {
  breeding: {
    id: 'breeding',
    title: '繁殖缸',
    pitch: '快生的母魚和小魚搬過來，大魚吃不到。小魚養大，拿去交訂單。',
    label: '繁殖缸',
    items: [gear('nursery:box', '育幼盒', true), plant('moss', true)],
  },
  display: {
    id: 'display',
    title: '展示缸',
    pitch: '換上水草燈，種陽性草，做一缸好看的造景。加 CO₂ 長得更快。',
    label: '展示缸',
    items: [gear('light:planted', '水草燈', true), plant('glosso', true), plant('rotala', true), gear('substrate:soil', '水草泥', false), gear('co2:diy', 'CO₂ 鋼瓶組', false)],
  },
};

/** 這套用途一定要買的東西合計多少錢（開缸卡顯示「再花約 N 元」）。 */
export function purposeCost(purpose: TankPurpose): number {
  return TANK_PURPOSES[purpose].items.filter((i) => i.required).reduce((a, i) => a + i.price, 0);
}

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

/** 有這個用途的缸。 */
export function purposeTanks(tanks: TankState[], purpose: TankPurpose): TankState[] {
  return tanks.filter((t) => t.purpose === purpose);
}

/** 繁殖缸裡養大（長到轉色期）的自家小魚有幾尾。 */
export function breedingTankRaised(tanks: TankState[]): number {
  return purposeTanks(tanks, 'breeding').reduce(
    (n, t) => n + t.fish.filter((f) => f.alive && (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && ['coloring', 'subadult', 'adult'].includes(growthStage(f))).length,
    0,
  );
}

/** 展示缸裡正在長的陽性草有幾株（一缸算最多的那缸）。 */
export function displayTankHighPlants(tanks: TankState[]): number {
  return Math.max(0, ...purposeTanks(tanks, 'display').map((t) => t.plants.filter((p) => HIGH_LIGHT_PLANTS.includes(p.species) && p.growthRate > 0).length));
}
