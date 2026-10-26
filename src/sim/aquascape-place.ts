import { tankSize } from './equipment';
import { noteAct, type TankState } from './state';
import { clampPlacement, disturb, type Disturbance, ensurePlacements, hardscapeSizeCm, NONE, type Placement, plantPlacement } from './aquascape';

// 造景模式裡移動、翻面、換層、縮放：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/** 擺放第 index 組石頭或沉木：拖曳、換層、翻轉、縮放。 */
export function placeHardscape(state: TankState, index: number, change: Partial<Omit<Placement, 'seed'>>): Disturbance {
  const list = state.equipment.hardscape ?? [];
  if (index < 0 || index >= list.length) return NONE;
  const all = ensurePlacements(state);
  const before = all[index];
  const after = clampPlacement({ ...before, ...change });
  all[index] = after;
  if (after.x !== before.x || after.layer !== before.layer || after.flip !== before.flip || after.scale !== before.scale) state.lastScapeHours = state.hours;
  const size = hardscapeSizeCm(list[index]);
  const movedCm = Math.abs(after.x - before.x) * tankSize(state.equipment.tank).w;
  // 每日小事分得出是搬位置、換層、翻面還是縮放
  if (movedCm > 1) noteAct(state, 'scapeMove');
  if (after.layer !== before.layer) noteAct(state, 'scapeLayer');
  if (!!after.flip !== !!before.flip) noteAct(state, 'scapeFlip');
  if ((after.scale ?? 1) !== (before.scale ?? 1)) noteAct(state, 'scapeScale');
  const moved = movedCm > 1 || after.layer !== before.layer;
  // 寶箱開到、剛從手上放進缸的那塊（這個小時內）：還拿在手上慢慢放下去，不會攪起底沙嚇到魚（daily-loop.md §3）
  const placed = state.dailyActs?.scapePlace;
  if (moved && index === list.length - 1 && placed !== undefined && state.hours - placed < 1) return disturb(state, 0.05, 0);
  if (!moved) {
    // 翻面、換角度：拿起來轉一下，攪起一點點沙
    return after.flip !== before.flip || after.scale !== before.scale ? disturb(state, 0.05, 0.25) : NONE;
  }
  // 越大塊、搬越遠，攪起的沙越多
  const bulk = (size.w * size.h * (after.scale ?? 1)) / (10 * 8);
  const amount = Math.min(0.6, 0.18 + 0.2 * bulk * Math.min(1, movedCm / 20 + (after.layer !== before.layer ? 0.5 : 0)));
  return disturb(state, amount, 0.45);
}

/** 把一叢水草移到別的位置（拔起來重種）：攪起的沙少，但剛種下要重新紮根。 */
export function placePlant(state: TankState, plantId: number, change: Partial<Omit<Placement, 'seed'>>): Disturbance {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return NONE;
  const before = plantPlacement(plant);
  const after = clampPlacement({ ...before, ...change, scale: undefined });
  plant.place = after;
  if (Math.abs(after.x - before.x) < 0.01 && after.layer === before.layer && after.flip === before.flip) return NONE;
  state.lastScapeHours = state.hours;
  noteAct(state, 'scapePlant');
  if (after.layer !== before.layer) noteAct(state, 'scapeLayer');
  // 拔起來重種：掉一些葉子，攪起一點點沙；動作小，不會嚇到魚（daily-loop.md §3：做小事不能讓魚受驚）
  plant.biomassG *= 0.95;
  return disturb(state, 0.06, 0);
}
