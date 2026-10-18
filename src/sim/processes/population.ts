import { breedingFactor } from '../food';
import { temperatureFactor } from '../chemistry';
import { chance, nextRandom } from '../random';
import { FISH_SPECIES, type FishSpeciesId } from '../species';
import { isJuvenile, recordEvent, type Fish, type TankState } from '../state';
import { crowdingRatio, lifeFraction } from './fauna';
import { growFish } from '../growth';
import { tankHabit } from '../acclimation';
import { guardedPredationFactor, isCaveSpawner } from '../parental';
import { bettaAggression } from '../betta';
import { childInbreeding, cross, matingSuccess, type GuppyGenome } from '../genetics';

/**
 * 族群：成長、Phase 0 的簡化繁殖、混養互動（吃仔魚／仔蝦、咬鰭）。
 * 參數來自 design/compatibility.md §4；打架與個體性格在 Phase 1。
 */

/** 缸內活體數量上限，避免族群爆炸拖慢模擬（超過的仔魚視為沒能存活）。 */
export const MAX_FAUNA = 300;

export interface NewFishInit {
  sex?: 'male' | 'female';
  lengthCm?: number;
  stress?: number;
  hunger?: number;
  ich?: Fish['ich'];
  ageDays?: number;
  genome?: GuppyGenome;
}

export function createFish(state: TankState, species: FishSpeciesId, init: NewFishInit = {}): Fish {
  const sp = FISH_SPECIES[species];
  return {
    id: state.nextId++,
    species,
    alive: true,
    health: 1,
    stress: init.stress ?? 0,
    hunger: init.hunger ?? 0.3,
    starvingHours: 0,
    ich: init.ich ?? { stage: 'none', progress: 0 },
    constitution: 0.85 + 0.3 * nextRandom(state.rng),
    recentDamage: {},
    corpseMg: 0,
    sex: init.sex ?? (nextRandom(state.rng) < 0.5 ? 'male' : 'female'),
    lengthCm: init.lengthCm ?? sp.adultLengthCm,
    finDamage: 0,
    pregnancy: 0,
    genome: init.genome,
    lineage: undefined,
    ageDays: init.ageDays ?? (init.lengthCm !== undefined && init.lengthCm < sp.adultLengthCm * 0.9 ? 0 : sp.daysToAdult),
  };
}

/** 相對於成體的體型（體長比），用來縮放食量、耗氧與屍體重量。 */
export function sizeRatio(fish: Fish): number {
  return Math.min(1, fish.lengthCm / FISH_SPECIES[fish.species].adultLengthCm);
}

/**
 * 躲藏係數 0–0.75：水草越密，仔魚、仔蝦越容易躲過掠食者。
 * Phase 0 只看水草總量 ÷ 水量；莫絲、造景石、沉木在之後加入。
 */
export function hidingFactor(state: TankState): number {
  const grams = state.plants.reduce((sum, p) => sum + p.biomassG, 0);
  return 0.75 * (1 - Math.exp(-grams / state.equipment.tank.volumeL / 0.4));
}

export function updatePopulation(state: TankState, dt: number): void {
  const living = state.fish.filter((f) => f.alive);
  if (living.length === 0) return;
  const tf = temperatureFactor(state.water.tempC);

  const crowding = crowdingRatio(state);
  for (const fish of living) {
    growFish(state, fish, tf, crowding, dt);
    if (!fish.alive) continue;
    // 鰭在壓力不大時慢慢長回來（約一兩週）。
    if (fish.finDamage > 0) fish.finDamage = Math.max(0, fish.finDamage - (0.06 / 24) * (1 - fish.stress) * dt);
  }

  const hiding = hidingFactor(state);
  const eaten = predation(state, living, hiding, dt);
  // 被吃掉的幼體直接從缸裡消失。
  if (eaten.size > 0) state.fish = state.fish.filter((f) => !eaten.has(f));
  const survivors = living.filter((f) => !eaten.has(f));
  finNipping(state, survivors, hiding, dt);
  const hunted = bettaAggression(state, survivors, hiding, dt);
  if (hunted.size > 0) state.fish = state.fish.filter((f) => !hunted.has(f));
  breed(state, tf, dt);
}

/**
 * 成魚會吃嘴巴塞得下的仔魚、仔蝦。剛出生時最危險，長大到超過掠食者嘴巴就安全了。
 * 每隻幼體每小時的被吃機率 = 基礎值 × 掠食壓力 × 體型弱點 × 飢餓加成 × (1 − 躲藏係數)。
 */
function predation(state: TankState, living: Fish[], hiding: number, dt: number): Set<Fish> {
  const eaten = new Set<Fish>();
  const predators = living.filter((f) => FISH_SPECIES[f.species].mouthRatio > 0 && !isJuvenile(f));
  if (predators.length === 0) return eaten;

  for (const prey of living) {
    if (!isJuvenile(prey)) continue;
    const sp = FISH_SPECIES[prey.species];
    let count = 0;
    let limit = 0;
    let hunger = 0;
    for (const p of predators) {
      const mouth = p.lengthCm * FISH_SPECIES[p.species].mouthRatio;
      if (p === prey || mouth <= prey.lengthCm) continue;
      count++;
      limit = Math.max(limit, mouth);
      hunger += p.hunger;
    }
    if (count === 0) continue;
    const pressure = Math.min(1, count / 3);
    const smallness = Math.min(1, Math.max(0, (limit - prey.lengthCm) / Math.max(0.01, limit - sp.birthLengthCm)));
    const hungerBonus = 1 + hunger / count;
    // 跟著媽媽的仔魚：靠近的魚會被趕走
    const ratePerHour = (sp.juvenilePredationPerDay / 24) * pressure * smallness * hungerBonus * (1 - hiding) * guardedPredationFactor(state, prey);
    if (chance(state.rng, ratePerHour, dt)) {
      eaten.add(prey);
      // 吃剩的碎屑變成有機廢物。
      state.water.organicMg += sp.bodyMassMg * sizeRatio(prey) ** 3 * 0.3;
    }
  }
  return eaten;
}

/**
 * 咬鰭：斑馬魚會輕微咬長鰭魚（孔雀魚公魚）的鰭，自己群游數量不足時加倍。
 * 鰭破損帶來壓力和小傷害，記在 recentDamage['fin_nip'] 以便追溯。
 */
function finNipping(state: TankState, living: Fish[], hiding: number, dt: number): void {
  const nippers = new Map<FishSpeciesId, number>();
  for (const f of living) {
    if (FISH_SPECIES[f.species].finNipPerDay > 0 && !isJuvenile(f)) nippers.set(f.species, (nippers.get(f.species) ?? 0) + 1);
  }
  if (nippers.size === 0) return;

  let ratePerDay = 0;
  for (const [species, n] of nippers) {
    const sp = FISH_SPECIES[species];
    const school = living.filter((f) => f.species === species).length;
    ratePerDay += sp.finNipPerDay * Math.min(1, n / 3) * (school < sp.minGroup ? 2 : 1);
  }
  const ratePerHour = (ratePerDay / 24) * (1 - hiding * 0.3);

  for (const target of living) {
    if (!FISH_SPECIES[target.species].longFinnedMales || target.sex !== 'male' || isJuvenile(target)) continue;
    if (!chance(state.rng, ratePerHour, dt)) continue;
    target.finDamage = Math.min(1, target.finDamage + 0.15 + 0.1 * nextRandom(state.rng));
    target.stress = Math.min(1, target.stress + 0.1);
    target.health -= 0.01;
    target.recentDamage['fin_nip'] = (target.recentDamage['fin_nip'] ?? 0) + 0.01;
  }
}

/**
 * Phase 0 簡化繁殖：同種有成熟公母、母體健康放鬆時會懷孕／抱卵，期滿生下一胎。
 * 胎數 = 常態分佈(平均 × 健康, 平均 × 0.25)，夾在上下限（design/market-and-breeding.md §2.7）。
 * 基因與品系在 Phase 1 加入。
 */
function breed(state: TankState, tf: number, dt: number): void {
  const living = state.fish.filter((f) => f.alive);
  for (const mother of living) {
    const sp = FISH_SPECIES[mother.species];
    // 洞穴產卵的魚另外處理（parental.ts）
    if (!sp.breeding || mother.sex !== 'female' || isJuvenile(mother) || isCaveSpawner(mother.species)) continue;

    if (mother.pregnancy > 0) {
      mother.pregnancy += (dt / 24 / sp.breeding.gestationDays) * Math.sqrt(tf);
      if (mother.pregnancy >= 1) {
        mother.pregnancy = 0;
        giveBirth(state, mother, living.length);
      }
      continue;
    }

    // 水溫低於適溫下限時停止繁殖（temperature.md §3）
    const warmEnough = state.water.tempC >= sp.temp.min;
    // 太老的母魚不再懷孕
    const relaxed = warmEnough && lifeFraction(mother) < 0.9 && mother.health > 0.7 && mother.stress < 0.4 && mother.hunger < 0.7;
    const males = relaxed ? living.filter((f) => f.species === mother.species && f.sex === 'male' && !isJuvenile(f)) : [];
    // 緞帶、大C 的公魚交接器太長配不了，燕尾的也很難配（strains.md §1.3）
    const fertility = males.map((m) => (m.genome ? matingSuccess(m.genome) : 1));
    const best = Math.max(0, ...fertility);
    if (males.length > 0 && best > 0 && chance(state.rng, (0.5 / 24) * breedingFactor(mother.breedingCondition) * best, dt)) {
      mother.pregnancy = 0.001;
      // 尾鰭越大的公魚越受母魚青睞（性擇），但誰當爸爸還是有運氣成分
      const weights = males.map((m, i) => (0.5 + (m.genome?.tail ?? 50) / 100) * fertility[i]);
      let r = nextRandom(state.rng) * weights.reduce((a, b) => a + b, 0);
      const father = males.find((_, i) => (r -= weights[i]) <= 0) ?? males[males.length - 1];
      if (father.genome) mother.sire = { genome: father.genome, lineage: father.lineage ?? father.id, inbreeding: father.inbreeding ?? 0 };
    }
  }
}

function giveBirth(state: TankState, mother: Fish, population: number): void {
  const b = FISH_SPECIES[mother.species].breeding!;
  const u = Math.max(1e-9, nextRandom(state.rng));
  const v = nextRandom(state.rng);
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const mean = b.broodMean * mother.health;
  let n = Math.round(Math.min(b.broodMax, Math.max(b.broodMin, mean + normal * mean * 0.25)));
  n = Math.max(0, Math.min(n, MAX_FAUNA - population));
  if (n === 0) return;
  const sp = FISH_SPECIES[mother.species];
  const sire = mother.sire;
  const line = mother.lineage ?? mother.id;
  const inbreeding = sire && mother.genome ? childInbreeding(mother.inbreeding ?? 0, sire.inbreeding, sire.lineage === line) : 0;
  for (let i = 0; i < n; i++) {
    const fry = createFish(state, mother.species, { lengthCm: sp.birthLengthCm, stress: 0.1, hunger: 0.2 });
    // 同一胎有快有慢（約 ±20%），所以長大後要挑
    // 剛出生的魚習慣出生缸的水（design/acclimation.md §1）
    fry.acclimated = tankHabit(state);
    fry.growthRate = Math.min(1.4, Math.max(0.6, 1 + (nextRandom(state.rng) + nextRandom(state.rng) + nextRandom(state.rng) - 1.5) * 0.4));
    if (mother.genome && sire) {
      fry.genome = cross(state.rng, mother.genome, sire.genome, fry.sex, inbreeding);
      fry.lineage = line;
      fry.generation = (mother.generation ?? 0) + 1;
      fry.inbreeding = inbreeding;
      // 近親繁殖讓體質變差
      fry.constitution *= 1 - 0.4 * inbreeding;
    }
    state.fish.push(fry);
  }
  recordEvent(state, { type: 'fry_born', subjectId: mother.id, count: n });
}
