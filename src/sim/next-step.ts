import { freshBigBrood } from './brood-water';
import { hideGrace } from './choice-echo';
import { economy, LOAN_PAUSE_COINS, price } from './economy';
import { raiseCashStep } from './raise-cash';
import { canSalt, SALT_DAYS, saltDaysLeft, saltWorking } from './salt-cure';
import { HUNGRY } from './readings';
import { breathless, oxygenFix } from './oxygen';
import { CALM_DAYS, GOALS, goalState, nextGoals, PURPOSE_GOAL_COUNT, raisedCount, type Goal } from './goals';
import { COLORING_AT, daysToLength, daysUntilSexVisible, growthStage, maxLengthCm, PICK_AFTER_BROOD_DAYS, sexVisible } from './growth';
import { ID_BLOCK, newTankCost, tankLabel } from './household';
import { BELLY_SHOWS, daysToBirth, dueMothers, NURSERY_FRY_CAPACITY, nurseryFish, soonMother } from './nursery';
import { orderBoard, orderSupply } from './orders';
import { temperatureFactor } from './chemistry';
import { hasVisible } from './processes/disease';
import { HEATER_RAMP_C_PER_HOUR, heaterLiftC } from './processes/thermal';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { isJuvenile, type Fish, type TankState } from './state';
import { fryHome, fryNeedHome, fryPrep } from './split';
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
  | 'remove_dead' // 危機（#375）：切到那缸、拿網子撈死魚
  | 'insulate' // 冬天沒加熱棒（#397）：切到那缸、一鍵臨時保溫（包毛巾、泡溫水瓶）
  | 'heater_credit' // 冬天沒錢換加熱棒（#397）：切到那缸、跟阿德賒一支
  | 'move_warm' // 冬天加熱棒弄不到（#400）：冷缸的魚連袋子泡進有加熱棒的缸、慢慢對水再放
  | 'buy_heater' // 冬天錢不夠換同款（#404）：買一支撐得住的便宜加熱棒裝上
  | 'move_fry' // 小魚在這缸會被吃、另一缸養好水了（#425）：一鍵把小魚搬過去
  | 'cycle_tank' // 小魚要搬家、新缸還沒養水（#428）：打開「新缸要怎麼養水？」
  | 'nursery_soon' // 育幼盒空著、母魚快生了（polish-to-9.md §9.1）：點一下就把她放進去
  | 'water_change' // 缺氧又沒打氣可加、大窩生在小缸（polish-to-9.md §10 補充）：切到那缸、打開換水
  | 'add_air'; // 缺氧：打開打氣機，沒有就買一台裝上（oxygen.ts）

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

/** 白點掉光以後藥效還要撐幾天：掉到底砂的包囊要一兩天才破完，游出來的蟲碰到藥才會死，藥先退了就會再上身（#384）。半天太保守：冬天換三成水就叫補藥，6 小時就夠（#411，每個月的劇本都跑過）。 */
export const ICH_MED_TAIL_DAYS = 0.25;

/** 這缸還能用的加熱棒（壞了、拔了插頭的不算）。 */
const workingHeater = (t: TankState) => (t.equipment.heater && !t.equipment.heater.broken ? t.equipment.heater : null);

/** 這缸身上有白點的魚。 */
const ichFish = (t: TankState) => t.fish.filter((f) => f.alive && f.ich.stage === 'visible');

/**
 * 這缸的白點大約幾天會掉（照現在的水溫或加熱棒設的溫度，取高的；加熱棒還在慢慢升溫就照中間算）。
 * assumeHeat：照任務卡把水溫調到 ichHeatC 的話要幾天（還沒調時拿來算藥夠不夠）；exact：不取整數（算藥夠不夠用）。
 */
export function ichDropDays(t: TankState, assumeHeat = false, exact = false): number {
  const heater = workingHeater(t);
  // 壞了的加熱棒調不上去，不能照調高算
  const target = Math.max(heater?.targetC ?? 0, assumeHeat && heater ? ichHeatC(t) : 0);
  const ramping = (heater?.setpointC !== undefined || assumeHeat) && target > t.water.tempC;
  const left = Math.max(0, ...ichFish(t).map((f) => 1 - f.ich.progress));
  if (left === 0) return exact ? 0 : 1;
  let hours: number;
  if (!ramping) hours = (left * 96) / temperatureFactor(Math.max(t.water.tempC, target));
  else {
    // 加熱棒還在慢慢升溫（一天約 2°C，#359 架構）：一小時一小時照升上去的水溫算。
    // 冬天室溫低時加熱棒升不到設定，照它撐得到的算（#411：用中間值算太保守，調水溫前就叫你補藥）
    const reach = Math.min(target, t.environment.roomTempC + heaterLiftC(t.equipment.tank.volumeL, heater!.spec.watts) - 0.5);
    let done = 0;
    hours = 0;
    while (done < left * 96 && hours < 60 * 24) {
      hours++;
      done += temperatureFactor(Math.max(t.water.tempC, Math.min(reach, t.water.tempC + HEATER_RAMP_C_PER_HOUR * hours)));
    }
  }
  const days = hours / 24;
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

/** 這缸還有魚等著下藥：看得出別的病，或有白點但水裡的白點藥退了、撐不到白點掉。兩缸時「去下藥」切到這缸（#356）。 */
export function needsMedicine(t: TankState): boolean {
  return t.fish.some((f) => f.alive && (hasVisible(f) || (f.ich.stage === 'visible' && t.water.medication < ICH_MED_WORKING && !salted(t)))) || ichMedShort(t);
}

/** 這缸正在用 30°C 加粗鹽治白點，水裡的鹽還夠（mvp.md §4.4.6 g33）。 */
const salted = saltWorking;

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
  const sick = tanks.filter((t) => t.fish.some((f) => f.alive && (f.ich.stage === 'visible' || hasVisible(f))));
  const onlyIch = sick.every((t) => !t.fish.some((f) => f.alive && hasVisible(f)));
  // 用粗鹽治白點中（g33）：不叫你再下藥
  if (onlyIch && sick.length > 0 && sick.every((t) => salted(t) || t.water.medication >= ICH_MED_WORKING) && sick.some(salted))
  {
    const left = Math.max(...sick.map(saltDaysLeft));
    return { text: left > 0 ? `粗鹽治白點中（水溫 30°C），約 ${left} 天會好` : '粗鹽治白點中，白點還沒斷根：鹽和 30°C 先維持，換水會照換掉的量補鹽', target: 'treat' };
  }
  const ich = ichTreatment(tanks);
  // 還欠阿德錢、買了藥手上就剩不到 LOAN_PAUSE_COINS：先用便宜的粗鹽，錢留著回血（g33）
  const e = economy(tanks[0]);
  if (!ich && onlyIch && (e.heaterLoan ?? 0) > 0 && e.coins - price('med:ich') < LOAN_PAUSE_COINS && e.coins >= price('med:ich')) {
    const i = sick.findIndex(canSalt);
    if (i >= 0)
      return { text: `還欠阿德錢，白點藥（${price('med:ich')} 元）先省下來：水溫調到 30°C、加一點粗鹽（${price('med:salt')} 元），約 ${SALT_DAYS} 天會好`, target: 'treat', tank: tanks.indexOf(sick[i]) };
  }
  // 要下藥但最便宜的藥都買不起：叫玩家先交訂單湊錢，不要一直叫補藥（#391）
  if (!ich || ich.short) {
    const cost = ich ? price('med:ich') : Math.min(price('med:ich'), price('med:antibiotic'), price('med:dewormer'));
    const { coins, mall } = e;
    const raise = coins < cost && !(mall?.cure ?? 0) ? raiseCashStep(tanks, '藥', cost) : null;
    // 白點藥買不起：先用 30°C 加粗鹽（20 元），蝦怕鹽的缸不行（mvp.md §4.4.6 g33：連 3 天買不起藥）
    const saltable = raise && onlyIch && !ich ? sick.findIndex(canSalt) : -1;
    if (saltable >= 0)
      return { text: `白點藥要 ${price('med:ich')} 元買不起，先用便宜的治法：水溫調到 30°C、加一點粗鹽（${price('med:salt')} 元），約 ${SALT_DAYS} 天會好`, target: 'treat', tank: tanks.indexOf(sick[saltable]) };
    if (raise) return { text: raise.text, target: raise.target };
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

/** C1 選了躲草、還在讓小魚自己躲的那 3 天（choice-echo.ts hideGrace）。 */
const hiding = (tanks: TankState[]) => hideGrace(tanks, economy(tanks[0]).choices);

/** 「養大 5 條」卡超過 3 天：主缸小魚最近被吃就叫玩家撈進育幼盒，不然說最快那尾還差幾天。 */
function raiseStuckStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  if (hiding(tanks)) return null;
  const since = goalState(tanks).raised?.[1];
  const now = tanks[0].hours;
  if (since === undefined || now - since <= RAISE_STUCK_HOURS) return null;
  const eaten = tanks.some((t) => t.fish.some((f) => f.alive && !f.nursery && (f.generation ?? 0) >= 1 && growthStage(f) === 'fry') && t.events.some((e) => e.type === 'fry_eaten' && t.hours - e.hours <= RAISE_STUCK_HOURS));
  if (eaten) return { text: '小魚在主缸會被吃，撈進育幼盒', target: 'fry_box' };
  const fast = fastestColoring(tanks);
  // 帶上累計數字：交單拿走小魚時倒數會變長，但數字不會掉（#303），玩家看得出不是倒退
  return fast ? { text: `養到轉色 ${Math.min(5, raisedCount(tanks))}/5，最快的那尾還差約 ${fast.days} 天`, target: 'fastest' } : null;
}

/** 主缸小魚最近被吃多久內算「還在被吃」（育幼盒滿了的提示用）。 */
const FRY_EATEN_RECENT_HOURS = 48;

/**
 * 只有一缸、育幼盒滿了、外面的小魚最近還在被吃，錢又夠買第二缸：馬上叫玩家去買（g35：之前停在「一天餵兩次」5 天）。
 * 錢不夠回 null（照原本的步驟）。
 */
function boxFullStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  if (tanks.length !== 1 || hiding(tanks)) return null;
  const t = tanks[0];
  if (!t.nurseryBox || nurseryFish(t).filter(isJuvenile).length < NURSERY_FRY_CAPACITY) return null;
  const exposed = t.fish.some((f) => f.alive && !f.nursery && (f.generation ?? 0) >= 1 && growthStage(f) === 'fry');
  const eaten = t.events.some((e) => e.type === 'fry_eaten' && t.hours - e.hours <= FRY_EATEN_RECENT_HOURS);
  if (!exposed || !eaten || economy(t).coins < newTankCost(tanks, 'nano20')) return null;
  return { text: '育幼盒滿了，小魚會被吃。買第二個缸給小魚住', target: 'shop_tank' };
}

/** 還沒交過任何單、起步單的小螺缸裡已經湊得齊（第一次買水草附送的螺）：叫玩家去交（polish-to-9.md §7.2：第一筆收入在第 5 分鐘以內）。 */
function starterStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  const board = orderBoard(tanks[0]);
  if (board.done > 0) return null;
  const o = board.orders.find((x) => !x.preview && !x.gap && x.kind === 'snail' && orderSupply(tanks, x) >= x.count);
  return o ? { text: `阿德有一張起步單：交 ${o.count} 隻小螺`, target: 'orders' } : null;
}

/** 母魚快生了（要育幼盒）或肚子看得出懷孕時的下一步（看過肚子、還沒交過單就先交起步單）；都沒有回傳 null。 */
function motherStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  if (tanks.some((t) => dueMothers(t).length > 0)) return tanks.some((t) => t.nurseryBox && dueMothers(t).length > 0) ? { text: '母魚快生了，放進育幼盒', target: 'nursery' } : { text: '母魚快生了，買個育幼盒', target: 'nursery' };
  const mom = showingMother(tanks);
  if (mom && !mom.fish.bellySeen) return { text: '母魚懷孕了，點她看看肚子', target: 'mother' };
  const starter = starterStep(tanks);
  if (starter) return starter;
  if (!mom) return null;
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
      if (bredFry(tanks).length > 0) return boxFullStep(tanks) ?? { text: '小魚還小，一天餵兩次', target: 'feed' };
      return motherStep(tanks) ?? { text: '餵飽母魚，等她懷孕', target: 'feed' };
    case 'raise5': {
      const feedStep = { text: `小魚一天餵兩次，養到轉色（${Math.min(5, raisedCount(tanks))}/5）`, target: 'feed' } as const;
      // 「一天餵兩次」只在小魚真的餓了才說；其他時候說選育走到哪（midgame.md §2）
      const full = boxFullStep(tanks);
      if (full) return full;
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
      // 帶上展示缸是哪一缸：點了先切過去再開商店，水草燈、陽性草才會放進展示缸（#441）
      const display = purposeTanks(tanks, 'display');
      const lit = display.some((t) => t.equipment.light?.spec.id === 'planted');
      const at = (t: TankState | undefined) => (t ? { tank: tanks.indexOf(t) } : {});
      if (!lit) return { text: '展示缸換上水草燈', target: 'shop_gear', ...at(display[0]) };
      return { text: `展示缸種陽性草（${Math.min(PURPOSE_GOAL_COUNT.display, displayTankHighPlants(tanks))}/${PURPOSE_GOAL_COUNT.display}）`, target: 'shop_plants', ...at(display.find((t) => t.equipment.light?.spec.id === 'planted') ?? display[0]) };
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
  // 魚在水面喘氣：缺氧幾天就會整缸死（strain-fixing 種子 5：53 尾小魚搬進 20L 缸，溶氧 1.5 撐了 9 天沒人說）。
  // 只有真的在傷魚才出卡（只是浮頭的早上報告先說，不搶任務卡）；排在治病前面：治白點要調高水溫，氧更少
  const gasp = gaspStep(tanks);
  if (gasp) return { goal: goal.id, ...gasp };
  // 生病不等人：不管現在是哪個目標，先叫玩家治療（體驗第 15 輪 #291：白點 5 天，下一步還在說母魚倒數）
  if (anySick(tanks)) return { goal: goal.id, ...sickStep(tanks) };
  // 大窩生在小缸：生的那兩天每天換三成水，不然 KH 吃光、氨一晚就衝上去（polish-to-9.md §10 補充）
  const water = broodWaterStep(tanks);
  if (water) return { goal: goal.id, ...water };
  // 小魚在被吃、別缸已經能收：先搬（g36 #425：第二缸養好水 5 天都空著，小魚被吃 17 尾）
  // C1 選了躲草：3 天內不叫玩家搬小魚、買缸，被吃到剩一半才叫（polish-to-9.md §10.1）
  const fry = hiding(tanks) ? null : (fryMoveStep(tanks) ?? fryPrepStep(tanks));
  if (fry) return { goal: goal.id, ...fry };
  // 育幼盒空了、又有母魚快生：排在照顧句前面（g38：第一窩搬走後沒人叫，第二窩生在主缸被吃 3 尾）
  const box = soonMotherStep(tanks);
  if (box) return { goal: goal.id, ...box };
  return { goal: goal.id, ...rotateStale(tanks, stepFor(goal, tanks), goal) };
}

/** 有缸缺氧到傷魚（小魚也算，oxygen.ts）：打氣機關著就打開、買得起就加一台，不然先換水。 */
function gaspStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  // 先挑最缺的那缸
  const worst = tanks.map((t, tank) => ({ tank, b: breathless(t) })).filter((x) => x.b?.harm && !x.b.recovering).sort((a, b) => a.b!.o2 - b.b!.o2)[0];
  if (!worst) return null;
  const { tank } = worst;
  const where = tanks.length > 1 ? tankLabel(tanks, tank) : '缸裡';
  const fix = oxygenFix(tanks[tank]);
  if (fix === 'water') return { text: `${where}的魚在水面喘氣，水裡缺氧，先換水`, target: 'water_change', tank };
  return { text: `${where}缺氧，魚在水面喘氣，${fix === 'air_on' ? '打開打氣機' : '加一台打氣機'}`, target: 'add_air', tank };
}

/** 大窩生在小缸、今天還沒換水：生的當天說「今天先換三成水」，隔天說「今天再換三成水」（點下去就是現在換）。 */
function broodWaterStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  for (let tank = 0; tank < tanks.length; tank++) {
    const b = freshBigBrood(tanks[tank]);
    if (b) return { text: `一窩 ${b.n} 尾生在 ${b.liters}L 的缸，今天${b.today ? '先' : '再'}換三成水`, target: 'water_change', tank };
  }
  return null;
}

/** 育幼盒空著、有母魚懷孕 ≥ BOX_DUE（約剩 3 天，polish-to-9.md §9.1）：叫玩家把她放進去。盒裡還有小魚的照 #430（買第二缸或搬小魚）。 */
function soonMotherStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  for (let tank = 0; tank < tanks.length; tank++) {
    const mom = soonMother(tanks[tank]);
    if (mom) return { text: `育幼盒空了，把快生的${FISH_SPECIES[mom.species].name}母魚 #${mom.id % ID_BLOCK} 放進去`, target: 'nursery_soon', tank };
  }
  return null;
}

/** 有缸的小魚需要搬家，而且另一缸養好水、沒有會吃小魚的成魚：叫玩家把小魚搬過去。 */
function fryMoveStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  const from = tanks.findIndex((t, i) => fryNeedHome(t) && fryHome(tanks, i) !== null);
  if (from < 0) return null;
  const to = fryHome(tanks, from)!;
  return { text: `${tankLabel(tanks, to)}養好水了，把小魚搬過去`, target: 'move_fry', tank: from };
}

/**
 * 小魚要搬家、還沒有缸收得了（g37 #428）：有空的新缸就先養水（已經在養就說等幾天），
 * 只有一缸、育幼盒幫不上忙（盒子滿了，或盒裡有小魚、母魚又快生了）就叫玩家買第二缸。錢不夠照原本的步驟。
 */
function fryPrepStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  for (let from = 0; from < tanks.length; from++) {
    const prep = fryPrep(tanks, from);
    if (!prep) continue;
    if (prep.kind === 'cycle') {
      const label = tankLabel(tanks, prep.tank);
      return prep.started ? { text: `${label}在養水，養好就能把小魚搬過去`, target: 'test', tank: prep.tank } : { text: `${label}先養水，小魚才搬得過去`, target: 'cycle_tank', tank: prep.tank };
    }
    if (!prep.afford) continue;
    const full = nurseryFish(tanks[from]).filter(isJuvenile).length >= NURSERY_FRY_CAPACITY;
    return { text: full ? '育幼盒滿了，小魚會被吃。買第二個缸給小魚住' : '母魚又懷孕了，盒裡還有小魚。買第二缸給小魚住', target: 'shop_tank' };
  }
  return null;
}

/** 任務卡同一句停多久就開始輪播進度句（polish-to-9.md §8.2）。 */
export const STALE_STEP_HOURS = 72;
/** 輪播時每句停多久。 */
const ROTATE_HOURS = 12;
/** 「等著」的句子：輪播時穿插養小魚的進度句。 */
const WAITING: ReadonlySet<NextTarget> = new Set(['feed', 'fastest', 'mother']);

/**
 * 同一句停超過 STALE_STEP_HOURS：跟原句輪流出現別的句子，原句換了就重新算。
 * - 「等著」的句子（餵食、等轉色、等母魚生）：穿插跟目標有關的進度句（最大的那尾多大、育幼盒裡幾尾、最快的還差幾天轉色），
 *   玩家看得出事情在往前走（g35：「小魚還小，一天餵兩次」停了 8 分鐘）。
 * - 要玩家動手、但玩家一直沒做的句子（買水草燈、搬去繁殖缸…）：穿插其他還沒完成的目標的下一步，
 *   不讓一句佔住任務卡幾十天，交單、配對這些也排得上（#434，g39：「展示缸換上水草燈」停了 60 天）。
 */
function rotateStale(tanks: TankState[], step: Omit<NextStep, 'goal'>, goal: Goal): Omit<NextStep, 'goal'> {
  const e = economy(tanks[0]);
  const now = tanks[0].hours;
  if (e.stepSince?.text !== step.text) e.stepSince = { text: step.text, hours: now };
  const age = now - e.stepSince.hours;
  if (age < STALE_STEP_HOURS) return step;
  const others = WAITING.has(step.target) ? progressLines(tanks) : otherGoalSteps(tanks, goal);
  const lines = others.filter((x, i) => x.text !== step.text && others.findIndex((y) => y.text === x.text) === i);
  if (lines.length === 0) return step;
  const all = [...lines, step];
  return all[Math.floor((age - STALE_STEP_HOURS) / ROTATE_HOURS) % all.length];
}

/** 輪播時最多穿插幾個其他目標的下一步。 */
const OTHER_GOALS = 3;

/** 其他還沒完成的目標的下一步（排在前面的先）。 */
function otherGoalSteps(tanks: TankState[], goal: Goal): Array<Omit<NextStep, 'goal'>> {
  return nextGoals(tanks, OTHER_GOALS + 1)
    .filter((g) => g.id !== goal.id)
    .slice(0, OTHER_GOALS)
    .map((g) => stepFor(g, tanks));
}

/**
 * 「再幾天看得出公母」：第一窩照選種日算（跟早上報告、選種卡同一個數字，g37：任務卡說 33 天、報告說 7 天），
 * 選種日過了就不說（選種卡已經照基因寫了公母）；之後的窩照轉色進度估。
 */
function sexLine(tanks: TankState[], big: Fish): string | null {
  const s = economy(tanks[0]).choices;
  const first = s?.firstBrood;
  if (first !== undefined && big.bornHours !== undefined && Math.abs(big.bornHours - first) < 24) {
    const left = Math.ceil(PICK_AFTER_BROOD_DAYS - (tanks[0].hours - first) / 24);
    return left > 0 ? `最大的那尾 ${big.lengthCm.toFixed(1)} cm 了，再 ${left} 天看得出公母` : null;
  }
  return `最大的那尾 ${big.lengthCm.toFixed(1)} cm 了，再 ${daysUntilSexVisible(big)} 天看得出公母`;
}

/** 跟養小魚有關的進度句（沒有自家小魚回空陣列）。 */
function progressLines(tanks: TankState[]): Array<Omit<NextStep, 'goal'>> {
  const young = living(tanks).filter((f) => (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && !sexVisible(f));
  if (young.length === 0) return [];
  const out: Array<Omit<NextStep, 'goal'>> = [];
  const big = young.reduce((a, b) => (b.lengthCm > a.lengthCm ? b : a));
  const sex = sexLine(tanks, big);
  if (sex) out.push({ text: sex, target: 'fastest' });
  const t = tanks.find((x) => x.nurseryBox && nurseryFish(x).some(isJuvenile));
  if (t) {
    const eaten = t.events.filter((ev) => ev.type === 'fry_eaten' && t.hours - ev.hours <= 24).reduce((n, ev) => n + (ev.count ?? 1), 0);
    out.push({ text: `育幼盒裡 ${nurseryFish(t).filter(isJuvenile).length} 尾，今天被吃 ${eaten} 尾`, target: 'fry_box', tank: tanks.indexOf(t) });
  }
  const fast = fastestColoring(tanks);
  if (fast) out.push({ text: `最快的那尾再約 ${fast.days} 天轉色`, target: 'fastest' });
  return out;
}
