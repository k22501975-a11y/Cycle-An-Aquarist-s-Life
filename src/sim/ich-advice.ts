import { type TankState } from './state';
import { ichDropDays, ICH_MED_WORKING, ICH_MED_TAIL_DAYS, treatingIch } from './next-step';

/** 開機用不到，分出來讓開機少載一點（docs/performance-budget.md）。 */
/** 治白點中換掉這麼多水，藥會不會被沖淡到撐不到白點掉（換水時提醒要補藥，#384）。 */
export function changeDilutesIch(t: TankState, fraction: number): boolean {
  if (!treatingIch(t)) return false;
  const med = t.water.medication * (1 - fraction);
  return med < ICH_MED_WORKING || Math.log(med / ICH_MED_WORKING) / 0.01 / 24 < ichDropDays(t, true, true) + ICH_MED_TAIL_DAYS;
}
