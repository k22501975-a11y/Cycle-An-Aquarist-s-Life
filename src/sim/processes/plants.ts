import { temperatureFactor } from '../chemistry';
import { PLANT_SPECIES, type PlantSpecies } from '../species';
import { isLightOn, recordEvent, type Plant, type TankState } from '../state';
import { substrateNutrientBoost } from './hardscape';
import { plantLight } from '../aquascape';
import { noteCoverDay, overgrown } from './population';

/** 每 g 新長出的水草（濕重）吸收的氮（mg）。 */
const NITROGEN_PER_G = 3;
/** 每 g 光合作用產物對應的氧氣產量與 CO₂ 消耗（mg）。 */
const O2_PER_G = 110;
const CO2_PER_G = 150;
/** 水草低於此重量即死亡。 */
const MIN_BIOMASS_G = 0.2;
/** 長太密（覆蓋 > 80%）的缸，關燈時每小時多耗掉的溶氧（mg/L，polish-to-9.md §13.3）：晚上氧氣條多扣一小段。 */
export const OVERGROWN_NIGHT_O2 = 0.1;
/** 長太密每這麼久（遊戲小時）化掉一片老葉，氨小幅上升。 */
export const OVERGROWN_MELT_HOURS = 7 * 24;
export const OVERGROWN_MELT_TAN = 0.1;

/** 長太密的代價（§13.3）：晚上搶氧，每 7 天一片老葉化掉（氨 +0.1）。不修剪不會出大事，只是小代價一直在。 */
function overgrowthCost(state: TankState, dt: number): void {
  if (!overgrown(state)) return;
  if (!isLightOn(state)) state.water.o2 = Math.max(0, state.water.o2 - OVERGROWN_NIGHT_O2 * dt);
  const before = state.overgrownHours ?? 0;
  state.overgrownHours = before + dt;
  if (Math.floor(state.overgrownHours / OVERGROWN_MELT_HOURS) > Math.floor(before / OVERGROWN_MELT_HOURS)) state.water.tan += OVERGROWN_MELT_TAN;
}

/** 目前照到水草的光照強度（PAR）。藻類越多，遮光越嚴重。 */
export function currentPar(state: TankState): number {
  if (!isLightOn(state)) return 0;
  return state.equipment.light!.spec.par * (1 - 0.4 * state.algae);
}

/** 可用氮（氨氮優先，其次硝酸鹽）對生長的限制係數 0–1。 */
function nitrogenFactor(state: TankState): number {
  const n = state.water.tan + state.water.no3;
  return n / (n + 1);
}

interface PlantRates {
  /** 光合作用總產量（每小時、相對生物量）。 */
  gross: number;
  /** 呼吸消耗（每小時、相對生物量）。 */
  respiration: number;
  /** 限制生長的因子（最短板）。 */
  limiter: number;
}

export function plantRates(state: TankState, plant: Plant, par: number): PlantRates {
  const sp = PLANT_SPECIES[plant.species];
  const lightF = Math.min(1, par / sp.lightSaturationPar) * (1 - 0.7 * plant.leafAlgae);
  const co2F = state.water.co2 / (state.water.co2 + sp.co2HalfSaturation);
  const limiter = Math.min(lightF, co2F, nitrogenFactor(state));
  // 呼吸作用日夜都在進行，大小與補償點成正比：越需要光的草，光不夠時消耗越快。
  const respiration = sp.maxGrowthPerHour * (sp.compensationPar / sp.lightSaturationPar) * 0.25;
  return {
    // 陽性草多半是根部吸收型，吃得到底土養分；綁在石頭上的陰性草吃不到
    gross: sp.maxGrowthPerHour * limiter * temperatureFactor(state.water.tempC) * (sp.lightType === 'high' ? substrateNutrientBoost(state) : 1),
    respiration: respiration * temperatureFactor(state.water.tempC),
    limiter,
  };
}

export function updatePlants(state: TankState, dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  const par = currentPar(state);
  let vigor = 0;
  noteCoverDay(state);
  overgrowthCost(state, dt);

  for (const plant of state.plants) {
    const sp = PLANT_SPECIES[plant.species];
    // 種在石頭、沉木陰影下的草照到的光比較少（造景擺放，aquascape.ts）
    const litPar = par * plantLight(state, plant);
    const { gross, respiration } = plantRates(state, plant, litPar);
    // 生物量超過上限兩倍後就長不動了（要修剪）。
    const crowding = Math.max(0, 1 - plant.biomassG / (sp.maxBiomassG * 2));
    const net = gross * crowding - respiration;
    // 以一天為尺度的平均淨生長率：白天長、晚上呼吸，要看整天的收支。
    plant.growthRate += (net - plant.growthRate) * (1 - Math.exp(-dt / 24));

    const grossG = plant.biomassG * gross * crowding * dt;
    const respG = plant.biomassG * respiration * dt;
    const deltaG = grossG - respG;

    if (deltaG > 0) {
      takeNitrogen(state, (deltaG * NITROGEN_PER_G) / volume);
      vigor += deltaG / dt;
    }
    plant.biomassG += deltaG;
    if (plant.growthRate < 0) {
      // 長期入不敷出就會溶葉：爛掉的葉子變成有機廢物，之後分解成氨。
      const melted = plant.biomassG * -plant.growthRate * dt;
      plant.biomassG -= melted;
      water.organicMg += melted * 1000;
    }

    water.o2 += ((grossG - respG) * O2_PER_G) / volume;
    water.co2 = Math.max(0, water.co2 - ((grossG - respG) * CO2_PER_G) / volume);

    updateLeafAlgae(plant, sp, litPar, dt);
  }

  for (const plant of state.plants) {
    if (plant.biomassG < MIN_BIOMASS_G) {
      water.organicMg += plant.biomassG * 1000;
      recordEvent(state, { type: 'plant_died', subjectId: plant.id });
    }
  }
  state.plants = state.plants.filter((p) => p.biomassG >= MIN_BIOMASS_G);
  updateAlgae(state, par, vigor, dt);
}

function takeNitrogen(state: TankState, mgPerL: number): void {
  const { water } = state;
  const fromTan = Math.min(water.tan, mgPerL);
  water.tan -= fromTan;
  water.no3 = Math.max(0, water.no3 - (mgPerL - fromTan));
}

/** 陰性草放在超過耐受度的強光下，葉面會長藻。 */
function updateLeafAlgae(plant: Plant, sp: PlantSpecies, par: number, dt: number): void {
  const excess = Math.max(0, par - sp.lightTolerancePar) / sp.lightTolerancePar;
  plant.leafAlgae += (0.004 * excess * (1 - plant.leafAlgae) - 0.001 * plant.leafAlgae) * dt;
  plant.leafAlgae = Math.min(1, Math.max(0, plant.leafAlgae));
}

/**
 * 缸內藻類：光照越強、養分越多越容易長；水草長得好時會搶走光和養分，壓制藻類。
 * vigor 是水草每小時新增的生物量（g）。
 */
function updateAlgae(state: TankState, par: number, vigor: number, dt: number): void {
  const n = state.water.tan + state.water.no3;
  const nutrients = n / (n + 5);
  const competition = Math.min(0.95, vigor / 0.01);
  const growth = 0.012 * (par / 100) * nutrients * (1 - competition) * (1 - state.algae);
  state.algae = Math.min(1, Math.max(0, state.algae + (growth - 0.003 * state.algae) * dt));
}
