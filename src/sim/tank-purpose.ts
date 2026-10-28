import { economy, PLANT_PRICES, price, raisedBred } from './economy';
import { PLANT_SPECIES, type PlantSpeciesId } from './species';
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

/** 有這個用途的缸。 */
export function purposeTanks(tanks: TankState[], purpose: TankPurpose): TankState[] {
  return tanks.filter((t) => t.purpose === purpose);
}

/**
 * 在繁殖缸裡養大（長到轉色期）過的自家魚累計幾尾：之後搬走、賣掉、交單都不扣（g39c #449：住不下的推薦把轉色的大魚搬走，
 * 進度從 5/10 倒回 3/10 停了 50 天）。整點才記，還沒記到的照現在缸裡的算。
 */
export function breedingTankRaised(tanks: TankState[]): number {
  const unseen = purposeTanks(tanks, 'breeding').reduce((n, t) => n + t.fish.filter((f) => !f.breedingSeen && raisedBred(f)).length, 0);
  return (economy(tanks[0]).breedingRaisedEver ?? 0) + unseen;
}

/** 展示缸裡正在長的陽性草有幾株（一缸算最多的那缸）。 */
export function displayTankHighPlants(tanks: TankState[]): number {
  return Math.max(0, ...purposeTanks(tanks, 'display').map((t) => t.plants.filter((p) => HIGH_LIGHT_PLANTS.includes(p.species) && p.growthRate > 0).length));
}
