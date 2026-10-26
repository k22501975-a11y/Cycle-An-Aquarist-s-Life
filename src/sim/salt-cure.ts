import { setHeaterTarget } from './actions';
import { economy, price } from './economy';
import { isShrimpSpecies } from './species';
import type { TankState } from './state';

/**
 * 白點的便宜治法（mvp.md §4.4.6 g33：危機過後連 3 天買不起 150 元的白點藥）：水溫調到 30°C、加一點粗鹽（20 元），
 * 現實裡常用。約 7 天治好（藥是 4 天左右），蝦怕鹽不能用。鹽不會自己退；療程中換水照換掉的量補鹽（同一包），
 * 療程結束後換水才沖淡。白點斷根後加熱棒自動調回原本的溫度。
 */
export const SALT_HEAT_C = 30;
/** 水裡的鹽還有多少算有效（一份是 1，換掉一半的水剩 0.5）。 */
export const SALT_WORKING = 0.5;
/** 粗鹽療程的天數（任務卡說「約 7 天會好」）。 */
export const SALT_DAYS = 7;
/** 療程最長幾天：還沒斷根也調回原本的溫度，免得一直開在 30°C。 */
const SALT_MAX_DAYS = 14;

/** 這缸現在能不能用粗鹽治白點（沒有蝦、有魚長白點、還沒在治、加熱棒是好的、買得起）。說為什麼不行的 saltRefusal 在 salt-treat.ts（只有面板用，不放開機必載）。 */
export function canSalt(t: TankState): boolean {
  const heater = t.equipment.heater;
  return !t.fish.some((f) => f.alive && isShrimpSpecies(f.species)) && t.fish.some((f) => f.alive && f.ich.stage === 'visible') && !saltWorking(t) && !!heater && !heater.broken && economy(t).coins >= price('med:salt');
}

/** 正在用粗鹽治、水裡的鹽還夠。 */
export function saltWorking(t: TankState): boolean {
  return !!t.saltTreat && (t.water.salt ?? 0) >= SALT_WORKING;
}

/** 這缸正在用粗鹽治白點，照療程還要大約幾天；沒在治、或已經超過 SALT_DAYS 天還沒斷根回 0。 */
export function saltDaysLeft(t: TankState): number {
  if (!t.saltTreat) return 0;
  return Math.max(0, Math.ceil(SALT_DAYS - (t.hours - t.saltTreat.hours) / 24));
}

/** 每個 tick：白點斷根（魚身上、皮下、水裡、底砂都沒了）或療程太久，加熱棒調回原本的溫度。 */
export function updateSaltCure(t: TankState): void {
  const cure = t.saltTreat;
  if (!cure) return;
  const clean = t.fish.every((f) => !f.alive || f.ich.stage === 'none') && t.water.ichPathogen < 0.01 && t.water.ichCysts < 0.01;
  if (!clean && t.hours - cure.hours < SALT_MAX_DAYS * 24) return;
  setHeaterTarget(t, cure.prevC);
  delete t.saltTreat;
}
