import { temperatureFactor } from './chemistry';
import { hasVisible, progressInfections, spreadInfections } from './processes/disease';
import { giveBirth } from './processes/population';
import { growFish } from './growth';
import { FISH_SPECIES } from './species';
import { addFish, type AddFishOptions } from './actions';
import { isJuvenile, recordEvent, type Fish, type TankState } from './state';
import type { FishSpeciesId } from './species';

/** 檢疫盒固定的水溫。 */
export const QUARANTINE_TEMP_C = 26;
/** 檢疫盒當產卵盒時放幾條小魚還不算擠。 */
export const BOX_CAPACITY = 25;
/** 建議的觀察天數（expeditions-and-quarantine.md §1.3：魚、蝦 3 天）。 */
export const QUARANTINE_DAYS = 3;

export function buyQuarantine(state: TankState): void {
  state.quarantine ??= { fish: [], since: {}, antibiotic: 0, dewormer: 0, ichMedication: 0 };
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

/**
 * 主缸裡的成魚嘴巴最大吞得下多長的魚（cm）；沒有會吃小魚的成魚是 0。
 * 盒裡的仔魚要長得比這個大，放回主缸才不會被吃（#174）。
 */
export function swallowCm(state: TankState): number {
  return state.fish.filter((f) => f.alive && !isJuvenile(f) && FISH_SPECIES[f.species].mouthRatio > 0).reduce((m, f) => Math.max(m, f.lengthCm * FISH_SPECIES[f.species].mouthRatio), 0);
}

/** 盒裡的這尾還太小：放回主缸會被成魚吞掉。 */
export function tooSmallForTank(state: TankState, fish: Fish): boolean {
  return isJuvenile(fish) && fish.lengthCm <= swallowCm(state);
}

/**
 * 可以移到主缸的：活著、沒發病、長得夠大；店裡買來的新魚還要觀察滿 QUARANTINE_DAYS 天。
 * 盒裡生的、從主缸撈進來的仔魚不用觀察（本來就是這缸的），只看大小。
 */
export function readyForTank(state: TankState, fish: Fish): boolean {
  if (!fish.alive || fish.ich.stage === 'visible' || hasVisible(fish) || fish.health < 0.5) return false;
  if (tooSmallForTank(state, fish)) return false;
  return (fish.generation ?? 0) >= 1 || quarantineDays(state, fish) >= QUARANTINE_DAYS;
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
    f.nursery = undefined;
    state.fish.push(f);
    delete q.since[f.id];
  }
  q.fish = q.fish.filter((f) => f.alive && !moving.includes(f));
  for (const id of Object.keys(q.since)) if (!q.fish.some((f) => f.id === Number(id))) delete q.since[Number(id)];
  return moving.length;
}

/**
 * 把缸裡的魚撈進檢疫盒。快生的母魚放進來就是產卵盒：盒子掛在缸裡，仔魚生下來會掉到隔間，
 * 不會被成魚吃掉；長大一點再放回主缸或分到別缸（design/mvp.md §4.3）。
 */
export function moveToQuarantine(state: TankState, fishId: number): boolean {
  const q = state.quarantine;
  const fish = state.fish.find((f) => f.id === fishId && f.alive);
  if (!q || !fish) return false;
  state.fish = state.fish.filter((f) => f !== fish);
  fish.nursery = undefined;
  q.fish.push(fish);
  q.since[fish.id] = state.hours;
  return true;
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
    // 盒子掛在主缸裡，仔魚吃的是同一缸水，照常長大；盒子小，放超過 BOX_CAPACITY 條就擠
    if (fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm) growFish(state, fish, tf, living.length / BOX_CAPACITY, dt);
    const breeding = FISH_SPECIES[fish.species].breeding;
    if (fish.pregnancy > 0 && breeding) {
      fish.pregnancy += (dt / 24 / breeding.gestationDays) * Math.sqrt(tf);
      if (fish.pregnancy >= 1) {
        fish.pregnancy = 0;
        const fry = giveBirth(state, fish, state.fish.length + q.fish.length);
        state.fish = state.fish.filter((f) => !fry.includes(f));
        for (const f of fry) {
          q.fish.push(f);
          q.since[f.id] = state.hours;
        }
      }
    }
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
      recordEvent(state, { type: 'fish_died', subjectId: fish.id, cause: cause || 'unknown', value: QUARANTINE_TEMP_C });
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


