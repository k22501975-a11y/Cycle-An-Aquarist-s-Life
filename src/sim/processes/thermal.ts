import { chance, nextRandom } from '../random';
import { hourOfDay, isLightOn, recordEvent, type TankState } from '../state';

/** 加熱棒每小時故障機率（約一年壞一次）。 */
const HEATER_FAILURE_PER_HOUR = 1 / (365 * 24);
/** 故障中「卡住一直加熱」的比例（比不加熱少見，但會把魚煮熟）。 */
const HEATER_STUCK_ON_SHARE = 0.25;

/** 水位低於這個比例時，加熱棒可能露出水面。 */
export const HEATER_EXPOSED_LEVEL = 0.8;

/** 室溫一天內的變化：下午最熱、清晨最冷，振幅依季節（預設 ±1.5°C）。 */
export function roomTemperature(state: TankState): number {
  const h = hourOfDay(state);
  return state.environment.roomTempC + (state.environment.roomSwingC ?? 1.5) * Math.cos((2 * Math.PI * (h - 15)) / 24);
}

/** 目前水量（L）。 */
export function waterLevelL(state: TankState): number {
  return state.water.levelL ?? state.equipment.tank.volumeL;
}

function fanRunning(state: TankState): boolean {
  return !!state.equipment.fan?.on && !state.environment.powerOut;
}

/**
 * 蒸發（temperature.md §4）：沒開風扇時一週約蒸發 1% 的水，越熱越快，開風扇會快好幾倍。
 * 水蒸發了，溶在水裡的東西還在，所以濃度變高（KH、硝酸鹽、氨、亞硝酸鹽、藥）。
 */
function evaporate(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;
  const level = waterLevelL(state);
  const tempFactor = Math.max(0.3, 1 + (water.tempC - 25) * 0.06);
  const fan = fanRunning(state) ? equipment.fan!.spec.evaporationFactor : 1;
  const lossL = ((volume * 0.01) / 168) * tempFactor * fan * dt;
  const next = Math.max(volume * 0.5, level - lossL);
  if (next >= level) return;
  const k = level / next;
  water.kh *= k;
  if (water.gh !== undefined) water.gh *= k;
  water.no3 *= k;
  water.tan *= k;
  water.no2 *= k;
  water.medication *= k;
  if (water.antibiotic) water.antibiotic *= k;
  if (water.dewormer) water.dewormer *= k;
  if (water.copper) water.copper *= k;
  water.levelL = next;
}

/** 加熱棒故障：多數是不再加熱，約四分之一是恆溫器卡住、一直加熱。 */
export function breakHeater(state: TankState): void {
  const heater = state.equipment.heater;
  if (!heater || heater.broken) return;
  heater.broken = true;
  heater.stuckOn = nextRandom(state.rng) < HEATER_STUCK_ON_SHARE;
  recordEvent(state, { type: heater.stuckOn ? 'heater_stuck' : 'heater_broke' });
}

/** 燈具發熱：開燈時水溫往「室溫 + 燈熱」靠。小缸水少，被燈烤得比較熱。 */
export function lightHeatC(state: TankState): number {
  const light = state.equipment.light;
  if (!light || !isLightOn(state)) return 0;
  return (light.spec.heatC ?? 0) * Math.cbrt(40 / state.equipment.tank.volumeL);
}

export function updateTemperature(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;

  // 小缸散熱快、水溫變化大。風扇靠蒸發把水溫壓到比室溫低一點。
  const lossRate = 0.08 * Math.cbrt(40 / volume);
  const fanCooling = fanRunning(state) ? equipment.fan!.spec.coolingC : 0;
  water.tempC += (roomTemperature(state) + lightHeatC(state) - fanCooling - water.tempC) * (1 - Math.exp(-lossRate * dt));

  const heater = equipment.heater;
  const powered = !state.environment.powerOut;
  const level = waterLevelL(state) / volume;
  if (heater && !heater.broken && powered) {
    // 恆溫器：低於目標 0.2°C 開，達到目標關。
    if (water.tempC < heater.targetC - 0.2) heater.heating = true;
    else if (water.tempC >= heater.targetC) heater.heating = false;
    if (chance(state.rng, HEATER_FAILURE_PER_HOUR, dt)) breakHeater(state);
  }
  if (heater) {
    if (heater.broken) heater.heating = !!heater.stuckOn && powered;
    else if (!powered) heater.heating = false;
    // 控溫器：水溫超過上限就切斷加熱棒電源（不管加熱棒自己的恆溫器有沒有壞）
    const controller = equipment.controller;
    if (controller && heater.heating) {
      if (water.tempC >= controller.maxC) {
        heater.heating = false;
        if (!controller.tripped) {
          controller.tripped = true;
          recordEvent(state, { type: 'controller_cut' });
        }
      }
    }
    if (controller?.tripped && water.tempC < controller.maxC - 1) controller.tripped = false;
    // 水位太低，加熱棒露出水面空燒會壞掉
    if (heater.heating && !heater.broken && level < HEATER_EXPOSED_LEVEL && chance(state.rng, 0.1, dt)) {
      heater.broken = true;
      heater.stuckOn = false;
      heater.heating = false;
      recordEvent(state, { type: 'heater_exposed' });
    }
    if (heater.heating) {
      // 1 W ≈ 0.86 kcal/h，1 kcal 讓 1 L 水升溫 1°C。
      water.tempC += ((heater.spec.watts * 0.86) / volume) * dt;
    }
  }

  // 冷水機：高於目標 0.3°C 開始製冷，降到目標就停
  const chiller = equipment.chiller;
  if (chiller) {
    if (!chiller.on || !powered) chiller.cooling = false;
    else if (water.tempC > chiller.targetC + 0.3) chiller.cooling = true;
    else if (water.tempC <= chiller.targetC) chiller.cooling = false;
    if (chiller.cooling) water.tempC -= ((chiller.spec.coolingWatts * 0.86) / volume) * dt;
  }

  evaporate(state, dt);

  // 水溫移動平均（時間常數約 3 小時），用來偵測「驟變」。
  water.tempAvgC += (water.tempC - water.tempAvgC) * (1 - Math.exp(-dt / 3));
}
