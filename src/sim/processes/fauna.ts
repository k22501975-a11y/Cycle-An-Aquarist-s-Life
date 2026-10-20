import { territoryStress } from '../parental';
import { driftAcclimation, habitStress, phBeyondSurvival } from '../acclimation';
import { freeAmmoniaFraction, temperatureFactor } from '../chemistry';
import { DEFAULT_BREEDING_CONDITION, DEFAULT_NUTRITION, foodLots, foodQuality, nutritionFactor, pruneFood } from '../food';
import { chance } from '../random';
import { FISH_SPECIES, type FishSpecies } from '../species';
import { recordEvent, type Fish, type TankState } from '../state';
import { diseaseStress, progressInfections, spreadInfections } from './disease';
import { cycleMaturity } from './nitrogen';
import { sizeRatio } from './population';

/** 吃下的飼料中，以氨氮形式排出的比例；其餘一部分變成糞便。 */
const TAN_PER_MG_FOOD = 0.03;
const FECES_PER_MG_FOOD = 0.25;
/**
 * 飢餓值的時間尺度（天）。每天吃到 dailyFoodMg 剛好打平（一天兩餐）。
 * 吃不飽時代謝會放慢（HUNGER_SLOWDOWN），所以少量餵會停在某個飢餓值，而不是一路餓到底：
 * 一天兩次「一小撮」（0.85 份）停在約 0.4（吃飽），一天一次約 0.62（有點餓）；完全不餵約 8 天到 0.8（見 ADULT_FAST）。
 */
const DAYS_TO_STARVING = 6;
/** 飢餓值超過 0.3 後，每多 0.1 代謝慢 20%，最慢到原本的 15%。 */
const HUNGER_SLOWDOWN = 2;
const MIN_METABOLISM = 0.15;
/**
 * 寫實的斷食（design/mvp.md §4.7）：飢餓值到 start 以後才開始消耗體力，體力撐 days 天，用完才開始餓死（體弱的先死）。
 * 成魚停餵約 8 天才到 0.8，再撐兩週（第 21 天後才會餓死）；仔魚、幼魚代謝快、存糧少，三到五天就撐不住。
 * 有水草、有藻的缸可以啄生物膜，多撐約三成。
 */
const ADULT_FAST = { start: 0.75, days: 12 };
const YOUNG_FAST = { start: 0.6, days: 1 };
/** 小於成魚體長一半算仔魚、幼魚：飢餓值漲兩倍快。 */
const YOUNG_LENGTH = 0.5;
const YOUNG_HUNGER_RATE = 2;
const GRAZING_BONUS = 1.3;

const isYoung = (fish: Fish) => fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * YOUNG_LENGTH;
const fastSpec = (fish: Fish) => (isYoung(fish) ? YOUNG_FAST : ADULT_FAST);

/**
 * 餓到要叫醒玩家（快轉、過一晚停下來）：成魚一開始消耗體力就算；仔魚、幼魚兩倍快變餓，一天只餵一次也常碰到門檻，
 * 要連續消耗體力 12 小時（撐得住的一半，離餓死還有半天）才算，剛碰到門檻只在早上報告提醒一天餵兩次（#193）。
 */
export const CRISIS_STARVING_HOURS = { young: 12, adult: 0 };

export function starvingCrisis(fish: Fish): boolean {
  return isStarving(fish) && fish.starvingHours >= (isYoung(fish) ? CRISIS_STARVING_HOURS.young : CRISIS_STARVING_HOURS.adult);
}

/** 仔魚、幼魚已經餓到快開始消耗體力（門檻的四分之三）：一天只餵一次的話，下一餐前就會撐不住，早上報告提醒一天餵兩次。 */
export function youngGettingHungry(fish: Fish): boolean {
  return isYoung(fish) && fish.hunger >= YOUNG_FAST.start * 0.75;
}

/** 這條魚現在是不是餓到在消耗體力（餵飽以後體力還在慢慢補回來的不算）。 */
export function isStarving(fish: Fish): boolean {
  return fish.hunger >= fastSpec(fish).start;
}

/** 體力消耗了幾成：0 沒事，1 開始餓死（超過 1 繼續累積）。7～21 天的消瘦、褪色、不繁殖都看這個。 */
export function starvation(state: TankState, fish: Fish): number {
  const grazing = state.plants.length > 0 || state.algae > 0.05 ? GRAZING_BONUS : 1;
  return fish.starvingHours / (fastSpec(fish).days * 24 * grazing);
}

/**
 * 從現在起都不餵的話，這條魚幾個遊戲小時後體力耗盡、開始餓死（照現在的水溫估，給離線前的提醒用）。
 */
export function hoursUntilStarving(state: TankState, fish: Fish): number {
  const spec = fastSpec(fish);
  const tf = temperatureFactor(state.water.tempC);
  const youngRate = isYoung(fish) ? YOUNG_HUNGER_RATE : 1;
  let hunger = fish.hunger;
  let h = 0;
  while (hunger < spec.start && h < 24 * 60) {
    const slowdown = Math.max(MIN_METABOLISM, 1 - HUNGER_SLOWDOWN * Math.max(0, hunger - 0.3));
    hunger += (1 / 24 / DAYS_TO_STARVING) * Math.sqrt(tf) * slowdown * youngRate;
    h += 1;
  }
  const grazing = state.plants.length > 0 || state.algae > 0.05 ? GRAZING_BONUS : 1;
  return h + Math.max(0, 1 - starvation(state, fish)) * spec.days * 24 * grazing;
}

/** 胃口：一次最多吃到「飢餓值 × 幾天份」就飽了（吃不完的飼料留在缸裡腐敗）。 */
const STOMACH_DAYS = 3;

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
  /** 被護幼中的母魚趕。 */
  territory: number;
}

/** 每項傷害來源的每小時健康損失。 */
interface Damage {
  amount: number;
  cause: string;
}

export function freeAmmonia(state: TankState): number {
  return state.water.tan * freeAmmoniaFraction(state.water.ph, state.water.tempC);
}

/**
 * 店裡的魚耐得住還在養水的缸（design/polish-to-9.md §4）：硝化菌還沒長好時，買來的成魚（第 0 代）
 * 對游離氨多耐這麼多（mg/L）。傷害門檻從 0.04 放寬到 0.10，約是 pH 8.3、25°C 時總氨 1 mg/L：
 * 照基準玩法（測到氨就換水）放魚時氨不歸零也不會死；一次放太多魚、氨衝到好幾 mg/L 還是會中毒（新缸症候群保留）。
 */
export const CYCLING_NH3_ALLOWANCE = 0.06;

/** 這尾魚對游離氨額外的耐受（只有養水期間的店家魚有）。 */
function ammoniaAllowance(state: TankState, fish: Fish): number {
  return (fish.generation ?? 0) === 0 && cycleMaturity(state) < 1 ? CYCLING_NH3_ALLOWANCE : 0;
}

/**
 * 擁擠度：魚的總體長（cm）÷ 水量（L），超過 1 就太擠（經典的「每公升 1 cm」原則，指的是成魚）。
 * 幼魚的排泄和耗氧小得多，體長再乘上體型比例，一群剛出生的仔魚不會讓缸子馬上爆滿。
 */
export function crowdingRatio(state: TankState): number {
  const totalCm = state.fish.filter((f) => f.alive).reduce((sum, f) => sum + f.lengthCm * sizeRatio(f), 0);
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

/** 整缸共用的數字（擁擠度、各魚種數量）：一步算一次就好，不用每條魚各算一遍（仔魚一多會很慢）。 */
export interface TankCensus {
  crowding: number;
  species: Map<string, number>;
  /** 游離氨（mg/L）。 */
  nh3: number;
}

export function tankCensus(state: TankState): TankCensus {
  const species = new Map<string, number>();
  for (const f of state.fish) if (f.alive) species.set(f.species, (species.get(f.species) ?? 0) + 1);
  return { crowding: crowdingRatio(state), species, nh3: freeAmmonia(state) };
}

export function computeStressors(state: TankState, fish: Fish, census: TankCensus = tankCensus(state)): Stressors {
  const sp = FISH_SPECIES[fish.species];
  const { water } = state;
  const sensitivity = 1.5 - hardiness(fish, sp);
  const outside = (v: number, r: { min: number; max: number }) => Math.max(0, r.min - v, v - r.max);
  const sameSpecies = census.species.get(fish.species) ?? 0;

  return {
    temperature: outside(water.tempC, sp.temp) / 6,
    // 超出存活範圍很危險；在範圍內只看離這尾魚習慣的水多遠（慢慢適應就沒事）
    ph: phBeyondSurvival(state, fish) / 0.4 + habitStress(state, fish),
    // 測試劑讀到 0 的微量不構成壓力。
    ammonia: (Math.max(0, census.nh3 - 0.01 - ammoniaAllowance(state, fish)) / 0.05) * sensitivity,
    nitrite: Math.max(0, water.no2 - 0.2) * sensitivity,
    nitrate: Math.max(0, water.no3 - 50) / 100,
    // 鬥魚會到水面吸空氣，缺氧影響小很多
    oxygen: (Math.max(0, 4 - water.o2) / 2) * (sp.airBreather ? 0.2 : 1),
    co2: Math.max(0, water.co2 - 30) / 15,
    // 斷食第一週沒影響，體力開始消耗後壓力才慢慢上來
    hunger: Math.min(0.6, starvation(state, fish) * 0.5),
    crowding: Math.max(0, census.crowding - 1) * 0.8,
    group: sp.minGroup > 0 && sameSpecies < sp.minGroup ? 0.1 + (0.3 * (sp.minGroup - sameSpecies)) / sp.minGroup : 0,
    suddenChange:
      Math.max(0, Math.abs(water.tempC - water.tempAvgC) - 1) / 2 + Math.max(0, Math.abs(water.ph - water.phAvg) - 0.3) / 0.5,
    medication: (sp.medicationSensitive ? water.medication * 2 : 0) + (sp.invertebrate ? (water.copper ?? 0) * 3 : (water.copper ?? 0) * 0.5),
    disease: Math.max(fish.ich.stage === 'visible' ? 0.3 : 0, diseaseStress(fish)),
    injury: fish.finDamage * 0.3,
    territory: territoryStress(state, fish),
  };
}

export type StressKey = keyof Stressors;

/** 玩家看得懂的壓力來源說明（生病時「為什麼」）。 */
export const STRESS_CAUSE_LABELS: Record<StressKey, string> = {
  temperature: '水溫不適合',
  ph: 'pH 和牠習慣的差太多',
  ammonia: '水裡有氨',
  nitrite: '亞硝酸鹽偏高',
  nitrate: '硝酸鹽太高，該換水了',
  oxygen: '水裡氧氣不夠',
  co2: 'CO₂ 太多',
  hunger: '這幾天沒吃飽，抵抗力變差',
  crowding: '缸裡太擠',
  group: '同伴太少，群游魚會不安',
  suddenChange: '水溫或 pH 變化太快',
  medication: '藥物刺激',
  disease: '身上已經有病',
  injury: '鰭被咬傷',
  territory: '被地盤性強的魚欺負',
};

/**
 * 這尾魚最可能的壓力來源，由大到小（只列夠明顯的）。給診斷畫面、老闆台詞、生病事件用。
 * 免疫力被壓低時白點蟲才會上身，所以這也是「為什麼會生病」的答案。
 */
export function likelyCauses(state: TankState, fish: Fish, census?: TankCensus): { key: StressKey; label: string; weight: number }[] {
  const s = computeStressors(state, fish, census);
  return (Object.keys(s) as StressKey[])
    .filter((k) => k !== 'disease' && s[k] >= 0.08)
    .sort((a, b) => s[b] - s[a])
    .map((k) => ({ key: k, label: STRESS_CAUSE_LABELS[k], weight: Math.min(1, s[k]) }));
}

function computeDamage(state: TankState, fish: Fish, sp: FishSpecies): Damage[] {
  const { water } = state;
  const sensitivity = 1.5 - hardiness(fish, sp);
  const damage: Damage[] = [];
  const add = (amount: number, cause: string) => {
    if (amount > 0) damage.push({ amount, cause });
  };
  add((freeAmmonia(state) - 0.04 - ammoniaAllowance(state, fish)) * 0.3 * sensitivity, 'ammonia');
  add((water.no2 - 1) * 0.004 * sensitivity, 'nitrite');
  add((2 - water.o2) * 0.05 * (sp.airBreather ? 0.15 : 1), 'oxygen');
  add((water.co2 - 45) * 0.004, 'co2');
  add(phBeyondSurvival(state, fish) * 0.01, 'ph');
  const tempOut = Math.max(0, sp.tempLethal.min - water.tempC, water.tempC - sp.tempLethal.max);
  add(tempOut * 0.01, 'temperature');
  if (starvation(state, fish) >= 1) add(0.03 * sensitivity, 'starvation');
  // 超過壽命後身體一天天衰弱，大約兩三週內老死
  const life = lifeFraction(fish);
  if (life > 1) add(0.002 + (life - 1) * 0.02, 'old_age');
  if (sp.medicationSensitive) add(water.medication * 0.02, 'medication');
  // 除螺藥的銅對蝦是毒（螺也是軟體動物，蝦是甲殼類但一樣怕銅）
  if (sp.invertebrate) add((water.copper ?? 0) * 0.08, 'copper');
  if (fish.ich.stage === 'visible') add(0.004 * (1 - 0.5 * immunity(fish, sp)), 'ich');
  // 長期高壓力本身就會耗損身體。
  add((fish.stress - 0.7) * 0.01, 'chronic_stress');
  return damage;
}

export function immunity(fish: Fish, sp: FishSpecies): number {
  return Math.min(1, hardiness(fish, sp) * nutritionFactor(fish.nutrition)) * (1 - 0.7 * fish.stress) * (fish.hunger > 0.8 ? 0.8 : 1);
}

export function updateFauna(state: TankState, dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  const tf = temperatureFactor(water.tempC);
  const living = state.fish.filter((f) => f.alive);

  feed(state, living, dt);
  const census = tankCensus(state);

  for (const fish of living) {
    const sp = FISH_SPECIES[fish.species];
    // 代謝量大約和體表面積成正比，幼體用得少。
    const metabolic = sizeRatio(fish) ** 2;
    // 變溫動物：水溫高代謝快、老得快（孔雀魚長期 28°C 壽命約少兩成）
    fish.ageDays = (fish.ageDays ?? 0) + (dt / 24) * Math.min(1.5, Math.max(0.7, Math.sqrt(tf)));
    driftAcclimation(state, fish, dt);

    // 代謝：飢餓、耗氧、排出 CO₂。
    const slowdown = Math.max(MIN_METABOLISM, 1 - HUNGER_SLOWDOWN * Math.max(0, fish.hunger - 0.3));
    const youngRate = isYoung(fish) ? YOUNG_HUNGER_RATE : 1;
    fish.hunger = Math.min(1, fish.hunger + (dt / 24 / DAYS_TO_STARVING) * Math.sqrt(tf) * slowdown * youngRate);
    // 吃不到東西就消耗體力；吃得到以後恢復得比消耗快一倍
    fish.starvingHours = fish.hunger >= fastSpec(fish).start ? fish.starvingHours + dt : Math.max(0, fish.starvingHours - 2 * dt);
    water.o2 = Math.max(0, water.o2 - (sp.o2UseMgPerHour * metabolic * tf * dt) / volume);
    water.co2 += (sp.o2UseMgPerHour * metabolic * 1.375 * tf * dt) / volume;

    // 壓力往目標值靠近：上升快、下降慢。
    const s = computeStressors(state, fish, census);
    const target = 1 - Object.values(s).reduce((prod, v) => prod * (1 - Math.min(1, v)), 1);
    const rate = target > fish.stress ? 0.5 : 0.1;
    fish.stress += (target - fish.stress) * (1 - Math.exp(-rate * dt));

    updateIch(state, fish, sp, dt);

    const damage = computeDamage(state, fish, sp);
    damage.push(...progressInfections(state, fish, water.tempC, { antibiotic: water.antibiotic ?? 0, dewormer: water.dewormer ?? 0 }, dt));
    const total = damage.reduce((sum, d) => sum + d.amount, 0);
    rememberDamage(fish, damage, dt);
    if (total > 0) {
      fish.health -= total * dt;
    } else if (fish.ich.stage === 'none' && !fish.infections?.some((i) => i.stage === 'visible')) {
      fish.health += 0.01 * (1 - fish.stress) * dt;
    }
    fish.health = Math.min(1, fish.health);

    if (fish.health <= 0) {
      fish.health = 0;
      fish.alive = false;
      fish.corpseMg = sp.bodyMassMg * sizeRatio(fish) ** 3;
      const cause = mainCause(fish);
      recordEvent(state, { type: 'fish_died', subjectId: fish.id, cause, value: deathReading(state, fish, cause) });
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

  // 柱狀病、鰓吸蟲在缸裡傳染；抗生素會順便傷到硝化菌（藥效約三天）
  spreadInfections(state, living, dt, 40 / volume);
  if (water.antibiotic) {
    const hit = Math.exp(-0.004 * water.antibiotic * dt);
    state.bacteria.aob *= hit;
    state.bacteria.nob *= hit;
    water.antibiotic *= Math.exp(-0.01 * dt);
  }
  if (water.dewormer) water.dewormer *= Math.exp(-0.01 * dt);
}

/** 近期傷害記錄以約 24 小時的時間常數衰減。 */
function rememberDamage(fish: Fish, damage: Damage[], dt: number): void {
  const fade = Math.exp(-dt / 24);
  for (const cause of Object.keys(fish.recentDamage)) fish.recentDamage[cause] *= fade;
  for (const d of damage) fish.recentDamage[d.cause] = (fish.recentDamage[d.cause] ?? 0) + d.amount * dt;
}

/**
 * 死的那一刻跟死因有關的讀數（記在 fish_died 事件的 value，早上報告寫「當時的數值」用，U4）：
 * 缺氧記溶氧 mg/L、水溫記 °C、餓死記幾天沒餵、氨和亞硝酸記 ppm…；沒有專屬讀數的死因記當時水溫。
 */
export function deathReading(state: TankState, fish: Fish, cause: string): number {
  const { water } = state;
  switch (cause) {
    case 'ammonia':
      return water.tan;
    case 'nitrite':
      return water.no2;
    case 'oxygen':
      return water.o2;
    case 'co2':
      return water.co2;
    case 'ph':
    case 'ph_shock':
      return water.ph;
    case 'starvation':
      // 沒餵過就只能看牠自己撐了多久
      return state.lastFedHours !== undefined ? (state.hours - state.lastFedHours) / 24 : fish.starvingHours / 24;
    case 'old_age':
      return fish.ageDays;
    case 'chronic_stress':
      return fish.stress;
    case 'copper':
      return water.copper ?? 0;
    default:
      return water.tempC;
  }
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

/**
 * 魚會搶食缸內的飼料；壓力大時食慾下降。吃下的部分變成氨與糞便。
 * 每種飼料在不同的層（design/food.md）：上層魚搶漂浮的、蝦吃底沙的，餵錯層就有魚吃不到。
 * 吃到的等級慢慢改變魚的長期營養、發色和繁殖意願。
 */
function feed(state: TankState, living: Fish[], dt: number): void {
  const { water } = state;
  const volume = state.equipment.tank.volumeL;
  for (const fish of living) settleCondition(fish, dt);
  if (water.foodMg <= 0) return;
  const lots = foodLots(water);
  const total = water.foodMg;

  const appetites = living.map((f) => {
    const sp = FISH_SPECIES[f.species];
    const daily = sp.dailyFoodMg * sizeRatio(f) ** 2;
    // 壓力超過 0.5 後食慾逐漸下降，最低剩三成。
    const appetite = 1 - 0.7 * Math.min(1, Math.max(0, (f.stress - 0.5) / 0.5));
    // 約半小時內吃完一餐；吃到飽（飢餓值歸零）就不再吃。
    const room = f.hunger * daily * STOMACH_DAYS;
    return Math.min(room, daily * 4 * appetite * dt);
  });

  // 每批飼料：各條魚依「吃得到幾成」搶，不夠就照比例分
  const eatenBy = living.map(() => ({ mg: 0, satiety: 0, nutrition: 0, color: 0, breeding: 0 }));
  let eatenTotal = 0;
  let dirtTotal = 0;
  for (const lot of lots) {
    const share = lot.mg / total;
    const demands = living.map((f, i) => appetites[i] * FISH_SPECIES[f.species].diet[lot.kind] * share);
    const demand = demands.reduce((a, b) => a + b, 0);
    if (demand <= 0) continue;
    const eaten = Math.min(lot.mg, demand);
    lot.mg -= eaten;
    eatenTotal += eaten;
    const q = foodQuality(lot);
    dirtTotal += eaten * q.dirt;
    demands.forEach((d, i) => {
      const mg = eaten * (d / demand);
      const e = eatenBy[i];
      e.mg += mg;
      e.satiety += mg * q.satiety;
      e.nutrition += mg * q.nutrition;
      e.color += mg * q.color;
      e.breeding += mg * q.breeding;
    });
  }
  pruneFood(water);
  living.forEach((fish, i) => {
    const e = eatenBy[i];
    if (e.mg <= 0) return;
    const daily = FISH_SPECIES[fish.species].dailyFoodMg * sizeRatio(fish) ** 2;
    fish.hunger = Math.max(0, fish.hunger - e.satiety / daily / DAYS_TO_STARVING);
    // 吃了一天的份量，長期狀態往這批飼料的品質走一步
    const meals = Math.min(1, e.mg / daily);
    const toward = (v: number | undefined, base: number, target: number, days: number) => {
      const cur = v ?? base;
      return cur + (target - cur) * Math.min(1, meals / days);
    };
    fish.nutrition = toward(fish.nutrition, DEFAULT_NUTRITION, e.nutrition / e.mg, 14);
    fish.breedingCondition = toward(fish.breedingCondition, DEFAULT_BREEDING_CONDITION, e.breeding / e.mg, 5);
    const color = e.color / e.mg;
    if (color > (fish.colorBoost ?? 0)) fish.colorBoost = toward(fish.colorBoost, 0, color, 6);
  });
  water.tan += (eatenTotal * TAN_PER_MG_FOOD) / volume;
  water.organicMg += dirtTotal * FECES_PER_MG_FOOD;
}

/** 發色停餵好飼料會慢慢退（約兩週退一半）；繁殖意願沒有吃肉也會慢慢回到平常。 */
function settleCondition(fish: Fish, dt: number): void {
  if (fish.colorBoost) fish.colorBoost *= Math.exp(-dt / (24 * 20));
  if (fish.breedingCondition !== undefined && fish.breedingCondition > DEFAULT_BREEDING_CONDITION) {
    fish.breedingCondition += (DEFAULT_BREEDING_CONDITION - fish.breedingCondition) * (1 - Math.exp(-dt / (24 * 10)));
  }
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
        // 附上最可能的誘因（例如沒吃飽、水溫忽高忽低），老闆和魚的資訊可以說出為什麼會生病
        recordEvent(state, { type: 'ich_visible', subjectId: fish.id, cause: likelyCauses(state, fish)[0]?.key });
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
