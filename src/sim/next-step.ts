import { economy, price } from './economy';
import { HUNGRY } from './readings';
import { CALM_DAYS, GOALS, goalState, nextGoals, PURPOSE_GOAL_COUNT, raisedCount, type Goal } from './goals';
import { COLORING_AT, daysToLength, growthStage, maxLengthCm } from './growth';
import { newTankCost } from './household';
import { BELLY_SHOWS, daysToBirth, dueMothers } from './nursery';
import { orderBoard, orderSupply } from './orders';
import { temperatureFactor } from './chemistry';
import { hasVisible } from './processes/disease';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import type { Fish, TankState } from './state';
import { breedingTankRaised, displayTankHighPlants, purposeTanks } from './tank-purpose';

/**
 * 任務卡「選育走到哪」那一行（choices.ts 的 breedingStep）。choices.ts 跟早上報告一起延後載入（開機必載的預算），
 * 由 ui/deferred-ui.ts 載好時登記；還沒載好就先照舊說餵小魚。
 */
let breedingStep: ((tanks: TankState[]) => string | null) | null = null;
export function setBreedingStep(fn: (tanks: TankState[]) => string | null): void {
  breedingStep = fn;
}

/**
 * 主畫面的「下一步」（polish-to-9.md U1）：教學結束後，時鐘下方一直看得到現在該做什麼，點下去帶到要按的按鈕。
 * 這裡只出資料（一句話＋要去哪裡），畫面怎麼畫、點了打開哪個面板由畫面決定。
 * 跟著目標串走：第一個還沒完成的目標，依現在缸裡的狀況說具體要做的事。
 */

/** 點「下一步」要帶去的地方。 */
export type NextTarget =
  | 'feed' // 餵食
  | 'nursery' // 育幼盒（買或把母魚放進去）
  | 'orders' // 訂單板
  | 'sell' // 賣魚給店家
  | 'shop_tank' // 商店的魚缸頁
  | 'shop_fish' // 商店的魚頁
  | 'shop_gear' // 商店的設備頁
  | 'shop_plants' // 商店的水草頁
  | 'select' // 挑選面板（選育）
  | 'treat' // 有魚生病：切到那缸、打開用藥面板
  | 'mother' // 打開懷孕最久那尾母魚的卡片（看肚子、懷孕進度）
  | 'fastest' // 打開最快轉色那尾小魚的卡片
  | 'fry_box' // 打開育幼盒（把主缸的小魚撈進去）
  | 'scape' // 造景模式
  | 'test' // 測水
  | 'equipment' // 危機（#375）：切到那缸、打開設備與維護（拔插頭、換加熱棒、開風扇）
  | 'remove_dead'; // 危機（#375）：切到那缸、拿網子撈死魚

export interface NextStep {
  /** 對應的目標 id。 */
  goal: string;
  /** 一句話（≤ 20 字左右，畫面放得下）。 */
  text: string;
  target: NextTarget;
  /** 要先切到第幾缸（危機在別缸時）。 */
  tank?: number;
}

const living = (tanks: TankState[]) => tanks.flatMap((t) => t.fish.filter((f) => f.alive));
/** 有魚看得出生病（白點、棉絮、鰓吸蟲）。 */
const anySick = (tanks: TankState[]) => living(tanks).some((f) => f.ich.stage === 'visible' || hasVisible(f));

/** 水裡的白點藥還有多少算「藥效中」（一份是 1，約一週退到這裡）。 */
export const ICH_MED_WORKING = 0.25;
/** 白點藥見效快的水溫（缸裡有怕熱的就照牠的適溫上限，ichHeatC）。 */
export const ICH_HEAT_C = 29;

/** 這缸治白點要調到幾度：ICH_HEAT_C，但不超過缸裡每種魚蝦的適溫上限（孔雀魚 28°C）。 */
export function ichHeatC(t: TankState): number {
  return Math.min(ICH_HEAT_C, ...t.fish.filter((f) => f.alive).map((f) => FISH_SPECIES[f.species].temp.max));
}

/** 這缸水裡的白點藥還能撐幾天（小數；藥效已經退了回 0）。 */
function medDaysLeft(t: TankState): number {
  return t.water.medication < ICH_MED_WORKING ? 0 : Math.log(t.water.medication / ICH_MED_WORKING) / 0.01 / 24;
}

/** 這缸水裡的白點藥還有效幾天（至少 1；藥效已經退了回 0）。 */
export function ichMedDays(t: TankState): number {
  return t.water.medication < ICH_MED_WORKING ? 0 : Math.max(1, Math.floor(medDaysLeft(t)));
}

/** 白點掉光以後藥效還要撐幾天：掉到底砂的包囊要一兩天才破完，游出來的蟲碰到藥才會死，藥先退了就會再上身（#384）。 */
export const ICH_MED_TAIL_DAYS = 0.5;

/** 這缸還能用的加熱棒（壞了、拔了插頭的不算）。 */
const workingHeater = (t: TankState) => (t.equipment.heater && !t.equipment.heater.broken ? t.equipment.heater : null);

/** 這缸身上有白點的魚。 */
const ichFish = (t: TankState) => t.fish.filter((f) => f.alive && f.ich.stage === 'visible');

/**
 * 這缸的白點大約幾天會掉（照現在的水溫或加熱棒設的溫度，取高的；加熱棒還在慢慢升溫就照中間算）。
 * assumeHeat：照任務卡把水溫調到 ichHeatC 的話要幾天（還沒調時拿來算藥夠不夠）；exact：不取整數（算藥夠不夠用）。
 */
function ichDropDays(t: TankState, assumeHeat = false, exact = false): number {
  const heater = workingHeater(t);
  // 加熱棒還在慢慢升溫（一天約 2°C）：照現在和設定的中間算，不然天數會說得太短（#359 架構）；壞了的加熱棒調不上去，不能照調高算
  const target = Math.max(heater?.targetC ?? 0, assumeHeat && heater ? ichHeatC(t) : 0);
  const ramping = (heater?.setpointC !== undefined || assumeHeat) && target > t.water.tempC;
  const tf = temperatureFactor(ramping ? (t.water.tempC + target) / 2 : Math.max(t.water.tempC, target));
  let days = 0;
  for (const f of ichFish(t)) days = Math.max(days, ((1 - f.ich.progress) * 96) / tf / 24);
  return exact ? days : Math.max(1, Math.ceil(days));
}

/**
 * 水裡有白點藥，但撐不到白點掉光再多一天（剛換過水把藥沖淡了最常見，#384）：要再補一份。
 * 照任務卡調高水溫的話白點掉得快，用調好後的天數算，免得剛下藥就叫你再下一份。
 */
export function ichMedShort(t: TankState): boolean {
  return t.water.medication >= ICH_MED_WORKING && ichFish(t).length > 0 && medDaysLeft(t) < ichDropDays(t, true, true) + ICH_MED_TAIL_DAYS;
}

/** 這缸正在治白點：有魚身上有白點、水裡的藥還有效。 */
export function treatingIch(t: TankState): boolean {
  return t.water.medication >= ICH_MED_WORKING && ichFish(t).length > 0;
}

/** 治白點中換掉這麼多水，藥會不會被沖淡到撐不到白點掉（換水時提醒要補藥，#384）。 */
export function changeDilutesIch(t: TankState, fraction: number): boolean {
  if (!treatingIch(t)) return false;
  const med = t.water.medication * (1 - fraction);
  return med < ICH_MED_WORKING || Math.log(med / ICH_MED_WORKING) / 0.01 / 24 < ichDropDays(t, true, true) + ICH_MED_TAIL_DAYS;
}

/** 這缸還有魚等著下藥：看得出別的病，或有白點但水裡的白點藥退了、撐不到白點掉。兩缸時「去下藥」切到這缸（#356）。 */
export function needsMedicine(t: TankState): boolean {
  return t.fish.some((f) => f.alive && (hasVisible(f) || (f.ich.stage === 'visible' && t.water.medication < ICH_MED_WORKING))) || ichMedShort(t);
}

/**
 * 看得到的病只有白點、而且那幾缸水裡都還有藥：不用再下（#324）。回傳白點大約幾天會掉（照現在的水溫或加熱棒設的溫度，取高的）、
 * 藥效還剩幾天，和該調到幾度（每缸 ichHeatC 取低的；不比現在高就是 null，不用調）。
 * short：有一缸的藥撐不到白點掉光（換水沖淡了），要補一份（#384）。fixHeater：要升溫的那缸加熱棒壞了，先換一支才調得上去（#389 架構）。
 * 有別的病、或有一缸沒藥了回 null。
 */
export function ichTreatment(tanks: TankState[]): { days: number; medDays: number; heatC: number | null; short: boolean; fixHeater: boolean } | null {
  const sick = tanks.map((t) => ({ t, fish: t.fish.filter((f) => f.alive && (f.ich.stage === 'visible' || hasVisible(f))) })).filter((x) => x.fish.length > 0);
  if (sick.length === 0) return null;
  if (sick.some(({ t, fish }) => t.water.medication < ICH_MED_WORKING || fish.some((f) => hasVisible(f)))) return null;
  let days = 1;
  let medDays = Infinity;
  let heatC = Infinity;
  let warm = true;
  let short = false;
  let fixHeater = false;
  for (const { t } of sick) {
    heatC = Math.min(heatC, ichHeatC(t));
    const hot = Math.max(t.water.tempC, workingHeater(t)?.targetC ?? 0) >= ichHeatC(t) - 0.5;
    warm &&= hot;
    fixHeater ||= !hot && !workingHeater(t);
    days = Math.max(days, ichDropDays(t));
    medDays = Math.min(medDays, ichMedDays(t));
    short ||= ichMedShort(t);
  }
  return { days, medDays, heatC: warm ? null : heatC, short, fixHeater };
}

/** 生病時的下一步：白點藥效中就叫玩家調水溫等，不要再叫下藥（#324）。 */
function sickStep(tanks: TankState[]): Omit<NextStep, 'goal'> {
  const ich = ichTreatment(tanks);
  // 要下藥但最便宜的藥都買不起：叫玩家先交訂單湊錢，不要一直叫補藥（#391）
  if (!ich || ich.short) {
    const cost = ich ? price('med:ich') : Math.min(price('med:ich'), price('med:antibiotic'), price('med:dewormer'));
    const { coins, mall } = economy(tanks[0]);
    if (coins < cost && !(mall?.cure ?? 0)) return { text: `藥要 ${cost} 元（還差 ${cost - coins} 元），先交訂單湊錢`, target: 'orders' };
  }
  if (ich?.short) return { text: '藥效撐不到白點掉，再補一份藥', target: 'treat' };
  if (ich) return { text: `藥效中，${ich.heatC ? `${ich.fixHeater ? '加熱棒壞了，換一支再' : '水溫'}調到 ${ich.heatC}°C，` : ''}約 ${ich.days} 天會好`, target: 'treat' };
  return { text: '有魚生病了，去下藥', target: 'treat' };
}
const bredFry = (tanks: TankState[]) => living(tanks).filter((f) => (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && growthStage(f) === 'fry');

/** 沒寫到的目標用的保底句。 */
export const GENERIC_STEP = '看看任務卡上的目標';

/** 肚子看得出懷孕、懷孕最久的那尾母魚和她在第幾缸（下一步「點她看看肚子」帶去看她）；沒有回傳 null。 */
export function showingMother(tanks: TankState[]): { tank: number; fish: Fish } | null {
  let best: { tank: number; fish: Fish } | null = null;
  tanks.forEach((t, tank) =>
    t.fish.forEach((fish) => {
      if (!fish.alive || fish.sex !== 'female' || fish.pregnancy < BELLY_SHOWS || isShrimpSpecies(fish.species)) return;
      if (!best || fish.pregnancy > best.fish.pregnancy) best = { tank, fish };
    }),
  );
  return best;
}

/** 「養大 5 條」幾天沒前進就換說法（企劃 tutorial-lines.md §7）。 */
export const RAISE_STUCK_HOURS = 72;

/** 還沒轉色的自家小魚裡最快轉色的那尾、在第幾缸、還差幾天（標準照顧估算）；沒有回傳 null。 */
export function fastestColoring(tanks: TankState[]): { tank: number; fish: Fish; days: number } | null {
  let best: { tank: number; fish: Fish; days: number } | null = null;
  tanks.forEach((t, tank) =>
    t.fish.forEach((fish) => {
      if (!fish.alive || (fish.generation ?? 0) < 1 || isShrimpSpecies(fish.species)) return;
      const days = daysToLength(fish, maxLengthCm(fish) * COLORING_AT);
      if (days > 0 && Number.isFinite(days) && (!best || days < best.days)) best = { tank, fish, days };
    }),
  );
  return best;
}

/** 「養大 5 條」卡超過 3 天：主缸小魚最近被吃就叫玩家撈進育幼盒，不然說最快那尾還差幾天。 */
function raiseStuckStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  const since = goalState(tanks).raised?.[1];
  const now = tanks[0].hours;
  if (since === undefined || now - since <= RAISE_STUCK_HOURS) return null;
  const eaten = tanks.some((t) => t.fish.some((f) => f.alive && !f.nursery && (f.generation ?? 0) >= 1 && growthStage(f) === 'fry') && t.events.some((e) => e.type === 'fry_eaten' && t.hours - e.hours <= RAISE_STUCK_HOURS));
  if (eaten) return { text: '小魚在主缸會被吃，撈進育幼盒', target: 'fry_box' };
  const fast = fastestColoring(tanks);
  // 帶上累計數字：交單拿走小魚時倒數會變長，但數字不會掉（#303），玩家看得出不是倒退
  return fast ? { text: `養到轉色 ${Math.min(5, raisedCount(tanks))}/5，最快的那尾還差約 ${fast.days} 天`, target: 'fastest' } : null;
}

/** 母魚快生了（要育幼盒）或肚子看得出懷孕時的下一步；都沒有回傳 null。 */
function motherStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  if (tanks.some((t) => dueMothers(t).length > 0)) return tanks.some((t) => t.nurseryBox && dueMothers(t).length > 0) ? { text: '母魚快生了，放進育幼盒', target: 'nursery' } : { text: '母魚快生了，買個育幼盒', target: 'nursery' };
  const mom = showingMother(tanks);
  if (!mom) return null;
  if (!mom.fish.bellySeen) return { text: '母魚懷孕了，點她看看肚子', target: 'mother' };
  // 看過肚子了：換成倒數，不要一直叫玩家做已經做過的事（#282）
  const days = Math.max(1, Math.round(daysToBirth(tanks[mom.tank], mom.fish) ?? 1));
  const t = tanks[mom.tank];
  if (t.nurseryBox || !economy(tanks[0]).nurseryGifted) return { text: `她大約 ${days} 天後生，快生了會提醒你`, target: 'mother' };
  return { text: `她大約 ${days} 天後生，先備好育幼盒`, target: 'nursery' };
}

/** 每個目標在現在的狀況下要做的事。 */
function stepFor(goal: Goal, tanks: TankState[]): Omit<NextStep, 'goal'> {
  const home = tanks[0];
  switch (goal.id) {
    case 'cycled':
      // 養水是背景目標（U2）：這段時間不要只叫玩家等（g13 門檻 3）。店裡的母魚常常已經懷孕，有就去看她；沒有就趁空造景。
      // 不叫玩家多餵：新缸要少餵，懷孕母魚現實上也不用多餵（企劃 2026-10-21）
      return motherStep(tanks) ?? { text: '趁養水，拖塊石頭或水草造景', target: 'scape' };
    case 'protect_fry':
      if (bredFry(tanks).length > 0) return { text: '小魚還小，一天餵兩次', target: 'feed' };
      return motherStep(tanks) ?? { text: '餵飽母魚，等她懷孕', target: 'feed' };
    case 'raise5': {
      const feedStep = { text: `小魚一天餵兩次，養到轉色（${Math.min(5, raisedCount(tanks))}/5）`, target: 'feed' } as const;
      // 「一天餵兩次」只在小魚真的餓了才說；其他時候說選育走到哪（midgame.md §2）
      if (bredFry(tanks).some((f) => f.hunger >= HUNGRY)) return feedStep;
      const breeding = breedingStep?.(tanks) ?? null;
      return raiseStuckStep(tanks) ?? (breeding ? { text: breeding, target: 'fastest' } : feedStep);
    }
    case 'sale': {
      const ready = orderBoard(home).orders.some((o) => orderSupply(tanks, o) >= o.count);
      return ready ? { text: '有訂單交得出貨，去交貨', target: 'orders' } : { text: '賣一尾魚，或看看訂單板', target: 'sell' };
    }
    case 'second_tank': {
      const need = newTankCost(tanks, 'nano20') - economy(home).coins;
      if (need <= 0) return { text: '錢夠了，去買第二個缸', target: 'shop_tank' };
      // 存錢是背景目標（第一窩一出生就出，#305）：小魚還在等轉色時，下一步照舊叫玩家顧小魚
      const raise = GOALS.find((g) => g.id === 'raise5')!;
      if (!goalState(tanks).done.includes('raise5')) return stepFor(raise, tanks);
      return { text: `再存 ${need} 魚幣買第二個缸`, target: 'orders' };
    }
    case 'cure':
      return anySick(tanks) ? sickStep(tanks) : { text: '每天測水，魚生病就治好牠', target: 'test' };
    case 'shrimp':
      return living(tanks).some((f) => f.species === 'cherry_shrimp') ? { text: '顧好水質，等母蝦抱蛋', target: 'test' } : { text: '買幾隻米蝦，開個蝦缸', target: 'shop_fish' };
    case 'calm': {
      const g = goalState(tanks);
      const best = Math.max(0, ...tanks.map((t, i) => Math.floor((t.hours - (g.calmSince[i] ?? t.hours)) / 24)));
      return { text: `每天測水，${CALM_DAYS} 天沒警告（${Math.min(best, CALM_DAYS)}/${CALM_DAYS}）`, target: 'test' };
    }
    case 'breeding_tank':
      return { text: `小魚搬去繁殖缸養大（${Math.min(PURPOSE_GOAL_COUNT.breeding, breedingTankRaised(tanks))}/${PURPOSE_GOAL_COUNT.breeding}）`, target: 'shop_tank' };
    case 'display_tank': {
      const lit = purposeTanks(tanks, 'display').some((t) => t.equipment.light?.spec.id === 'planted');
      if (!lit) return { text: '展示缸換上水草燈', target: 'shop_gear' };
      return { text: `展示缸種陽性草（${Math.min(PURPOSE_GOAL_COUNT.display, displayTankHighPlants(tanks))}/${PURPOSE_GOAL_COUNT.display}）`, target: 'shop_plants' };
    }
    case 'strain':
    case 'fins':
      return { text: '挑漂亮的公母配對留種', target: 'select' };
    // 新目標忘了在這裡加一句時的保底（測試會抓到）
    default:
      return { text: GENERIC_STEP, target: 'test' };
  }
}

/** 現在的下一步；目標全做完了回傳 null。 */
export function nextStep(tanks: TankState[]): NextStep | null {
  const [goal] = nextGoals(tanks, 1);
  if (!goal || !tanks[0]) return null;
  // 生病不等人：不管現在是哪個目標，先叫玩家治療（體驗第 15 輪 #291：白點 5 天，下一步還在說母魚倒數）
  if (anySick(tanks)) return { goal: goal.id, ...sickStep(tanks) };
  return { goal: goal.id, ...stepFor(goal, tanks) };
}
