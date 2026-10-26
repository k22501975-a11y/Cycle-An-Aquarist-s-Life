import { noteAct, type TankState } from './state';
import { type PestKind, PESTS } from './snails';

// 抓螺、收陷阱、撈死螺：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/** 收陷阱：放了 8 小時以上才有用，一次抓走一批小螺。回傳抓了幾隻；沒放回傳 -1。 */
export function collectTrap(state: TankState): number {
  const s = state.snails;
  if (!s || s.trapHour === undefined) return -1;
  const hours = state.hours - s.trapHour;
  s.trapHour = undefined;
  const share = Math.min(0.45, Math.max(0, (hours - 2) / 14) * 0.45);
  let caught = 0;
  for (const k of Object.keys(PESTS) as PestKind[]) {
    const n = Math.floor(s.pests[k] * share);
    s.pests[k] -= n;
    caught += n;
  }
  const young = Math.floor(s.appleYoung * share * 0.5);
  s.appleYoung -= young;
  return caught + young;
}

/** 手撈：只抓得到看得見的（馬來螺白天躲在沙裡）。回傳抓了幾隻。 */
export function catchPests(state: TankState, lightsOn: boolean): number {
  // 撈到 0 隻也算撈過一次（今天的小事「撈一次小螺」，g23）
  noteAct(state, 'pests');
  const s = state.snails;
  if (!s) return 0;
  let caught = 0;
  for (const k of Object.keys(PESTS) as PestKind[]) {
    const share = k === 'mts' ? (lightsOn ? 0.05 : 0.25) : 0.25;
    const n = Math.floor(s.pests[k] * share);
    s.pests[k] -= n;
    caught += n;
  }
  return caught;
}

/** 撈出死掉的大螺。回傳撈了幾隻。 */
export function removeDeadSnails(state: TankState): number {
  const s = state.snails;
  if (!s) return 0;
  const dead = s.snails.filter((x) => !x.alive).length;
  s.snails = s.snails.filter((x) => x.alive);
  if (dead > 0) noteAct(state, 'deadSnail');
  return dead;
}
