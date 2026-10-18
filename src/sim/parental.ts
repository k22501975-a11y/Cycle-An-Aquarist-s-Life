import { nextRandom, chance } from './random';
import { createFish } from './processes/population';
import { tankHabit } from './acclimation';
import { FISH_SPECIES, type FishSpeciesId } from './species';
import { isJuvenile, recordEvent, type Fish, type TankState } from './state';

/**
 * 親魚護幼（market-and-breeding.md §1.3.3）：短鯛母魚在洞穴裡產卵，卵孵化、仔魚會游以後，
 * 母魚轉成鮮黃加黑紋的護幼色，帶著一群仔魚在缸底巡邏，有魚靠近就衝過去趕走。
 * 母魚的護幼值看水質穩不穩、缸裡吵不吵；太低時會把卵或仔魚吃掉（新手第一窩常這樣）。
 */

export type BroodStage = 'eggs' | 'wigglers' | 'free';

export interface Brood {
  stage: BroodStage;
  /** 進入這個階段的遊戲小時。 */
  hour: number;
  /** 卵或仔魚有幾尾（卵、仔魚還在洞裡時用這個數；游出來後就是真的 Fish）。 */
  count: number;
  /** 護幼值 0–1：越穩越安靜越高，太低會吃掉小孩。 */
  care: number;
}

/** 會在洞穴產卵、母魚護幼的魚種。 */
export const CAVE_SPAWNERS: FishSpeciesId[] = ['apisto'];

/** 卵約 3 天孵化，仔魚在洞裡吸卵黃 4 天，游出來後母魚帶約 4 週。 */
export const EGG_HOURS = 24 * 3;
export const WIGGLER_HOURS = 24 * 4;
export const GUARD_HOURS = 24 * 26;
/** pH 高於這個不產卵。 */
export const BREED_PH_MAX = 7.6;
/** 護幼值低於這個就可能吃掉小孩。 */
export const CARE_EAT_THRESHOLD = 0.3;

export function isCaveSpawner(species: FishSpeciesId): boolean {
  return CAVE_SPAWNERS.includes(species);
}

/** 缸裡有沒有可以產卵的洞穴：石縫、沉木下面（hardscape.md）。 */
export function hasCave(state: TankState): boolean {
  return (state.equipment.hardscape?.length ?? 0) > 0;
}

/** 正在帶小孩（仔魚已經游出來）的母魚。 */
export function isGuarding(fish: Fish): boolean {
  return fish.alive && fish.brood?.stage === 'free';
}

/** 這尾仔魚的媽媽還在帶牠嗎。 */
export function guardianOf(state: TankState, fish: Fish): Fish | null {
  if (fish.guardian === undefined) return null;
  const mom = state.fish.find((f) => f.id === fish.guardian);
  return mom && isGuarding(mom) ? mom : null;
}

/** 護幼期間會被趕的魚：不是自己的小孩、也不是同種的公魚以外（公魚守外圍）。 */
function intruders(state: TankState, mother: Fish): Fish[] {
  return state.fish.filter((f) => f.alive && f !== mother && f.guardian !== mother.id && !isJuvenile(f) && f.species !== 'cherry_shrimp');
}

/** 照顧得好不好的原因（給面板和事件用）。 */
export type CareIssue = 'noisy' | 'water' | 'stress';

export interface CareReport {
  target: number;
  issue: CareIssue | null;
}

/** 護幼值會往哪裡走：水質驟變、缸裡魚多、母魚緊迫都會拉低。 */
export function careTarget(state: TankState, mother: Fish): CareReport {
  const w = state.water;
  const sudden = Math.max(0, Math.abs(w.tempC - w.tempAvgC) - 0.8) / 2 + Math.max(0, Math.abs(w.ph - w.phAvg) - 0.25) / 0.5;
  const others = intruders(state, mother).filter((f) => f.species !== mother.species).length;
  const noise = Math.min(0.6, others * 0.08);
  const stress = Math.max(0, mother.stress - 0.25) * 1.2;
  const penalties: Array<[CareIssue, number]> = [
    ['water', Math.min(0.8, sudden)],
    ['noisy', noise],
    ['stress', stress],
  ];
  // 第一次當媽媽比較容易慌（現實：新手母魚第一窩常吃掉）
  const firstTime = (mother.broodsRaised ?? 0) === 0 ? 0.15 : 0;
  const total = penalties.reduce((a, [, v]) => a + v, 0) + firstTime;
  const worst = penalties.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { target: Math.max(0, Math.min(1, 0.95 - total)), issue: worst[1] > 0.12 ? worst[0] : null };
}

/** 短鯛的性別比例跟水溫有關：水溫高公魚多（現實，進階玩家的操作）。 */
export function maleChance(tempC: number): number {
  return Math.min(0.9, Math.max(0.1, 0.5 + (tempC - 26) * 0.12));
}

/**
 * 每小時：還沒產卵的母魚看條件產卵，正在護幼的推進階段、更新護幼值和護幼色。
 * 在族群更新（population）之後呼叫。
 */
export function updateParental(state: TankState, dt: number): void {
  const living = state.fish.filter((f) => f.alive);
  for (const mother of living) {
    if (!isCaveSpawner(mother.species) || mother.sex !== 'female') continue;
    // 護幼色慢慢變：帶小孩時半天轉黃，不帶時一兩天褪回來
    const want = mother.brood ? 1 : 0;
    mother.broodColor = (mother.broodColor ?? 0) + Math.max(-dt / 36, Math.min(dt / 12, want - (mother.broodColor ?? 0)));
    if (mother.brood) tendBrood(state, mother, dt);
    else trySpawn(state, mother, living, dt);
  }
  // 媽媽不在了（死了、被移走、帶完了）的仔魚就自己長
  for (const f of state.fish) {
    if (f.guardian === undefined) continue;
    if (!guardianOf(state, f)) f.guardian = undefined;
    // 媽媽帶到有生物膜、微生物的地方吃：不用玩家另外餵仔魚飼料
    else if (f.alive) f.hunger = Math.max(0, f.hunger - 0.012 * dt);
  }
}

function trySpawn(state: TankState, mother: Fish, living: Fish[], dt: number): void {
  const sp = FISH_SPECIES[mother.species];
  if (isJuvenile(mother) || !sp.breeding || !hasCave(state)) return;
  const male = living.some((f) => f.species === mother.species && f.sex === 'male' && !isJuvenile(f));
  // 上一窩還沒長大離開前不會再產（現實：會把上一窩趕走，這裡簡化成等它們離巢）
  const lastBrood = living.some((f) => f.guardian === mother.id);
  // 偏酸的軟水才會產卵（沉木、水草泥，hardscape.md）
  const ready = male && !lastBrood && state.water.tempC >= 25 && state.water.ph <= BREED_PH_MAX && mother.hunger < 0.5 && mother.stress < 0.35 && mother.health > 0.75;
  if (!ready) return;
  // 吃活餌、紅蟲這類肉食飼料比較快進入繁殖狀態
  const conditioned = 0.6 + 0.8 * Math.min(1, mother.breedingCondition ?? 0.5);
  if (!chance(state.rng, (1 / (24 * 10)) * conditioned, dt)) return;
  const b = sp.breeding;
  const eggs = Math.round(b.broodMin + (b.broodMean - b.broodMin) * (0.6 + 0.8 * nextRandom(state.rng)));
  mother.brood = { stage: 'eggs', hour: state.hours, count: Math.min(b.broodMax, eggs), care: 0.8 };
  recordEvent(state, { type: 'brood_laid', subjectId: mother.id, count: mother.brood.count });
}

function tendBrood(state: TankState, mother: Fish, dt: number): void {
  const brood = mother.brood!;
  const { target, issue } = careTarget(state, mother);
  brood.care += (target - brood.care) * (1 - Math.exp(-dt / 12));
  const age = state.hours - brood.hour;

  if (brood.stage !== 'free') {
    // 卵和還不會游的仔魚在洞裡：護幼值太低，母魚會整窩吃掉
    if (brood.care < CARE_EAT_THRESHOLD && chance(state.rng, (CARE_EAT_THRESHOLD - brood.care) * 0.15, dt)) {
      recordEvent(state, { type: 'brood_eaten', subjectId: mother.id, count: brood.count, cause: issue ?? 'stress' });
      state.water.organicMg += brood.count * 2;
      mother.brood = undefined;
      return;
    }
    // 黴菌、沒受精：卵每天少一點
    brood.count = Math.max(0, brood.count - brood.count * 0.03 * (dt / 24));
    if (brood.stage === 'eggs' && age >= EGG_HOURS) {
      brood.stage = 'wigglers';
      brood.hour = state.hours;
    } else if (brood.stage === 'wigglers' && age >= WIGGLER_HOURS) {
      releaseFry(state, mother);
    }
    return;
  }

  // 帶著仔魚：護幼值低的時候偶爾吃掉一尾
  const kids = state.fish.filter((f) => f.alive && f.guardian === mother.id);
  if (brood.care < CARE_EAT_THRESHOLD && kids.length > 0 && chance(state.rng, (CARE_EAT_THRESHOLD - brood.care) * 2, dt)) {
    const k = kids[Math.floor(nextRandom(state.rng) * kids.length)];
    state.fish = state.fish.filter((f) => f !== k);
  }
  // 帶滿四週或小孩都沒了：母魚不再帶，小魚各自活動（該分缸了）
  if (age >= GUARD_HOURS || kids.length === 0) {
    for (const k of kids) k.guardian = undefined;
    mother.brood = undefined;
    if (kids.length > 0) mother.broodsRaised = (mother.broodsRaised ?? 0) + 1;
    if (kids.length > 0) recordEvent(state, { type: 'brood_left', subjectId: mother.id, count: kids.length });
  }
}

/** 仔魚游出洞穴：變成真的魚，跟著媽媽。 */
function releaseFry(state: TankState, mother: Fish): void {
  const brood = mother.brood!;
  const sp = FISH_SPECIES[mother.species];
  const n = Math.max(0, Math.min(Math.round(brood.count), 300 - state.fish.length));
  const pMale = maleChance(state.water.tempC);
  for (let i = 0; i < n; i++) {
    const fry = createFish(state, mother.species, { lengthCm: sp.birthLengthCm, stress: 0.05, hunger: 0.2, sex: nextRandom(state.rng) < pMale ? 'male' : 'female' });
    fry.acclimated = tankHabit(state);
    fry.growthRate = Math.min(1.4, Math.max(0.6, 1 + (nextRandom(state.rng) - 0.5) * 0.4));
    fry.guardian = mother.id;
    fry.generation = (mother.generation ?? 0) + 1;
    state.fish.push(fry);
  }
  brood.stage = 'free';
  brood.hour = state.hours;
  recordEvent(state, { type: 'fry_born', subjectId: mother.id, count: n });
}

/**
 * 親魚帶的仔魚：被吃的機率大減（媽媽會趕走靠近的魚），也會帶到有生物膜的地方吃，不容易餓。
 * 給族群模組用的係數（1 = 沒人保護）。
 */
export function guardedPredationFactor(state: TankState, fry: Fish): number {
  return guardianOf(state, fry) ? 0.15 : 1;
}

/** 護幼中的母魚趕別的魚：被趕的魚壓力上升（給緊迫計算用）。 */
export function territoryStress(state: TankState, fish: Fish): number {
  if (isJuvenile(fish) || fish.species === 'cherry_shrimp') return 0;
  const guards = state.fish.filter((m) => isGuarding(m) && m !== fish && fish.guardian !== m.id);
  if (guards.length === 0) return 0;
  // 缸越小越躲不掉
  return Math.min(0.5, guards.length * 0.15 * (60 / Math.max(20, state.equipment.tank.volumeL)));
}
