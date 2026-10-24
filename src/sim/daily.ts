import { addHardscape } from './actions';
import { addCuttings, economy, FOOD_PER_MEAL, PLANT_PRICES, price } from './economy';
import { HARDSCAPE } from './equipment';
import { phenotype } from './genetics';
import { fastestColoring, showingMother } from './next-step';
import { dueMothers, nurseryRefusal } from './nursery';
import { isCycled } from './processes/nitrogen';
import { FISH_SPECIES, isShrimpSpecies, PLANT_SPECIES, type PlantSpeciesId } from './species';
import { tankStarted } from './setup';
import { crowdingRatio } from './processes/fauna';
import { CROWD_WARN } from './split';
import { ADULT_SIZE, noteAct, type DailyAct, type Fish, type TankState } from './state';

/**
 * 每日 3 件小事（design/first-10-minutes.md F3）：每個遊戲天早上從玩家缸裡做得到的事挑 3 件，
 * 全部做完開寶箱（獎勵池，polish-to-9.md U5；寶箱演出由畫面負責）。不出做不到的題目：沒有螺就不出找螺、沒有長太長的草就不出修剪。
 * 題庫分照顧、觀察、造景、整理四類（U6），同一題 3 天內不重複；造景題要手上或缸裡有石頭、沉木才出。
 * 小事不能要玩家花錢（mvp.md §4.4.2，#188）：會花錢的題目，花費要比寶箱最少的魚幣少很多才出（DAILY_COST）。
 * 判定看出題以後玩家有沒有再做一次（任何一缸都算）；要點畫面的題目（找螺、看魚、翻圖鑑…）由畫面呼叫 markDaily。
 * 跟著目標走（design/daily-loop.md §3）：3 題裡至少 2 題跟現在的目標有關（看懷孕母魚的胎斑、點最快轉色的那尾…），
 * 造景、整理一天最多 1 題，造景題要 7 天沒動過造景才出；會攪沙嚇到魚的造景題（搬石頭、翻面、換層、縮放）不再出。
 * 同一天出題前就做過的也算（例如早上已經換過水了）。
 */

export type DailyCategory = 'goal' | 'care' | 'observe' | 'scape' | 'tidy';

export const DAILY_CATEGORY_LABEL: Record<DailyCategory, string> = { goal: '目標', care: '照顧', observe: '觀察', scape: '造景', tidy: '整理' };

/** 每一題屬於哪一類（題庫，U6）。 */
export const DAILY_CATEGORY = {
  goalBelly: 'goal',
  goalColor: 'goal',
  goalKeeper: 'goal',
  goalAlbino: 'goal',
  goalOrders: 'goal',
  test: 'care',
  feed: 'care',
  water: 'care',
  topup: 'care',
  nursery: 'care',
  gear: 'care',
  observe: 'observe',
  snail: 'observe',
  shrimp: 'observe',
  plant: 'observe',
  records: 'observe',
  codex: 'observe',
  orders: 'observe',
  scape: 'scape',
  scapePlant: 'scape',
  scapeFlip: 'scape',
  scapeLayer: 'scape',
  scapeScale: 'scape',
  scapePlace: 'scape',
  trim: 'tidy',
  cuttings: 'tidy',
  clutch: 'tidy',
  pests: 'tidy',
  deadSnail: 'tidy',
  rinse: 'tidy',
} as const satisfies Record<string, DailyCategory>;

export type DailyTaskId = keyof typeof DAILY_CATEGORY;
export const DAILY_IDS = Object.keys(DAILY_CATEGORY) as DailyTaskId[];

export const DAILY_COUNT = 3;
/** 每天至少幾題跟現在的目標有關（daily-loop.md §3）。 */
export const DAILY_GOAL_COUNT = 2;
/** 造景題要玩家幾天沒動過造景才出。 */
export const SCAPE_IDLE_DAYS = 7;
/** 會攪起底沙、嚇到魚的造景題（搬石頭、翻面、換層、縮放）：不再出（舊存檔的題目照樣判定）。 */
const RETIRED: ReadonlySet<DailyTaskId> = new Set(['scape', 'scapeFlip', 'scapeLayer', 'scapeScale']);
/** 新的一窩出生幾天後看得出紅眼睛（choices.ts 的 ALBINO_DAYS）、幾天內還算「新的一窩」。 */
const ALBINO_SHOWS_DAYS = 5;
const NEW_BROOD_DAYS = 25;
/** 同一題至少隔幾天才再出（出過的第 3 天才能再出）。 */
export const DAILY_GAP_DAYS = 3;
/** 多久沒換水才出「換水」題（不鼓勵天天大換水）。 */
const WATER_TASK_GAP_HOURS = 4 * 24;
/** 多久沒洗濾材才出「洗濾材」題（洗太勤會沖掉硝化菌）。 */
const RINSE_TASK_GAP_HOURS = 14 * 24;
/** 水位低於幾成才出「補水」題（一週約蒸發 1%）。 */
const TOPUP_TASK_LEVEL = 0.98;

/** 寶箱的魚幣（獎勵池抽到魚幣時 20～30）。 */
export const CHEST_COINS_MIN = 20;
export const CHEST_COINS_MAX = 30;
/**
 * 寶箱魚幣上限（polish-to-9.md §4，2026-10-20 修訂）：到第 CHEST_CAP_DAY 天（含）為止，寶箱開出的魚幣累計不超過這個數，
 * 是 §4.3 第 60 天收入目標 800 的一半，玩家主要還是靠繁殖和交單賺錢。快到上限時只給剩下的額度，用完以後抽到魚幣改給一罐飼料。
 */
export const CHEST_COINS_CAP = 400;
export const CHEST_CAP_DAY = 60;
/** 連續幾天開寶箱送大寶箱（大寶箱不給魚幣，給一件造景物和一株比較貴的水草）。 */
export const BIG_CHEST_DAYS = 7;
/** 寶箱的一罐飼料可以餵幾餐。 */
export const CHEST_FOOD_MEALS = 60;

export type ChestItem = 'coins' | 'food' | 'bacteria' | 'hardscape' | 'plant';

/** 寶箱獎勵池（polish-to-9.md §4）：飼料和硝化菌液各佔「飼料或硝化菌液」的一半。寶箱不給魚。 */
export const CHEST_POOL: ReadonlyArray<{ item: ChestItem; weight: number }> = [
  { item: 'coins', weight: 0.25 },
  { item: 'food', weight: 0.15 },
  { item: 'bacteria', weight: 0.15 },
  { item: 'hardscape', weight: 0.25 },
  { item: 'plant', weight: 0.2 },
];
/** 寶箱開得出來的石頭、沉木：不影響水質的兩種石頭，和沉木（各佔一半）。 */
export const CHEST_ROCKS = ['lava', 'slate'] as const;
export const CHEST_WOOD = 'driftwood';
/** 寶箱開得出來的水草：陰性草，弱光也長得起來。 */
export const CHEST_PLANTS: PlantSpeciesId[] = (Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).filter((id) => PLANT_SPECIES[id].lightType === 'low');
/** 大寶箱的水草：店裡比較貴的陽性草，或莫絲（讓大寶箱有「拿到好東西」的感覺）。 */
export const BIG_CHEST_PLANTS: PlantSpeciesId[] = (Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).filter((id) => PLANT_SPECIES[id].lightType === 'high' || id === 'moss');

/** 每件小事要花的魚幣（測一次水 2 元試劑、餵一次飼料約半元，其他都免費）。三件加起來一定要比寶箱最少的魚幣少。 */
export const DAILY_COST: Record<DailyTaskId, number> = Object.fromEntries(DAILY_IDS.map((id) => [id, id === 'test' ? price('use:test') : id === 'feed' ? FOOD_PER_MEAL : 0])) as Record<DailyTaskId, number>;

export interface DailyTask {
  id: DailyTaskId;
  done: boolean;
  /** 目標題要點的那尾魚（最快轉色的、種魚、懷孕的母魚）。 */
  subjectId?: number;
}

export interface DailyState {
  /** 第幾個遊戲天的題目。 */
  day: number;
  /** 出題的時間（遊戲小時）。 */
  issuedHours: number;
  tasks: DailyTask[];
  /** 舊存檔：出題時所有缸的造景數（以前的「擺新石頭」用，現在不看了）。 */
  scapeCount?: number;
  /** 出題時各動作最後一次的時間（之後比它晚就算做了；同一個小時先做再出題也不會被算進去）。 */
  before: Partial<Record<TimedTask, number>>;
  /** 畫面回報的動作（找到螺、點魚看、翻圖鑑…）。 */
  marked: DailyTaskId[];
  /** 獎勵領過了。 */
  claimed: boolean;
  /** 出題時的亂數種子：寶箱開出什麼在出題時就決定了（舊存檔沒有就用天數算）。 */
  chestSeed?: number;
}

/** 換天以後、出題以前畫面回報的動作和點過的魚（出題時一起算進去）。 */
export interface DailyEarly {
  day: number;
  ids: DailyTaskId[];
  fish: number[];
}

export const DAILY_TEXT: Record<DailyTaskId, string> = {
  goalBelly: '看看懷孕母魚的胎斑',
  goalColor: '點最快轉色的那尾看看',
  goalKeeper: '看看種魚長多大了',
  goalAlbino: '在新的一窩裡找紅眼睛的小魚',
  goalOrders: '看一眼訂單板，有沒有能交的',
  test: '測一次水',
  feed: '餵一次飼料',
  water: '換一次水',
  topup: '把蒸發掉的水補回來',
  nursery: '把快生的母魚放進育幼盒',
  gear: '打開「設備」，看看過濾器和加熱棒',
  observe: '點一尾魚，看看牠今天怎麼樣',
  snail: '找到缸裡的螺，點牠一下',
  shrimp: '點一隻蝦，看看牠今天怎麼樣',
  plant: '點一株水草，看看長得好不好',
  records: '看一次水質趨勢',
  codex: '翻一頁圖鑑',
  orders: '看一眼店裡的訂單',
  scape: '進造景模式，移動一塊石頭或沉木',
  scapePlant: '進造景模式，把一叢水草換個位置',
  scapeFlip: '進造景模式，把一塊石頭或沉木左右翻面',
  scapeLayer: '進造景模式，把一樣造景換到前景、中景或後景',
  scapeScale: '進造景模式，把一塊石頭或沉木調大或調小',
  scapePlace: '把寶箱開到的石頭或沉木放進缸裡',
  trim: '修剪一株長太長的水草',
  cuttings: '把手上的插枝種回去或賣掉',
  clutch: '摘掉缸壁上的蘋果螺卵',
  pests: '撈一次小螺，或放一片菜當陷阱',
  deadSnail: '撈出死掉的大螺',
  rinse: '用換出來的缸水洗一次濾材',
};

/** 目標題寫得出魚名的說法（tutorial-lines.md §13）。 */
export const DAILY_NAMED: Partial<Record<DailyTaskId, (name: string) => string>> = {
  goalBelly: (name) => `看看${name}的胎斑`,
  goalColor: (name) => `點${name}看看，牠最快轉色`,
  goalKeeper: (name) => `看看${name}長多大了`,
};

/** 一題的完整說明：有對象的目標題帶上魚名（name 由畫面給）。 */
export function dailyText(task: Pick<DailyTask, 'id' | 'subjectId'>, name?: (fishId: number) => string | null): string {
  const named = DAILY_NAMED[task.id];
  const who = task.subjectId !== undefined ? name?.(task.subjectId) : null;
  return named && who ? named(who) : DAILY_TEXT[task.id];
}

/** 看動作時間判定的題目（其他的由畫面回報）。 */
const TIMED_TIME = {
  test: (t: TankState) => t.lastTest?.hours,
  feed: (t: TankState) => t.lastFedHours,
  water: (t: TankState) => t.lastWaterChangeHours,
  trim: (t: TankState) => t.lastTrimHours,
  topup: act('topup'),
  nursery: act('nursery'),
  scape: act('scapeMove'),
  scapePlant: act('scapePlant'),
  scapeFlip: act('scapeFlip'),
  scapeLayer: act('scapeLayer'),
  scapeScale: act('scapeScale'),
  scapePlace: act('scapePlace'),
  cuttings: act('cutting'),
  clutch: act('clutch'),
  pests: act('pests'),
  deadSnail: act('deadSnail'),
  rinse: act('rinse'),
} satisfies Partial<Record<DailyTaskId, (t: TankState) => number | undefined>>;

type TimedTask = keyof typeof TIMED_TIME;
const TIMED = Object.keys(TIMED_TIME) as TimedTask[];
const isTimed = (id: DailyTaskId): id is TimedTask => id in TIMED_TIME;

function act(kind: DailyAct): (t: TankState) => number | undefined {
  return (t) => t.dailyActs?.[kind];
}

/** 所有缸裡這個動作最後一次的時間。 */
function lastTime(id: TimedTask, tanks: TankState[]): number | undefined {
  const known = tanks.map(TIMED_TIME[id]).filter((h): h is number => h !== undefined);
  return known.length ? Math.max(...known) : undefined;
}

const living = (t: TankState) => t.fish.some((f) => f.alive);

/** 長到剪得下插枝的水草（跟 trimPlant 的算法一樣）。 */
function trimmable(t: TankState): boolean {
  return t.plants.some((p) => {
    const sp = PLANT_SPECIES[p.species];
    return p.biomassG - sp.maxBiomassG * 0.5 >= sp.cuttingMassG;
  });
}

function hasSnails(t: TankState): boolean {
  const s = t.snails;
  if (!s) return false;
  return s.snails.length > 0 || Object.values(s.pests).some((n) => n >= 1);
}

/** 今天出得了哪些題目（還沒排除最近出過的）。 */
export function eligibleDaily(tanks: TankState[]): DailyTaskId[] {
  const home = tanks[0];
  const e = economy(home);
  const any = (f: (t: TankState) => boolean) => tanks.some(f);
  const bag = (e.hardscapeBag ?? []).length > 0;
  const placed = any((t) => (t.equipment.hardscape ?? []).length > 0);
  const goal = new Set(goalDaily(tanks).map((g) => g.id));
  const ok: Record<DailyTaskId, boolean> = {
    goalBelly: goal.has('goalBelly'),
    goalColor: goal.has('goalColor'),
    goalKeeper: goal.has('goalKeeper'),
    goalAlbino: goal.has('goalAlbino'),
    goalOrders: goal.has('goalOrders'),
    test: true,
    feed: any(living),
    water: any((t) => home.hours - (t.lastWaterChangeHours ?? 0) >= WATER_TASK_GAP_HOURS),
    topup: any((t) => (t.water.levelL ?? t.equipment.tank.volumeL) <= t.equipment.tank.volumeL * TOPUP_TASK_LEVEL),
    nursery: any((t) => !!t.nurseryBox && dueMothers(t).some((f) => !nurseryRefusal(t, f))),
    gear: true,
    observe: any(living),
    snail: any(hasSnails),
    shrimp: any((t) => t.fish.some((f) => f.alive && isShrimpSpecies(f.species))),
    plant: any((t) => t.plants.length > 0),
    records: true,
    codex: true,
    orders: (e.orders?.orders.length ?? 0) > 0,
    // 造景題要有石頭或沉木（不用買新的，#188）；擺新的那題要手上有寶箱開到的
    scape: placed,
    scapePlant: (placed || bag) && any((t) => t.plants.length > 0),
    scapeFlip: placed,
    scapeLayer: placed,
    scapeScale: placed,
    scapePlace: bag,
    trim: any(trimmable),
    cuttings: Object.values(e.cuttings).some((n) => (n ?? 0) > 0),
    clutch: any((t) => (t.snails?.clutches.length ?? 0) > 0),
    pests: any((t) => Object.values(t.snails?.pests ?? {}).reduce((a, n) => a + n, 0) >= 4),
    deadSnail: any((t) => (t.snails?.snails ?? []).some((x) => !x.alive)),
    rinse: any((t) => !!t.equipment.filter && isCycled(t) && t.hours - (t.dailyActs?.rinse ?? 0) >= RINSE_TASK_GAP_HOURS),
  };
  // 造景題要最近 7 天都沒動過造景（daily-loop.md §3）
  const scapeIdle = tanks.every((t) => t.lastScapeHours === undefined || home.hours - t.lastScapeHours >= SCAPE_IDLE_DAYS * 24);
  return DAILY_IDS.filter((id) => ok[id] && !RETIRED.has(id) && (DAILY_CATEGORY[id] !== 'scape' || scapeIdle) && DAILY_COST[id] < CHEST_COINS_MIN / DAILY_COUNT);
}

/** 新的一窩裡看得出紅眼睛的白子小魚（品系那段）。 */
function albinoFry(t: TankState, f: Fish): boolean {
  if (!f.alive || (f.generation ?? 0) < 1 || f.bornHours === undefined || !f.genome) return false;
  const age = (t.hours - f.bornHours) / 24;
  return age >= ALBINO_SHOWS_DAYS && age <= NEW_BROOD_DAYS && phenotype(f.genome).albino;
}

/**
 * 跟現在的目標有關的題目，照優先順序（daily-loop.md §3、tutorial-lines.md §13）：懷孕看胎斑、快生放育幼盒、等轉色、留種看長多大、
 * 品系找紅眼睛、擠缸看訂單板；沒有這些時照現在在做的事給照顧題（小魚多要多餵、養水要測水看趨勢、擠缸要換水）。
 */
export function goalDaily(tanks: TankState[]): Array<{ id: DailyTaskId; subjectId?: number }> {
  const out: Array<{ id: DailyTaskId; subjectId?: number }> = [];
  const mom = showingMother(tanks);
  if (mom) out.push({ id: 'goalBelly', subjectId: mom.fish.id });
  if (tanks.some((t) => !!t.nurseryBox && dueMothers(t).some((f) => !nurseryRefusal(t, f)))) out.push({ id: 'nursery' });
  const fast = fastestColoring(tanks);
  if (fast) out.push({ id: 'goalColor', subjectId: fast.fish.id });
  const keeper = tanks.flatMap((t) => t.fish).find((f) => f.alive && f.keeper && !isShrimpSpecies(f.species) && f.lengthCm < FISH_SPECIES[f.species].adultLengthCm * ADULT_SIZE && f.id !== fast?.fish.id);
  if (keeper) out.push({ id: 'goalKeeper', subjectId: keeper.id });
  if (tanks.some((t) => t.fish.some((f) => albinoFry(t, f)))) out.push({ id: 'goalAlbino' });
  const crowded = tanks.some((t) => crowdingRatio(t) >= CROWD_WARN);
  if (crowded && (economy(tanks[0]).orders?.orders.length ?? 0) > 0) out.push({ id: 'goalOrders' });
  // 照顧題（出得了才算）
  const young = tanks.some((t) => t.fish.some((f) => f.alive && (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && f.lengthCm < FISH_SPECIES[f.species].adultLengthCm * ADULT_SIZE));
  if (young) out.push({ id: 'feed' });
  if (!tanks.every(isCycled)) out.push({ id: 'test' }, { id: 'records' });
  if (crowded) out.push({ id: 'water' });
  return out;
}

/** 「換水」那題要換哪一缸：該換水的缸裡最擠的那缸（擠缸要換水，daily-loop.md §3），都不用換就第一缸。 */
export function waterTaskTank(tanks: TankState[]): number {
  const home = tanks[0];
  let best = -1;
  tanks.forEach((t, i) => {
    if (home.hours - (t.lastWaterChangeHours ?? 0) < WATER_TASK_GAP_HOURS) return;
    if (best < 0 || crowdingRatio(t) > crowdingRatio(tanks[best])) best = i;
  });
  return Math.max(0, best);
}

/** 天數和種子混成 0–1 的亂數（不動模擬的亂數，讀檔重算也一樣）。 */
function hash01(day: number, seed: number, salt: number): number {
  let x = (Math.imul(day + 1, 0x9e3779b1) ^ seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** 造景、整理合起來算一類：一天最多 1 題（daily-loop.md §3）。 */
const chore = (id: DailyTaskId) => DAILY_CATEGORY[id] === 'scape' || DAILY_CATEGORY[id] === 'tidy';

/** 用天數和存檔種子挑 n 題：先打散，盡量每類各一題，不夠再補；造景、整理最多 1 題（taken 是已經挑好的）。 */
function pick(ids: DailyTaskId[], day: number, seed: number, n: number, taken: DailyTaskId[]): DailyTaskId[] {
  const rest = [...ids];
  const order: DailyTaskId[] = [];
  let x = (Math.imul(day + 1, 0x9e3779b1) ^ seed) >>> 0;
  while (rest.length) {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    order.push(rest.splice(x % rest.length, 1)[0]);
  }
  const out: DailyTaskId[] = [];
  const cats = new Set<DailyCategory>(taken.map((id) => DAILY_CATEGORY[id]));
  const choreOk = () => ![...taken, ...out].some(chore);
  for (const id of order) {
    if (out.length < n && !cats.has(DAILY_CATEGORY[id]) && (!chore(id) || choreOk())) {
      out.push(id);
      cats.add(DAILY_CATEGORY[id]);
    }
  }
  for (const id of order) if (out.length < n && !out.includes(id) && (!chore(id) || choreOk())) out.push(id);
  return out;
}

/** 今天的題目：先挑最多 2 題最近沒出過的目標題，剩下的照舊打散。 */
function issueTasks(tanks: TankState[], day: number, seed: number): DailyTask[] {
  const recent = recentIds(tanks, day);
  const eligible = eligibleDaily(tanks);
  const ok = new Set(eligible);
  // 同一題還是要隔 3 天（U6），目標題輪著出
  const chosen = goalDaily(tanks).filter((g) => ok.has(g.id) && !recent.has(g.id)).slice(0, DAILY_GOAL_COUNT);
  const taken = chosen.map((g) => g.id);
  const others = pick(
    eligible.filter((id) => !taken.includes(id) && !recent.has(id) && DAILY_CATEGORY[id] !== 'goal'),
    day,
    seed,
    DAILY_COUNT - chosen.length,
    taken,
  );
  return [...chosen.map((g) => ({ id: g.id, done: false, ...(g.subjectId !== undefined ? { subjectId: g.subjectId } : {}) })), ...others.map((id) => ({ id, done: false }))];
}

function isDone(id: DailyTaskId, d: DailyState, tanks: TankState[]): boolean {
  if (!isTimed(id)) return d.marked.includes(id);
  // 用「比出題時晚」而不是「不一樣」：收掉一缸會讓最後時間變早，不能算做了
  const now = lastTime(id, tanks);
  const before = d.before[id];
  return now !== undefined && (before === undefined || now > before);
}

/** 前兩天出過的題目（舊存檔沒有紀錄，就看昨天那份）。 */
function recentIds(tanks: TankState[], day: number): Set<DailyTaskId> {
  const e = economy(tanks[0]);
  const days = [...(e.dailyRecent ?? []), ...(e.daily ? [{ day: e.daily.day, ids: e.daily.tasks.map((t) => t.id) }] : [])];
  return new Set(days.filter((r) => r.day < day && r.day > day - DAILY_GAP_DAYS).flatMap((r) => r.ids));
}

/**
 * 每半秒或每次操作後呼叫：換天就出新題目，並更新完成狀態。開機前不出題（#204）。
 * 回傳這次「剛完成」的題目（畫面可以打勾、播音效）。
 */
export function updateDaily(tanks: TankState[]): DailyTaskId[] {
  const home = tanks[0];
  if (!home || !tankStarted(home)) return [];
  const e = economy(home);
  const day = Math.floor(home.hours / 24);
  if (!e.daily || e.daily.day !== day) {
    const tasks = issueTasks(tanks, day, home.rng.seed);
    const ids = tasks.map((t) => t.id);
    e.dailyRecent = [...(e.dailyRecent ?? []).filter((r) => r.day < day && r.day > day - DAILY_GAP_DAYS), { day, ids }];
    // 同一天出題前就做過的也算（daily-loop.md §3：早上已經換過水了）：「之前」只算到今天開始
    const dayStart = day * 24;
    const before = (h: number | undefined) => (h !== undefined && h >= dayStart ? dayStart - 1e-6 : h);
    const early = e.dailyEarly?.day === day ? e.dailyEarly : null;
    delete e.dailyEarly;
    e.daily = {
      day,
      issuedHours: home.hours,
      tasks,
      before: Object.fromEntries(TIMED.map((id) => [id, before(lastTime(id, tanks))])),
      marked: [...(early?.ids ?? [])],
      claimed: false,
      chestSeed: home.rng.seed,
    };
    for (const id of early?.fish ?? []) markDailyFish(tanks, id);
  }
  const fresh: DailyTaskId[] = [];
  for (const t of e.daily.tasks) {
    if (!t.done && isDone(t.id, e.daily, tanks)) {
      t.done = true;
      fresh.push(t.id);
    }
  }
  return fresh;
}

/** 今天出題了沒：還沒出題（換天以後畫面先回報）就先記著，出題時一起算（daily-loop.md §3）。 */
function todays(tanks: TankState[]): { d: DailyState | null; early: DailyEarly | null } {
  const home = tanks[0];
  if (!home) return { d: null, early: null };
  const e = economy(home);
  const day = Math.floor(home.hours / 24);
  if (e.daily?.day === day) return { d: e.daily, early: null };
  if (!tankStarted(home)) return { d: null, early: null };
  if (e.dailyEarly?.day !== day) e.dailyEarly = { day, ids: [], fish: [] };
  return { d: null, early: e.dailyEarly };
}

/** 畫面回報玩家做了某件要點畫面的事（找到螺、點魚看、翻圖鑑…）。 */
export function markDaily(tanks: TankState[], id: DailyTaskId): void {
  const { d, early } = todays(tanks);
  const list = d?.marked ?? early?.ids;
  if (list && !list.includes(id)) list.push(id);
}

/** 畫面回報玩家點了一尾魚：算「點一尾魚看看」，也算點對象是牠的目標題；點到新的一窩裡紅眼睛的小魚算找到了。 */
export function markDailyFish(tanks: TankState[], fishId: number): void {
  const { d, early } = todays(tanks);
  if (early) {
    if (!early.fish.includes(fishId)) early.fish.push(fishId);
    return;
  }
  if (!d) return;
  const at = tanks.find((t) => t.fish.some((f) => f.id === fishId));
  const fish = at?.fish.find((f) => f.id === fishId);
  if (!at || !fish) return;
  const mark = (id: DailyTaskId) => !d.marked.includes(id) && d.marked.push(id);
  mark(isShrimpSpecies(fish.species) ? 'shrimp' : 'observe');
  for (const t of d.tasks) if (t.subjectId === fishId) mark(t.id);
  if (albinoFry(at, fish)) mark('goalAlbino');
}

/** 今天的題目（還沒出題回傳 null）。 */
export function dailyTasks(tanks: TankState[]): DailyState | null {
  return (tanks[0] && tanks[0].economy?.daily) ?? null;
}

/** 三件都做完而且還沒領：可以開寶箱。 */
export function canClaimDaily(tanks: TankState[]): boolean {
  const d = dailyTasks(tanks);
  return !!d && !d.claimed && d.tasks.length > 0 && d.tasks.every((t) => t.done);
}

/** 開寶箱拿到的東西。 */
export interface ChestReward {
  /** 連續 7 天的大寶箱。 */
  big: boolean;
  /** 拿到的魚幣（沒抽到魚幣是 0）。 */
  coins: number;
  /** 拿到的東西（只拿到魚幣就沒有）。 */
  item?: Exclude<ChestItem, 'coins'>;
  /** 石頭、沉木是 HARDSCAPE 的 id，水草是 PlantSpeciesId。 */
  itemId?: string;
  /** 大寶箱另外送的一株水草（PlantSpeciesId）。 */
  plantId?: PlantSpeciesId;
  /** 給玩家看的內容，例如「一塊沉木」「45 魚幣」。 */
  text: string;
  /** 折合多少魚幣（照商店價，經濟驗收用）。 */
  value: number;
}

/** 這一天的寶箱會開出什麼（不改狀態；只看天數和出題時的種子）。 */
export function rollChest(day: number, seed: number, big: boolean): ChestReward {
  const r = (salt: number) => hash01(day, seed, salt);
  const hardscape = (): Pick<ChestReward, 'item' | 'itemId' | 'value'> => {
    const id = r(2) < 0.5 ? CHEST_ROCKS[Math.floor(r(3) * CHEST_ROCKS.length)] : CHEST_WOOD;
    return { item: 'hardscape', itemId: id, value: price(`hardscape:${id}`) };
  };
  const name = (x: Pick<ChestReward, 'item' | 'itemId'>) => `一塊${HARDSCAPE[x.itemId as keyof typeof HARDSCAPE].name}`;
  if (big) {
    // 大寶箱不給魚幣：一件造景物加一株比較貴的水草
    const x = hardscape();
    const plantId = BIG_CHEST_PLANTS[Math.floor(r(6) * BIG_CHEST_PLANTS.length)];
    return { big, coins: 0, ...x, plantId, value: x.value + PLANT_PRICES[plantId] / 2, text: `${name(x)}和一株${PLANT_SPECIES[plantId].name}` };
  }
  let roll = r(1);
  const item = CHEST_POOL.find((p) => (roll -= p.weight) < 0)?.item ?? 'coins';
  if (item === 'coins') {
    const coins = CHEST_COINS_MIN + Math.floor(r(4) * (CHEST_COINS_MAX - CHEST_COINS_MIN + 1));
    return { big, coins, value: coins, text: `${coins} 魚幣` };
  }
  if (item === 'food') return foodChest(big);
  if (item === 'bacteria') return { big, coins: 0, item, value: price('care:bacteria'), text: '一瓶硝化菌液' };
  if (item === 'hardscape') {
    const x = hardscape();
    return { big, coins: 0, ...x, text: name(x) };
  }
  const plant = CHEST_PLANTS[Math.floor(r(5) * CHEST_PLANTS.length)];
  // 一株插枝約半盆的量
  return { big, coins: 0, item, itemId: plant, value: PLANT_PRICES[plant] / 2, text: `一株${PLANT_SPECIES[plant].name}` };
}

/** 一罐飼料的寶箱內容（到了魚幣上限，抽到魚幣也改給這個）。 */
function foodChest(big: boolean): ChestReward {
  return { big, coins: 0, item: 'food', value: CHEST_FOOD_MEALS * FOOD_PER_MEAL, text: `一罐飼料（約 ${CHEST_FOOD_MEALS} 餐）` };
}

/** 寶箱來的插枝放進手上，並記下是寶箱來的（不能賣回店家、交單或上架換錢，polish-to-9.md §4）。 */
function addChestCutting(state: TankState, species: PlantSpeciesId): void {
  addCuttings(state, species, 1);
  const chest = (economy(state).chestCuttings ??= {});
  chest[species] = (chest[species] ?? 0) + 1;
}

/**
 * 開寶箱：回傳拿到什麼（不能領就是 null）。連續 7 天都開了寶箱，第 7 天是大寶箱。
 * 到第 60 天為止寶箱魚幣累計到 400 就不再給魚幣，抽到魚幣改給一罐飼料。
 */
export function claimDaily(tanks: TankState[]): ChestReward | null {
  if (!canClaimDaily(tanks)) return null;
  const e = economy(tanks[0]);
  const d = e.daily!;
  d.claimed = true;
  const streak = e.dailyStreak && e.dailyStreak.lastDay === d.day - 1 ? e.dailyStreak.count + 1 : 1;
  const big = streak >= BIG_CHEST_DAYS;
  e.dailyStreak = { count: big ? 0 : streak, lastDay: d.day };
  let got = rollChest(d.day, d.chestSeed ?? 0, big);
  // 到上限：只給剩下的額度，額度用完改給一罐飼料
  const room = CHEST_COINS_CAP - (e.chestCoins ?? 0);
  if (got.coins > room && d.day <= CHEST_CAP_DAY) got = room > 0 ? { ...got, coins: room, value: room, text: `${room} 魚幣` } : foodChest(big);
  e.coins += got.coins;
  e.chestCoins = (e.chestCoins ?? 0) + got.coins;
  if (got.item === 'food') e.freeMeals = (e.freeMeals ?? 0) + CHEST_FOOD_MEALS;
  if (got.item === 'bacteria') e.bacteriaBottles = (e.bacteriaBottles ?? 0) + 1;
  if (got.item === 'hardscape') (e.hardscapeBag ??= []).push(got.itemId!);
  if (got.item === 'plant') addChestCutting(tanks[0], got.itemId as PlantSpeciesId);
  if (got.plantId) addChestCutting(tanks[0], got.plantId);
  return got;
}

/** 連續開寶箱幾天了（今天開過的也算；斷了一天就從 0 算）。 */
export function dailyStreak(tanks: TankState[]): number {
  const e = tanks[0] && economy(tanks[0]);
  const s = e?.dailyStreak;
  if (!s) return 0;
  const day = Math.floor(tanks[0].hours / 24);
  return s.lastDay >= day - 1 ? s.count : 0;
}

/** 把手上一塊寶箱開到的石頭或沉木放進這一缸（免費）。回傳有沒有放。 */
export function placeFromBag(state: TankState, id: string): boolean {
  const e = economy(state);
  const bag = e.hardscapeBag ?? [];
  const i = bag.indexOf(id);
  const spec = HARDSCAPE[id as keyof typeof HARDSCAPE];
  if (i < 0 || !spec) return false;
  bag.splice(i, 1);
  addHardscape(state, spec);
  noteAct(state, 'scapePlace');
  return true;
}
