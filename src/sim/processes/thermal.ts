import { chance, nextRandom } from '../random';
import { hourOfDay, isLightOn, recordEvent, type TankState } from '../state';

/** 加熱棒每小時故障機率（約一年壞一次）。 */
const HEATER_FAILURE_PER_HOUR = 1 / (365 * 24);
/** 故障中「卡住一直加熱」的比例（比不加熱少見，但會把魚煮熟）。 */
const HEATER_STUCK_ON_SHARE = 0.25;

/** 室溫一天內的變化：下午最熱、清晨最冷，振幅 ±1.5°C。 */
export function roomTemperature(state: TankState): number {
  const h = hourOfDay(state);
  return state.environment.roomTempC + 1.5 * Math.cos((2 * Math.PI * (h - 15)) / 24);
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

  // 小缸散熱快、水溫變化大。
  const lossRate = 0.08 * Math.cbrt(40 / volume);
  water.tempC += (roomTemperature(state) + lightHeatC(state) - water.tempC) * (1 - Math.exp(-lossRate * dt));

  const heater = equipment.heater;
  const powered = !state.environment.powerOut;
  if (heater && !heater.broken && powered) {
    // 恆溫器：低於目標 0.2°C 開，達到目標關。
    if (water.tempC < heater.targetC - 0.2) heater.heating = true;
    else if (water.tempC >= heater.targetC) heater.heating = false;
    if (chance(state.rng, HEATER_FAILURE_PER_HOUR, dt)) breakHeater(state);
  }
  if (heater) {
    if (heater.broken) heater.heating = !!heater.stuckOn && powered;
    else if (!powered) heater.heating = false;
    if (heater.heating) {
      // 1 W ≈ 0.86 kcal/h，1 kcal 讓 1 L 水升溫 1°C。
      water.tempC += ((heater.spec.watts * 0.86) / volume) * dt;
    }
  }

  // 水溫移動平均（時間常數約 3 小時），用來偵測「驟變」。
  water.tempAvgC += (water.tempC - water.tempAvgC) * (1 - Math.exp(-dt / 3));
}
