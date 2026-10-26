import { addFish, type AddFishOptions } from './actions';
import { type Fish, type TankState } from './state';
import type { FishSpeciesId } from './species';

// 放進、移出檢疫盒：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/** 把檢疫盒裡還活著的魚移到主缸（指定 id 就只移那幾條）。死掉的直接清掉。回傳移了幾條。 */
export function releaseQuarantine(state: TankState, ids?: number[]): number {
  const q = state.quarantine;
  if (!q) return 0;
  const moving = q.fish.filter((f) => f.alive && (!ids || ids.includes(f.id)));
  for (const f of moving) {
    // 換缸也是一次緊迫（對水溫、水質）
    f.stress = Math.max(f.stress, 0.3);
    f.nursery = undefined;
    f.arrivedHours = state.hours;
    state.fish.push(f);
    delete q.since[f.id];
  }
  q.fish = q.fish.filter((f) => f.alive && !moving.includes(f));
  for (const id of Object.keys(q.since)) if (!q.fish.some((f) => f.id === Number(id))) delete q.since[Number(id)];
  return moving.length;
}

/** 買魚放進檢疫盒（沒有檢疫盒就直接放主缸）。 */
export function addFishToQuarantine(state: TankState, species: FishSpeciesId, options: AddFishOptions = {}): Fish {
  // 魚放進檢疫盒，主缸的養水期不會因此延長（addFish 會延，這裡還原）
  const delay = state.cycleDelay;
  const fish = addFish(state, species, options);
  const q = state.quarantine;
  if (!q) return fish;
  if (delay) state.cycleDelay = delay;
  else delete state.cycleDelay;
  state.fish = state.fish.filter((f) => f !== fish);
  q.fish.push(fish);
  q.since[fish.id] = state.hours;
  return fish;
}
