import type { Fish } from './state';
import { personalitySpec } from './personality';

/** 誰先吃到：開機用不到，分出來讓開機少載一點。 */
/** 手指餵食：飼料落點附近的魚，誰會先吃到。distance 是魚到落點的距離（畫面單位）。 */
export function firstEater<T extends { fish: Pick<Fish, 'id' | 'personality' | 'alive'>; distance: number }>(candidates: T[]): T | null {
  let best: T | null = null;
  let bestTime = Infinity;
  for (const c of candidates) {
    if (!c.fish.alive) continue;
    // 到達時間 = 距離 ÷ 速度；貪吃的衝得快，膽小的慢吞吞
    const time = c.distance / personalitySpec(c.fish).feedRush;
    if (time < bestTime) {
      bestTime = time;
      best = c;
    }
  }
  return best;
}
