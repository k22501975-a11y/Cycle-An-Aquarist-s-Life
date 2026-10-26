import { setHeaterTarget } from './actions';
import { economy, price, spend } from './economy';
import { SALT_HEAT_C, saltWorking } from './salt-cure';
import { isShrimpSpecies } from './species';
import type { TankState } from './state';

/* 粗鹽治白點的按鈕（設備面板用）：說為什麼不能用、真的加鹽。跟 salt-cure.ts 分開，字串不放開機必載（canSalt 是同一組條件）。 */

/** 為什麼現在不能用粗鹽治白點；可以回 null。 */
export function saltRefusal(t: TankState): string | null {
  if (t.fish.some((f) => f.alive && isShrimpSpecies(f.species))) return '缸裡有蝦，蝦怕鹽，不能用';
  if (!t.fish.some((f) => f.alive && f.ich.stage === 'visible')) return '沒有魚身上有白點';
  if (saltWorking(t)) return '已經在用粗鹽治了';
  const heater = t.equipment.heater;
  if (!heater || heater.broken) return '要加熱棒把水溫調到 30°C，先把加熱棒弄好';
  if (economy(t).coins < price('med:salt')) return `粗鹽要 ${price('med:salt')} 元`;
  return null;
}

/** 把鹽補到一份、加熱棒調到 30°C（花 20 元），回傳做了沒。 */
export function saltIchCure(t: TankState): boolean {
  if (saltRefusal(t) || !spend(t, price('med:salt'))) return false;
  // 已經在療程中（鹽被沖淡過）就照舊算天數，原本的溫度不變
  t.saltTreat ??= { hours: t.hours, prevC: t.equipment.heater!.targetC };
  // 水裡還有上次留下的鹽就補到一份，不疊上去
  t.water.salt = Math.max(t.water.salt ?? 0, 1);
  setHeaterTarget(t, SALT_HEAT_C);
  return true;
}

