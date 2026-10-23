import { dripShock, type DripOutcome } from './drip';
import { farmHabit, releaseShock } from './acclimation';
import { co2Equilibrium, oxygenSaturation } from './chemistry';
import { delayCycleForNewFish, filterBacteriaShare } from './processes/nitrogen';
import { infect, STORE_DISEASE_CHANCE } from './processes/disease';
import { lookIndex, phenotype, storeGenome, type FinTrait } from './genetics';
import { createFish } from './processes/population';
import { roomTemperature } from './processes/thermal';
import { addFood, DEFAULT_FOOD, type FoodGrade, type FoodKind } from './food';
import { nextRandom } from './random';
import { economy } from './economy';
import { plantHitchhikers } from './snails';
import { FISH_SPECIES, PLANT_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import type { FilterSpec, HardscapeSpec, SubstrateSpec } from './equipment';
import { onHardscapeAdded, onHardscapeRemoved } from './aquascape';
import { testWater, type TestKitReading } from './readings';
import { NEWBIE_HEALTHY_DAYS, noteAct, recordEvent, TEST_LOG_MAX, type DiseaseKind, type Fish, type Plant, type TankState } from './state';

/** 投餵飼料（mg）。沒指定就是標準的漂浮薄片；吃不完的會腐敗。 */
export function feed(state: TankState, mg: number, kind: FoodKind = DEFAULT_FOOD.kind, grade: FoodGrade = DEFAULT_FOOD.grade): void {
  addFood(state.water, kind, grade, Math.max(0, mg));
  if (mg > 0) state.lastFedHours = state.hours;
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
  // 換水時順便補滿水位（不算每日小事的「補水」）
  fillUp(state, options.tempC);
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
  water.gh = mix(water.gh ?? tap.gh ?? 6, tap.gh ?? 6);
  water.o2 = mix(water.o2, oxygenSaturation(newTemp));
  water.co2 = mix(water.co2, Math.max(tap.co2, co2Equilibrium(newTemp)));
  water.medication = mix(water.medication, 0);
  water.antibiotic = mix(water.antibiotic ?? 0, 0);
  water.dewormer = mix(water.dewormer ?? 0, 0);
  if (water.copper) water.copper = mix(water.copper, 0);
  water.ichPathogen = mix(water.ichPathogen, 0);
  water.ichCysts *= 1 - f * 0.3;
  // 換水時順便虹吸底砂，帶走部分殘餌與髒污。
  water.foodMg *= 1 - f * 0.8;
  water.organicMg *= 1 - f * 0.5;
  state.lastWaterChangeHours = state.hours;
}

/**
 * 補水：用自來水（已除氯）把蒸發掉的水補回滿水位。
 * 蒸發只帶走水，所以補水會稀釋濃縮了的氨、亞硝酸鹽、藥，KH 和硝酸鹽則往自來水靠。
 * 回傳補了幾公升。
 */
export function topUp(state: TankState, tempC?: number): number {
  const add = fillUp(state, tempC);
  if (add > 0) noteAct(state, 'topup');
  return add;
}

function fillUp(state: TankState, tempC?: number): number {
  const { water, environment, equipment } = state;
  const volume = equipment.tank.volumeL;
  const level = water.levelL ?? volume;
  const add = volume - level;
  if (add <= 0.001) {
    water.levelL = undefined;
    return 0;
  }
  const keep = level / volume;
  const fresh = 1 - keep;
  const tap = environment.tap;
  const newTemp = tempC ?? roomTemperature(state);
  water.kh = water.kh * keep + tap.kh * fresh;
  water.gh = (water.gh ?? tap.gh ?? 6) * keep + (tap.gh ?? 6) * fresh;
  water.no3 = water.no3 * keep + tap.no3 * fresh;
  water.tan *= keep;
  water.no2 *= keep;
  water.medication *= keep;
  water.antibiotic = (water.antibiotic ?? 0) * keep;
  water.dewormer = (water.dewormer ?? 0) * keep;
  if (water.copper) water.copper *= keep;
  water.tempC = water.tempC * keep + newTemp * fresh;
  water.levelL = undefined;
  return add;
}

/** 用測試劑測水：讀數記下來，狀態列顯示最近一次測到的值（沒測過就顯示「?」）。 */
export function useTestKit(state: TankState): TestKitReading {
  const reading = testWater(state);
  state.lastTest = { hours: state.hours, reading };
  const log = (state.testLog ??= []);
  log.push({ hours: state.hours, reading });
  if (log.length > TEST_LOG_MAX) log.splice(0, log.length - TEST_LOG_MAX);
  return reading;
}

/**
 * 清洗濾材。用自來水洗會讓氯殺死大部分硝化菌（新手常犯的錯）；用換出來的缸水洗才安全。
 */
export function rinseFilterMedia(state: TankState, withWater: 'tap' | 'tank'): void {
  const share = filterBacteriaShare(state);
  const survival = withWater === 'tap' ? 0.05 : 0.9;
  if (withWater === 'tank') noteAct(state, 'rinse');
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
  /** 不指定時隨機。 */
  sex?: 'male' | 'female';
  /** 店家母魚是否已經懷孕／抱卵。不指定時依機率決定。 */
  pregnant?: boolean;
  /** 店家母魚懷孕到哪（商店卡上看得到的那尾，storeFemales）；有給就算懷孕了。 */
  pregnancy?: number;
  /** 孔雀魚品系（GUPPY_STRAINS 的索引）。不指定時隨機。 */
  strain?: number;
  /** 鰭型品系（GUPPY_FIN_STRAINS）。 */
  fin?: FinTrait;
  /**
   * 慢慢滴水對水（預設）；false 是直接倒進缸裡，水質差很多會休克（design/acclimation.md §2）；
   * 玩過對水小遊戲就傳結果（drip.ts），照剩下的差距和魚被嚇到的程度算休克。
   */
  drip?: boolean | DripOutcome;
  /** 帶著哪些潛伏的病（柱狀病、鰓吸蟲）。不指定時依店家機率決定。 */
  carries?: DiseaseKind[];
}

/** 店裡的母魚、母蝦已經懷孕的機率：孔雀魚母魚跟公魚養在一起，買回來的大多已經懷孕（design/mvp.md §4.6）。 */
const STORE_PREGNANT_CHANCE: Partial<Record<FishSpeciesId, number>> = { guppy: 0.9, cherry_shrimp: 0.2, crystal_shrimp: 0.15 };
/** 店裡已懷孕的母魚懷孕到哪裡（0–1，1 就生）。 */
const PREGNANT_FROM = 0.3;
const PREGNANT_TO = 0.9;
/** 店裡一個品系今天有幾尾母魚可挑（#335）。 */
const STORE_FEMALES = 4;
/** 店裡一定有一尾「快生了」的（#335：開局挑快生的，第一窩 ≤ 第 10 天）：25°C 約 6～8 天後生，新缸也差不多養好水了。 */
const STORE_DUE_FROM = 0.7;
const STORE_DUE_TO = 0.78;
/** 商店母魚卡「快生了」的門檻（midgame.md §6.6，徽章 ui/pregnancy-badge.ts 用同一個）：店裡最大的那尾一定在這以上。 */
export const PREGNANCY_DUE = 0.7;

/**
 * 店裡這個品系今天的母魚懷孕到哪（#335），大的在前：每天換一批，一定有一尾快生了，其他的還沒。
 * 只看日子和品系（不動缸的亂數），商店卡、推薦組合、一鍵買看到的都一樣。
 */
export function storeFemales(hours: number, strain: number): number[] {
  const rng = { seed: Math.floor(hours / 24) * 7919 + strain * 104729 + 17 };
  const out = [STORE_DUE_FROM + (STORE_DUE_TO - STORE_DUE_FROM) * nextRandom(rng)];
  // 其他幾尾都還沒到快生（快生的那尾最早生）
  while (out.length < STORE_FEMALES) out.push(PREGNANT_FROM + (STORE_DUE_FROM - PREGNANT_FROM) * nextRandom(rng));
  return out.sort((a, b) => b - a);
}


/** 店家魚帶白點蟲的機率：教學一次買一公兩母，沒檢疫時約 27% 會帶進來（polish-to-9.md §4：前 30 天 ≤ 1/3）。 */
const STORE_ICH_CHANCE = 0.1;

/** 放入新魚。剛運輸過來的魚處於緊迫狀態。 */
export function addFish(state: TankState, species: FishSpeciesId, options: AddFishOptions = {}): Fish {
  const carries =
    FISH_SPECIES[species].susceptibleToIch && (options.carriesIch ?? nextRandom(state.rng) < STORE_ICH_CHANCE);
  const sp = FISH_SPECIES[species];
  const fish: Fish = createFish(state, species, {
    sex: options.sex,
    stress: 0.5,
    hunger: 0.3,
    lengthCm: sp.adultLengthCm * (0.9 + 0.1 * nextRandom(state.rng)),
    // 店裡賣的是剛長大到幾個月大的魚
    ageDays: sp.daysToAdult * (1 + 0.6 * nextRandom(state.rng)),
    ich: carries ? { stage: 'incubating', progress: 0, cause: 'new_fish' } : { stage: 'none', progress: 0 },
  });
  if (species === 'guppy') fish.genome = storeGenome(state.rng, fish.sex, options.strain, options.fin);
  // 店裡的魚習慣魚場的水；直接倒進差很多的缸會休克
  fish.acclimated = farmHabit(species);
  const drip = options.drip ?? true;
  const shock = typeof drip === 'boolean' ? releaseShock(state, fish.acclimated, drip) : dripShock(state, fish.acclimated, drip);
  fish.stress = Math.min(1, fish.stress + shock.stress);
  if (shock.harm > 0) {
    fish.health = Math.max(0.01, fish.health - shock.harm);
    fish.recentDamage.ph_shock = shock.harm;
  }
  fish.lineage = fish.id;
  fish.generation = 0;
  fish.inbreeding = 0;
  if (fish.sex === 'female' && sp.breeding) {
    const pregnant = options.pregnancy !== undefined || (options.pregnant ?? nextRandom(state.rng) < (STORE_PREGNANT_CHANCE[species] ?? 0));
    if (pregnant) {
      // 店家挑來賣的是看得出懷孕的母魚（懷孕後半段才有胎斑），所以起點落在 0.3～0.9：買回來 3～20 天內生第一胎。
      // 以前 0.05～0.9，兩條母魚都要等快 3 週才生的種子約 1/5，新手任務「母魚懷孕」和第 60 天收入都卡在運氣上
      // 商店卡上挑的那尾照卡上的（亂數照樣擲，後面的順序不變）
      const rolled = PREGNANT_FROM + (PREGNANT_TO - PREGNANT_FROM) * nextRandom(state.rng);
      fish.pregnancy = options.pregnancy ?? rolled;
      // 在店裡跟同品系的公魚配過
      // 鰭型品系在店裡是用帶因的正常公魚配的（緞帶、燕尾公魚配不了）
      if (fish.genome) {
        const fin = options.fin === 'sword' || options.fin === 'dumbo' || options.fin === 'halfmoon' ? options.fin : undefined;
        const sire = storeGenome(state.rng, 'male', options.strain ?? lookIndex(phenotype(fish.genome)), fin);
        if (options.fin === 'swallow') sire.swallow = [1, 0];
        fish.sire = { genome: sire, lineage: -fish.id, inbreeding: 0 };
      }
    }
  }
  // 指定不帶白點（carriesIch: false）視為確認過健康的魚，也不帶其他病
  const rolled = options.carries ?? (options.carriesIch === false ? [] : (Object.keys(STORE_DISEASE_CHANCE) as DiseaseKind[]).filter((k) => nextRandom(state.rng) < STORE_DISEASE_CHANCE[k]));
  // 新手期照樣擲骰（亂數順序不變），只是不帶病
  const carried = options.carries === undefined && state.hours < NEWBIE_HEALTHY_DAYS * 24 ? [] : rolled;
  for (const kind of carried) infect(fish, kind);
  // 還在養水、氨不歸零時放魚：魚撐得住，但養水期多 1 天（polish-to-9.md §4）
  delayCycleForNewFish(state);
  fish.arrivedHours = state.hours;
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

/** 在店裡買一株水草種下：可能夾帶扁卷螺（整個存檔第一次買必定，次數記在共用錢包；見 plantHitchhikers）。不含付錢。 */
export function buyPlant(state: TankState, species: PlantSpeciesId): Plant {
  const plant = addPlant(state, species);
  const e = economy(state);
  const first = (e.plantBuys ?? 0) === 0;
  e.plantBuys = (e.plantBuys ?? 0) + 1;
  plantHitchhikers(state, first);
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
  if (cuttings > 0) state.lastTrimHours = state.hours;
  return cuttings;
}

/** 下白點藥（一份標準劑量）。只殺游走期的蟲；對蝦有毒。 */
export function doseIchMedication(state: TankState, doses = 1): void {
  state.water.medication += doses;
}

/** 下抗生素：治柱狀病，但也會殺掉一部分硝化菌。 */
export function doseAntibiotic(state: TankState, doses = 1): void {
  state.water.antibiotic = (state.water.antibiotic ?? 0) + doses;
}

/** 下驅蟲藥：治鰓吸蟲，對蝦和硝化菌安全。 */
export function doseDewormer(state: TankState, doses = 1): void {
  state.water.dewormer = (state.water.dewormer ?? 0) + doses;
}

export function setHeaterTarget(state: TankState, targetC: number): void {
  if (state.equipment.heater) state.equipment.heater.targetC = targetC;
}

/** 拔掉卡住的加熱棒插頭：停止加熱，但加熱棒還是壞的，要換一支。 */
export function unplugHeater(state: TankState): void {
  const heater = state.equipment.heater;
  if (!heater) return;
  heater.stuckOn = false;
  if (heater.broken) heater.heating = false;
}

export function setPowerOut(state: TankState, out: boolean): void {
  if (state.environment.powerOut === out) return;
  state.environment.powerOut = out;
  recordEvent(state, { type: out ? 'power_out' : 'power_restored' });
}

/**
 * 換底材：要把魚撈出來、拆缸重鋪。底砂裡的細菌和髒污跟著翻出來，魚也會很緊迫。
 */
export function replaceSubstrate(state: TankState, spec: SubstrateSpec): void {
  const share = 0.15;
  state.bacteria.aob *= 1 - share;
  state.bacteria.nob *= 1 - share;
  state.water.organicMg += 30 * (state.equipment.tank.volumeL / 40);
  for (const f of state.fish) if (f.alive) f.stress = Math.max(f.stress, 0.6);
  state.equipment.substrate = { spec, sinceHours: state.hours, buffer: 1 };
}

/** 放一組造景石或沉木。 */
export function addHardscape(state: TankState, spec: HardscapeSpec): void {
  (state.equipment.hardscape ??= []).push(spec);
  onHardscapeAdded(state);
}

/** 拿出一組造景石或沉木（同種的拿最後放的那組）。 */
export function removeHardscape(state: TankState, id: string): void {
  const list = state.equipment.hardscape ?? [];
  const i = list.map((x) => x.id).lastIndexOf(id);
  if (i < 0) return;
  const before = [...list];
  list.splice(i, 1);
  onHardscapeRemoved(state, i, before);
}
