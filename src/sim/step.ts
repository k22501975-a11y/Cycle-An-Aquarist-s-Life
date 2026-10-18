import { TICK_GAME_SECONDS } from './clock';
import { updateFauna } from './processes/fauna';
import { updateGases } from './processes/gases';
import { updateHardscape } from './processes/hardscape';
import { updateNitrogen } from './processes/nitrogen';
import { updatePlants } from './processes/plants';
import { updatePopulation } from './processes/population';
import { updateTemperature } from './processes/thermal';
import { updateWaste } from './processes/waste';
import { updateQuarantine } from './quarantine';
import { updateSnails } from './snails';
import { updateParental } from './parental';
import { updateEconomy } from './economy';
import { TEMP_LOG_HOURS, type TankState } from './state';

export const TICK_HOURS = TICK_GAME_SECONDS / 3600;

/** 推進一個 tick。順序：溫度 → 廢物分解 → 氮循環 → 水草 → 氣體與 pH → 生物 → 族群（成長、繁殖、混養）。 */
export function step(state: TankState, dtHours: number = TICK_HOURS): void {
  updateTemperature(state, dtHours);
  updateWaste(state, dtHours);
  updateHardscape(state, dtHours);
  updateNitrogen(state, dtHours);
  updatePlants(state, dtHours);
  updateGases(state, dtHours);
  updateFauna(state, dtHours);
  updatePopulation(state, dtHours);
  updateParental(state, dtHours);
  updateSnails(state, dtHours);
  updateQuarantine(state, dtHours);
  updateEconomy(state, dtHours);
  // 小時數由很多小 tick 累加，有浮點誤差，加一點點容差再取整
  const before = Math.floor(state.hours + 1e-6);
  state.hours += dtHours;
  if (Math.floor(state.hours + 1e-6) > before) logTemperature(state);
}

/** 溫度計每個整點記一筆（玩家隨時看得到溫度計，所以可以畫趨勢圖）。 */
function logTemperature(state: TankState): void {
  const log = (state.tempLog ??= []);
  log.push({ hours: Math.floor(state.hours + 1e-6), tempC: Math.round(state.water.tempC * 10) / 10 });
  if (log.length > TEMP_LOG_HOURS) log.splice(0, log.length - TEMP_LOG_HOURS);
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
