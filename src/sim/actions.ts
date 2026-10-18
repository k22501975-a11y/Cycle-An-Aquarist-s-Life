import { co2Equilibrium, oxygenSaturation } from './chemistry';
import { filterBacteriaShare } from './processes/nitrogen';
import { roomTemperature } from './processes/thermal';
import { nextRandom } from './random';
import { FISH_SPECIES, PLANT_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import type { FilterSpec } from './equipment';
import { recordEvent, type Fish, type Plant, type TankState } from './state';

/** 投餵飼料（mg）。吃不完的會沉底腐敗。 */
export function feed(state: TankState, mg: number): void {
  state.water.foodMg += Math.max(0, mg);
}

export interface WaterChangeOptions {
  /** 新水溫度；不指定時用室溫（沒對水溫）。 */
  tempC?: number;
}

/**
 * 換水：用自來水（已除氯）取代 fraction 比例的缸水。
 * 會稀釋氨、亞硝酸鹽、硝酸鹽與藥物，補回 KH；新水溫度與缸水差太多會讓魚緊迫。
 */
export function waterChange(state: TankState, fraction: number, options: WaterChangeOptions = {}): void {
  const f = Math.min(1, Math.max(0, fraction));
  const { water, environment } = state;
  const tap = environment.tap;
  const newTemp = options.tempC ?? roomTemperature(state);
  const mix = (oldValue: number, newValue: number) => oldValue * (1 - f) + newValue * f;

  water.tempC = mix(water.tempC, newTemp);
  water.tan = mix(water.tan, 0);
  water.no2 = mix(water.no2, 0);
  water.no3 = mix(water.no3, tap.no3);
  water.kh = mix(water.kh, tap.kh);
  water.o2 = mix(water.o2, oxygenSaturation(newTemp));
  water.co2 = mix(water.co2, Math.max(tap.co2, co2Equilibrium(newTemp)));
  water.medication = mix(water.medication, 0);
  water.ichPathogen = mix(water.ichPathogen, 0);
  water.ichCysts *= 1 - f * 0.3;
  // 換水時順便虹吸底砂，帶走部分殘餌與髒污。
  water.foodMg *= 1 - f * 0.8;
  water.organicMg *= 1 - f * 0.5;
}

/**
 * 清洗濾材。用自來水洗會讓氯殺死大部分硝化菌（新手常犯的錯）；用換出來的缸水洗才安全。
 */
export function rinseFilterMedia(state: TankState, withWater: 'tap' | 'tank'): void {
  const share = filterBacteriaShare(state);
  const survival = withWater === 'tap' ? 0.05 : 0.9;
  const keep = 1 - share * (1 - survival);
  state.bacteria.aob *= keep;
  state.bacteria.nob *= keep;
}

/** 更換過濾器：新濾材是空的，舊濾材上的細菌全部失去。 */
export function replaceFilter(state: TankState, spec: FilterSpec | null): void {
  const keep = 1 - filterBacteriaShare(state);
  state.bacteria.aob *= keep;
  state.bacteria.nob *= keep;
  state.equipment.filter = spec ? { spec, on: true } : null;
}

export interface AddFishOptions {
  /** 新魚是否帶有白點蟲（未檢疫的店家魚有一定機率）。不指定時依機率決定。 */
  carriesIch?: boolean;
}

/** 店家魚帶白點蟲的機率。 */
const STORE_ICH_CHANCE = 0.25;

/** 放入新魚。剛運輸過來的魚處於緊迫狀態。 */
export function addFish(state: TankState, species: FishSpeciesId, options: AddFishOptions = {}): Fish {
  const carries =
    FISH_SPECIES[species].susceptibleToIch && (options.carriesIch ?? nextRandom(state.rng) < STORE_ICH_CHANCE);
  const fish: Fish = {
    id: state.nextId++,
    species,
    alive: true,
    health: 1,
    stress: 0.5,
    hunger: 0.3,
    starvingHours: 0,
    ich: carries ? { stage: 'incubating', progress: 0 } : { stage: 'none', progress: 0 },
    constitution: 0.85 + 0.3 * nextRandom(state.rng),
    recentDamage: {},
    corpseMg: 0,
  };
  state.fish.push(fish);
  return fish;
}

/** 撈出所有死魚，回傳撈出的數量。 */
export function removeDeadFish(state: TankState): number {
  const before = state.fish.length;
  state.fish = state.fish.filter((f) => f.alive);
  return before - state.fish.length;
}

export function addPlant(state: TankState, species: PlantSpeciesId, biomassG = PLANT_SPECIES[species].cuttingMassG * 2): Plant {
  const plant: Plant = { id: state.nextId++, species, biomassG, leafAlgae: 0, growthRate: 0 };
  state.plants.push(plant);
  return plant;
}

/**
 * 修剪水草：長超過上限的部分剪下成插枝，可以種回缸裡或拿去賣、送朋友。
 * 回傳剪下的插枝數量。
 */
export function trimPlant(state: TankState, plantId: number): number {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return 0;
  const sp = PLANT_SPECIES[plant.species];
  const keep = sp.maxBiomassG * 0.5;
  const cuttings = Math.max(0, Math.floor((plant.biomassG - keep) / sp.cuttingMassG));
  plant.biomassG -= cuttings * sp.cuttingMassG;
  return cuttings;
}

/** 下白點藥（一份標準劑量）。只殺游走期的蟲；對蝦有毒。 */
export function doseIchMedication(state: TankState, doses = 1): void {
  state.water.medication += doses;
}

export function setHeaterTarget(state: TankState, targetC: number): void {
  if (state.equipment.heater) state.equipment.heater.targetC = targetC;
}

export function setPowerOut(state: TankState, out: boolean): void {
  if (state.environment.powerOut === out) return;
  state.environment.powerOut = out;
  recordEvent(state, { type: out ? 'power_out' : 'power_restored' });
}
