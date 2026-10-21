import { hourOfDay, type TankState } from '../sim';

/**
 * 燈的時間表（polish-to-9.md V2）：光束、焦散的強弱跟著燈走，不是開關兩段。
 * - 開燈後 1 小時慢慢亮起來（早上偏暖），中午最亮。
 * - 關燈前 1.5 小時漸暗、偏橘（傍晚）。
 * 回傳 level 0–1（乘在光束、焦散的透明度上）和 warm（-1 早上暖白、+1 傍晚橘、0 正中午）。
 */
export interface DayLight {
  level: number;
  /** 0 中性；>0 傍晚橘色；<0 早上暖白。 */
  warm: number;
}

const RAMP_UP_H = 1;
const RAMP_DOWN_H = 1.5;

export function dayLight(state: TankState): DayLight {
  const light = state.equipment.light;
  if (!light || light.photoperiodHours <= 0) return { level: 0, warm: 0 };
  const since = (((hourOfDay(state) - light.startHour) % 24) + 24) % 24;
  const left = light.photoperiodHours - since;
  if (left <= 0) return { level: 0, warm: 0 };
  const up = Math.min(1, since / RAMP_UP_H);
  const down = Math.min(1, left / RAMP_DOWN_H);
  // 中午比早晚亮一點
  const noon = 0.82 + 0.18 * Math.sin((Math.PI * since) / light.photoperiodHours);
  const level = Math.max(0, Math.min(1, Math.min(up, down) * noon));
  const warm = left < RAMP_DOWN_H ? 1 - left / RAMP_DOWN_H : since < RAMP_UP_H * 1.5 ? -(1 - since / (RAMP_UP_H * 1.5)) : 0;
  return { level, warm };
}

/**
 * 出水口的水平位置（0–1，缸寬的比例）：靠近出水口的水草擺得大一點。沒有過濾器回傳 null。
 * 跟 tank-view 畫設備的位置一致：外掛在右後方、圓桶的出水管在右邊、海綿在左邊冒泡。
 */
export function outletX(state: TankState): number | null {
  const id = state.equipment.filter?.spec.id;
  if (id === 'hangOn') return 0.86;
  if (id === 'canister') return 0.78;
  if (id === 'sponge') return 0.12;
  return null;
}

/** 水草擺動幅度的倍數：離出水口越近越大（0.75–1.9），過濾器關著時整缸都小。 */
export function flowNear(state: TankState, x: number): number {
  const on = !!state.equipment.filter?.on;
  const at = outletX(state);
  if (!on || at === null) return 0.35;
  const d = (x - at) / 0.28;
  return 0.75 + 1.15 * Math.exp(-d * d);
}
