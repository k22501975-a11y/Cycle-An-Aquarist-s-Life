import { TICK_GAME_SECONDS } from './clock';
import { updateFauna } from './processes/fauna';
import { updateGases } from './processes/gases';
import { updateNitrogen } from './processes/nitrogen';
import { updatePlants } from './processes/plants';
import { updateTemperature } from './processes/thermal';
import { updateWaste } from './processes/waste';
import type { TankState } from './state';

export const TICK_HOURS = TICK_GAME_SECONDS / 3600;

/** 推進一個 tick。順序：溫度 → 廢物分解 → 氮循環 → 水草 → 氣體與 pH → 生物。 */
export function step(state: TankState, dtHours: number = TICK_HOURS): void {
  updateTemperature(state, dtHours);
  updateWaste(state, dtHours);
  updateNitrogen(state, dtHours);
  updatePlants(state, dtHours);
  updateGases(state, dtHours);
  updateFauna(state, dtHours);
  state.hours += dtHours;
}

/** 連續模擬一段遊戲時間（以 tick 為單位），可選擇每個整點呼叫 onHour。 */
export function simulate(state: TankState, hours: number, onHour?: (state: TankState) => void): void {
  const ticks = Math.round(hours / TICK_HOURS);
  const ticksPerHour = Math.round(1 / TICK_HOURS);
  for (let i = 1; i <= ticks; i++) {
    step(state);
    if (onHour && i % ticksPerHour === 0) onHour(state);
  }
}
