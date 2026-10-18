import { chance } from '../random';
import { hourOfDay, recordEvent, type TankState } from '../state';

/** 加熱棒每小時故障機率（約一年壞一次）。 */
const HEATER_FAILURE_PER_HOUR = 1 / (365 * 24);

/** 室溫一天內的變化：下午最熱、清晨最冷，振幅 ±1.5°C。 */
export function roomTemperature(state: TankState): number {
  const h = hourOfDay(state);
  return state.environment.roomTempC + 1.5 * Math.cos((2 * Math.PI * (h - 15)) / 24);
}

export function updateTemperature(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;

  // 小缸散熱快、水溫變化大。
  const lossRate = 0.08 * Math.cbrt(40 / volume);
  water.tempC += (roomTemperature(state) - water.tempC) * (1 - Math.exp(-lossRate * dt));

  const heater = equipment.heater;
  if (heater && !heater.broken && !state.environment.powerOut) {
    // 恆溫器：低於目標 0.2°C 開，達到目標關。
    if (water.tempC < heater.targetC - 0.2) heater.heating = true;
    else if (water.tempC >= heater.targetC) heater.heating = false;
    if (heater.heating) {
      // 1 W ≈ 0.86 kcal/h，1 kcal 讓 1 L 水升溫 1°C。
      water.tempC += ((heater.spec.watts * 0.86) / volume) * dt;
    }
    if (chance(state.rng, HEATER_FAILURE_PER_HOUR, dt)) {
      heater.broken = true;
      heater.heating = false;
      recordEvent(state, { type: 'heater_broke' });
    }
  } else if (heater) {
    heater.heating = false;
  }

  // 水溫移動平均（時間常數約 3 小時），用來偵測「驟變」。
  water.tempAvgC += (water.tempC - water.tempAvgC) * (1 - Math.exp(-dt / 3));
}
