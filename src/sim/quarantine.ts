import { temperatureFactor } from './chemistry';
import { hasVisible, progressInfections, spreadInfections } from './processes/disease';
import { addFish, type AddFishOptions } from './actions';
import { recordEvent, type Fish, type TankState } from './state';
import type { FishSpeciesId } from './species';

/** 檢疫盒固定的水溫。 */
export const QUARANTINE_TEMP_C = 26;
/** 建議的觀察天數（expeditions-and-quarantine.md §1.3：魚、蝦 3 天）。 */
export const QUARANTINE_DAYS = 3;

export function buyQuarantine(state: TankState): void {
  state.quarantine ??= { fish: [], since: {}, antibiotic: 0, dewormer: 0, ichMedication: 0 };
}

/** 買魚放進檢疫盒（沒有檢疫盒就直接放主缸）。 */
export function addFishToQuarantine(state: TankState, species: FishSpeciesId, options: AddFishOptions = {}): Fish {
  const fish = addFish(state, species, options);
  const q = state.quarantine;
  if (!q) return fish;
  state.fish = state.fish.filter((f) => f !== fish);
  q.fish.push(fish);
  q.since[fish.id] = state.hours;
  return fish;
}

/** 在檢疫盒裡待了幾天。 */
export function quarantineDays(state: TankState, fish: Fish): number {
  const since = state.quarantine?.since[fish.id] ?? state.hours;
  return (state.hours - since) / 24;
}

/** 把檢疫盒裡還活著的魚移到主缸（指定 id 就只移那幾條）。死掉的直接清掉。回傳移了幾條。 */
export function releaseQuarantine(state: TankState, ids?: number[]): number {
  const q = state.quarantine;
  if (!q) return 0;
  const moving = q.fish.filter((f) => f.alive && (!ids || ids.includes(f.id)));
  for (const f of moving) {
    // 換缸也是一次緊迫（對水溫、水質）
    f.stress = Math.max(f.stress, 0.3);
    state.fish.push(f);
    delete q.since[f.id];
  }
  q.fish = q.fish.filter((f) => f.alive && !moving.includes(f));
  for (const id of Object.keys(q.since)) if (!q.fish.some((f) => f.id === Number(id))) delete q.since[Number(id)];
  return moving.length;
}

export type QuarantineMedicine = 'antibiotic' | 'dewormer' | 'ichMedication';

/** 在檢疫盒下藥（藥浴）：不影響主缸。 */
export function doseQuarantine(state: TankState, medicine: QuarantineMedicine): void {
  if (state.quarantine) state.quarantine[medicine] += 1;
}

/**
 * 檢疫盒的一個 tick：潛伏的病照樣發作、會在盒子裡互相傳染，但碰不到主缸。
 * 白點簡化：發作後一直掛在身上（蟲在盒子裡循環），下白點藥約一天半治好。
 */
export function updateQuarantine(state: TankState, dt: number): void {
  const q = state.quarantine;
  if (!q || q.fish.length === 0) return;
  const tf = temperatureFactor(QUARANTINE_TEMP_C);
  const living = q.fish.filter((f) => f.alive);
  for (const fish of living) {
    fish.ageDays = (fish.ageDays ?? 0) + (dt / 24) * Math.sqrt(tf);
    fish.hunger = 0.2;
    fish.stress += (0.1 - fish.stress) * (1 - Math.exp(-0.1 * dt));

    let damage = 0;
    let cause = '';
    if (fish.ich.stage === 'incubating') {
      fish.ich.progress += (dt / 72) * tf;
      if (fish.ich.progress >= 1) {
        fish.ich = { stage: 'visible', progress: 0 };
        recordEvent(state, { type: 'ich_visible', subjectId: fish.id });
      }
    } else if (fish.ich.stage === 'visible') {
      if (q.ichMedication > 0.05) {
        fish.ich.progress += dt / 36;
        if (fish.ich.progress >= 1) fish.ich = { stage: 'none', progress: 0 };
      } else {
        damage += 0.004;
        cause = 'ich';
      }
    }
    for (const d of progressInfections(state, fish, QUARANTINE_TEMP_C, q, dt)) {
      damage += d.amount;
      cause = d.cause;
    }
    if (damage > 0) fish.health -= damage * dt;
    else if (fish.ich.stage === 'none' && !hasVisible(fish)) fish.health = Math.min(1, fish.health + 0.01 * dt);
    if (fish.health <= 0) {
      fish.health = 0;
      fish.alive = false;
      recordEvent(state, { type: 'fish_died', subjectId: fish.id, cause: cause || 'unknown' });
    }
  }
  spreadInfections(state, living, dt, 2);
  const decay = Math.exp(-0.01 * dt);
  q.antibiotic *= decay;
  q.dewormer *= decay;
  q.ichMedication *= decay;
}

/** 檢疫盒裡有沒有正在發病的魚。 */
export function quarantineSick(state: TankState): Fish[] {
  return (state.quarantine?.fish ?? []).filter((f) => f.alive && (f.ich.stage === 'visible' || hasVisible(f)));
}


