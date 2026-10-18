import { freeAmmoniaFraction, temperatureFactor } from '../chemistry';
import { chance } from '../random';
import { FISH_SPECIES, type FishSpecies } from '../species';
import { recordEvent, type Fish, type TankState } from '../state';
import { sizeRatio } from './population';

/** 吃下的飼料中，以氨氮形式排出的比例；其餘一部分變成糞便。 */
const TAN_PER_MG_FOOD = 0.03;
const FECES_PER_MG_FOOD = 0.25;
/** 飢餓值從 0 升到 1 需要的天數（完全不餵）。 */
const DAYS_TO_STARVING = 3;

/** 每項壓力來源的強度 0–1，給診斷畫面說明「為什麼魚有壓力」。 */
export interface Stressors {
  temperature: number;
  ph: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  oxygen: number;
  co2: number;
  hunger: number;
  crowding: number;
  group: number;
  suddenChange: number;
  medication: number;
  disease: number;
  injury: number;
}

/** 每項傷害來源的每小時健康損失。 */
interface Damage {
  amount: number;
  cause: string;
}

export function freeAmmonia(state: TankState): number {
  return state.water.tan * freeAmmoniaFraction(state.water.ph, state.water.tempC);
}

/** 擁擠度：魚的總體長（cm）÷ 水量（L），超過 1 就太擠（經典的「每公升 1 cm」原則）。 */
export function crowdingRatio(state: TankState): number {
  const totalCm = state.fish.filter((f) => f.alive).reduce((sum, f) => sum + f.lengthCm, 0);
  return totalCm / state.equipment.tank.volumeL;
}

/** 已經活過壽命的幾成（體質好的魚活得久）。 */
export function lifeFraction(fish: Fish): number {
  const sp = FISH_SPECIES[fish.species];
  return (fish.ageDays ?? 0) / (sp.lifespanDays * fish.constitution);
}

/** 開始顯老（體質下降、不再懷孕）的壽命比例。 */
export const ELDERLY_FRACTION = 0.8;

/** 這條魚的體質：魚種體質 × 個體差異，老了會變差。 */
export function hardiness(fish: Fish, sp: FishSpecies): number {
  const elder = 1 - 0.5 * Math.min(1, Math.max(0, (lifeFraction(fish) - ELDERLY_FRACTION) / 0.4));
  return Math.min(1, sp.hardiness * fish.constitution) * elder;
}

export function computeStressors(state: TankState, fish: Fish): Stressors {
  const sp = FISH_SPECIES[fish.species];
  const { water } = state;
  const sensitivity = 1.5 - hardiness(fish, sp);
  const outside = (v: number, r: { min: number; max: number }) => Math.max(0, r.min - v, v - r.max);
  const sameSpecies = state.fish.filter((f) => f.alive && f.species === fish.species).length;

  return {
    temperature: outside(water.tempC, sp.temp) / 6,
    ph: outside(water.ph, sp.ph) / 0.8,
    // 測試劑讀到 0 的微量不構成壓力。
    ammonia: (Math.max(0, freeAmmonia(state) - 0.003) / 0.02) * sensitivity,
    nitrite: Math.max(0, water.no2 - 0.2) * sensitivity,
    nitrate: Math.max(0, water.no3 - 50) / 100,
    oxygen: Math.max(0, 4 - water.o2) / 2,
    co2: Math.max(0, water.co2 - 30) / 15,
    hunger: Math.max(0, fish.hunger - 0.5),
    crowding: Math.max(0, crowdingRatio(state) - 1) * 0.8,
    group: sp.minGroup > 0 && sameSpecies < sp.minGroup ? 0.1 + (0.3 * (sp.minGroup - sameSpecies)) / sp.minGroup : 0,
    suddenChange:
      Math.max(0, Math.abs(water.tempC - water.tempAvgC) - 1) / 2 + Math.max(0, Math.abs(water.ph - water.phAvg) - 0.3) / 0.5,
    medication: sp.medicationSensitive ? water.medication * 2 : 0,
    disease: fish.ich.stage === 'visible' ? 0.3 : 0,
    injury: fish.finDamage * 0.3,
  };
}

function computeDamage(state: TankState, fish: Fish, sp: FishSpecies): Damage[] {
  const { water } = state;
  const sensitivity = 1.5 - hardiness(fish, sp);
  const damage: Damage[] = [];
  const add = (amount: number, cause: string) => {
    if (amount > 0) damage.push({ amount, cause });
  };
  add((freeAmmonia(state) - 0.02) * 0.6 * sensitivity, 'ammonia');
  add((water.no2 - 1) * 0.004 * sensitivity, 'nitrite');
  add((2 - water.o2) * 0.05, 'oxygen');
  add((water.co2 - 45) * 0.004, 'co2');
  const tempOut = Math.max(0, sp.tempLethal.min - water.tempC, water.tempC - sp.tempLethal.max);
  add(tempOut * 0.01, 'temperature');
  if (fish.hunger >= 1) add(0.004, 'starvation');
  // 超過壽命後身體一天天衰弱，大約兩三週內老死
  const life = lifeFraction(fish);
  if (life > 1) add(0.002 + (life - 1) * 0.02, 'old_age');
  if (sp.medicationSensitive) add(water.medication * 0.02, 'medication');
  if (fish.ich.stage === 'visible') add(0.004 * (1 - 0.5 * immunity(fish, sp)), 'ich');
  // 長期高壓力本身就會耗損身體。
  add((fish.stress - 0.7) * 0.01, 'chronic_stress');
  return damage;
}

export function immunity(fish: Fish, sp: FishSpecies): number {
  return hardiness(fish, sp) * (1 - 0.7 * fish.stress) * (fish.hunger > 0.8 ? 0.8 : 1);
}

export function updateFauna(state: TankState, dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  const tf = temperatureFactor(water.tempC);
  const living = state.fish.filter((f) => f.alive);

  feed(state, living, dt);

  for (const fish of living) {
    const sp = FISH_SPECIES[fish.species];
    // 代謝量大約和體表面積成正比，幼體用得少。
    const metabolic = sizeRatio(fish) ** 2;
    // 變溫動物：水溫高代謝快、老得快（孔雀魚長期 28°C 壽命約少兩成）
    fish.ageDays = (fish.ageDays ?? 0) + (dt / 24) * Math.min(1.5, Math.max(0.7, Math.sqrt(tf)));

    // 代謝：飢餓、耗氧、排出 CO₂。
    fish.hunger = Math.min(1, fish.hunger + (dt / 24 / DAYS_TO_STARVING) * Math.sqrt(tf));
    fish.starvingHours = fish.hunger >= 1 ? fish.starvingHours + dt : 0;
    water.o2 = Math.max(0, water.o2 - (sp.o2UseMgPerHour * metabolic * tf * dt) / volume);
    water.co2 += (sp.o2UseMgPerHour * metabolic * 1.375 * tf * dt) / volume;

    // 壓力往目標值靠近：上升快、下降慢。
    const s = computeStressors(state, fish);
    const target = 1 - Object.values(s).reduce((prod, v) => prod * (1 - Math.min(1, v)), 1);
    const rate = target > fish.stress ? 0.5 : 0.1;
    fish.stress += (target - fish.stress) * (1 - Math.exp(-rate * dt));

    updateIch(state, fish, sp, dt);

    const damage = computeDamage(state, fish, sp);
    const total = damage.reduce((sum, d) => sum + d.amount, 0);
    rememberDamage(fish, damage, dt);
    if (total > 0) {
      fish.health -= total * dt;
    } else if (fish.ich.stage === 'none') {
      fish.health += 0.01 * (1 - fish.stress) * dt;
    }
    fish.health = Math.min(1, fish.health);

    if (fish.health <= 0) {
      fish.health = 0;
      fish.alive = false;
      fish.corpseMg = sp.bodyMassMg * sizeRatio(fish) ** 3;
      recordEvent(state, { type: 'fish_died', subjectId: fish.id, cause: mainCause(fish) });
    }
  }

  // 包囊約一天後破裂，釋放游走期的蟲。
  const released = water.ichCysts * (1 - Math.exp(-(tf * dt) / 18));
  water.ichCysts -= released;
  water.ichPathogen += released;

  // 白點蟲游走期找不到宿主會死亡；高溫加速（28°C 以上漸增，30°C 約 3 倍）、藥物大幅加速。
  const heat = 1 + 2 * Math.min(1, Math.max(0, (water.tempC - 28) / 2));
  const kill = 0.02 * tf * heat * (1 + 30 * water.medication);
  water.ichPathogen *= Math.exp(-kill * dt);
  water.medication *= Math.exp(-0.01 * dt);
}

/** 近期傷害記錄以約 24 小時的時間常數衰減。 */
function rememberDamage(fish: Fish, damage: Damage[], dt: number): void {
  const fade = Math.exp(-dt / 24);
  for (const cause of Object.keys(fish.recentDamage)) fish.recentDamage[cause] *= fade;
  for (const d of damage) fish.recentDamage[d.cause] = (fish.recentDamage[d.cause] ?? 0) + d.amount * dt;
}

/** 主要死因：近期造成最多健康損失的原因。 */
export function mainCause(fish: Fish): string {
  let best = 'unknown';
  let max = 0;
  for (const [cause, amount] of Object.entries(fish.recentDamage)) {
    if (amount > max) {
      max = amount;
      best = cause;
    }
  }
  return best;
}

/** 魚會搶食缸內的飼料；壓力大時食慾下降。吃下的部分變成氨與糞便。 */
function feed(state: TankState, living: Fish[], dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  if (water.foodMg <= 0) return;

  const appetites = living.map((f) => {
    const sp = FISH_SPECIES[f.species];
    const daily = sp.dailyFoodMg * sizeRatio(f) ** 2;
    // 壓力超過 0.5 後食慾逐漸下降，最低剩三成。
    const appetite = 1 - 0.7 * Math.min(1, Math.max(0, (f.stress - 0.5) / 0.5));
    // 約半小時內吃完一餐；吃到飽（飢餓值歸零）就不再吃。
    const room = f.hunger * daily * DAYS_TO_STARVING;
    return Math.min(room, daily * 4 * appetite * dt);
  });
  const demand = appetites.reduce((a, b) => a + b, 0);
  if (demand <= 0) return;

  const eatenTotal = Math.min(water.foodMg, demand);
  water.foodMg -= eatenTotal;
  living.forEach((fish, i) => {
    const eaten = eatenTotal * (appetites[i] / demand);
    const daily = FISH_SPECIES[fish.species].dailyFoodMg * sizeRatio(fish) ** 2;
    fish.hunger = Math.max(0, fish.hunger - eaten / daily / DAYS_TO_STARVING);
  });
  water.tan += (eatenTotal * TAN_PER_MG_FOOD) / volume;
  water.organicMg += eatenTotal * FECES_PER_MG_FOOD;
}

/**
 * 白點病：游走期的蟲感染魚 → 潛伏（皮下）→ 出現白點 → 成熟脫落成為包囊，
 * 在底砂分裂後釋放大量新的游走期蟲。藥物只殺游走期（包在皮下或包囊裡的殺不到），
 * 溫度越高週期越快，所以提高水溫能讓藥更快見效。
 */
function updateIch(state: TankState, fish: Fish, sp: FishSpecies, dt: number): void {
  if (!sp.susceptibleToIch) return;
  const { water } = state;
  const tf = temperatureFactor(water.tempC);
  const scale = 40 / state.equipment.tank.volumeL;

  switch (fish.ich.stage) {
    case 'none': {
      const risk = 0.03 * water.ichPathogen * Math.pow(1 - immunity(fish, sp), 2);
      if (chance(state.rng, risk, dt)) fish.ich = { stage: 'incubating', progress: 0 };
      break;
    }
    case 'incubating':
      fish.ich.progress += (dt / 72) * tf;
      if (fish.ich.progress >= 1) {
        fish.ich = { stage: 'visible', progress: 0 };
        recordEvent(state, { type: 'ich_visible', subjectId: fish.id });
      }
      break;
    case 'visible':
      fish.ich.progress += (dt / 96) * tf;
      if (fish.ich.progress >= 1) {
        // 成熟的蟲脫落，在底砂形成包囊。
        water.ichCysts += 10 * scale;
        fish.ich = { stage: 'none', progress: 0 };
      }
      break;
  }
}
