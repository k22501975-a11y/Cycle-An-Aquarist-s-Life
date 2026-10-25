import { chance, nextRandom } from '../random';
import { hourOfDay, isLightOn, NEWBIE_HEALTHY_DAYS, recordEvent, type TankState } from '../state';

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

/** 一支加熱棒壞了之後，幾天內不會再壞第二支（現實裡同時壞兩支很少見，mvp.md §4.4.6）。 */
export const HEATER_FAILURE_GAP_DAYS = 7;
/** 臨時保溫時散熱剩幾成。 */
export const INSULATED_LOSS_SHARE = 0.5;

/** 加熱棒故障：多數是不再加熱，約四分之一是恆溫器卡住、一直加熱。 */
export function breakHeater(state: TankState): void {
  const heater = state.equipment.heater;
  if (!heater || heater.broken) return;
  heater.broken = true;
  if (state.economy) state.economy.heaterBrokeHours = state.hours;
  heater.stuckOn = nextRandom(state.rng) < HEATER_STUCK_ON_SHARE;
  recordEvent(state, { type: heater.stuckOn ? 'heater_stuck' : 'heater_broke' });
}

/** 燈具發熱：開燈時水溫往「室溫 + 燈熱」靠。小缸水少，被燈烤得比較熱。 */
export function lightHeatC(state: TankState): number {
  const light = state.equipment.light;
  if (!light || !isLightOn(state)) return 0;
  return (light.spec.heatC ?? 0) * Math.cbrt(40 / state.equipment.tank.volumeL);
}

/** 調了加熱棒目標後，恆溫器每小時最多走幾度（一天約 2°C，升溫治白點、孕期加溫都不會一天差到 ICH_SWING_C）。 */
export const HEATER_RAMP_C_PER_HOUR = 0.08;

/** 恆溫器現在照的溫度：往 targetC 走 dt 小時，走到了就拿掉 setpointC。 */
function heaterSetpoint(heater: NonNullable<TankState['equipment']['heater']>, dt: number): number {
  if (heater.setpointC === undefined) return heater.targetC;
  const step = HEATER_RAMP_C_PER_HOUR * dt;
  const gap = heater.targetC - heater.setpointC;
  if (Math.abs(gap) <= step) {
    delete heater.setpointC;
    return heater.targetC;
  }
  heater.setpointC += Math.sign(gap) * step;
  return heater.setpointC;
}

/** 每小時往室溫靠多少（比例）：小缸散熱快。 */
const baseLossRate = (volumeL: number) => 0.08 * Math.cbrt(40 / volumeL);

/** 加熱棒一直開著時，水溫最多能比室溫高幾度（加熱和散熱打平；#404 挑撐得住的便宜加熱棒用）。 */
export function heaterLiftC(volumeL: number, watts: number): number {
  return (watts * 0.86) / volumeL / baseLossRate(volumeL);
}

/**
 * 新裝的加熱棒正在把水慢慢加熱（g33：剛裝好、水還在升溫，任務卡卻寫「水溫偏低，檢查加熱棒」，腳本亂按白點藥）：
 * 加熱棒是好的、有電，水溫低於 minC，而且照室溫最低點一直開著撐得過 minC。回傳約幾小時回到加熱棒設的溫度（撐不到設定就照撐得到的），
 * 不是在升溫、或撐不住（真的要處理）回 null。照 updateTemperature 一樣的散熱、恆溫器慢慢調高（setpointC）一小時一小時算。
 */
export function heaterWarmup(state: TankState, minC: number): { hours: number; toC: number } | null {
  const { water, equipment, environment } = state;
  const heater = equipment.heater;
  if (!heater || heater.broken || heater.stuckOn || environment.powerOut || water.tempC >= minC) return null;
  const volume = equipment.tank.volumeL;
  const lift = heaterLiftC(volume, heater.spec.watts);
  if (environment.roomTempC - (environment.roomSwingC ?? 1.5) + lift < minC) return null;
  const toC = Math.min(heater.targetC, environment.roomTempC + lift - 0.5);
  const loss = 1 - Math.exp(-baseLossRate(volume));
  const gain = (heater.spec.watts * 0.86) / volume;
  let t = water.tempC;
  let set = heater.setpointC ?? heater.targetC;
  for (let h = 1; h <= 24 * 10; h++) {
    set = Math.min(heater.targetC, set + HEATER_RAMP_C_PER_HOUR);
    t += (environment.roomTempC - t) * loss;
    if (t < set - 0.2) t += gain;
    if (t >= toC - 0.3) return { hours: h, toC: Math.round(toC) };
  }
  return null;
}

export function updateTemperature(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;

  // 小缸散熱快、水溫變化大。風扇靠蒸發把水溫壓到比室溫低一點。
  // 臨時保溫（包毛巾、泡溫水瓶）時散熱減半（mvp.md §4.4.6）
  const insulated = (state.insulatedUntil ?? -1) > state.hours;
  const lossRate = baseLossRate(volume) * (insulated ? INSULATED_LOSS_SHARE : 1);
  const fanCooling = fanRunning(state) ? equipment.fan!.spec.coolingC : 0;
  water.tempC += (roomTemperature(state) + lightHeatC(state) - fanCooling - water.tempC) * (1 - Math.exp(-lossRate * dt));

  const heater = equipment.heater;
  const powered = !state.environment.powerOut;
  const level = waterLevelL(state) / volume;
  if (heater && !heater.broken && powered) {
    // 恆溫器：低於目標 0.2°C 開，達到目標關。調過目標時照慢慢走的 setpointC。
    const set = heaterSetpoint(heater, dt);
    if (water.tempC < set - 0.2) heater.heating = true;
    else if (water.tempC >= set) heater.heating = false;
    // 新手期照樣擲骰（亂數順序不變），只是不會壞
    // 一支壞了之後 HEATER_FAILURE_GAP_DAYS 天內不會再壞第二支（全家共用的錢包記著，mvp.md §4.4.6）
    const lastBroke = state.economy?.heaterBrokeHours;
    const spaced = lastBroke === undefined || state.hours - lastBroke >= HEATER_FAILURE_GAP_DAYS * 24;
    if (chance(state.rng, HEATER_FAILURE_PER_HOUR, dt) && state.hours >= NEWBIE_HEALTHY_DAYS * 24 && spaced) breakHeater(state);
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
