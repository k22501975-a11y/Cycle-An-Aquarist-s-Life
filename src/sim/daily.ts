import { addHardscape } from './actions';
import { addCuttings, economy, FOOD_PER_MEAL, PLANT_PRICES, price } from './economy';
import { HARDSCAPE } from './equipment';
import { dueMothers, nurseryRefusal } from './nursery';
import { isCycled } from './processes/nitrogen';
import { isShrimpSpecies, PLANT_SPECIES, type PlantSpeciesId } from './species';
import { tankStarted } from './setup';
import { noteAct, type DailyAct, type TankState } from './state';

/**
 * 每日 3 件小事（design/first-10-minutes.md F3）：每個遊戲天早上從玩家缸裡做得到的事挑 3 件，
 * 全部做完開寶箱（獎勵池，polish-to-9.md U5；寶箱演出由畫面負責）。不出做不到的題目：沒有螺就不出找螺、沒有長太長的草就不出修剪。
 * 題庫分照顧、觀察、造景、整理四類（U6），同一題 3 天內不重複；造景題要手上或缸裡有石頭、沉木才出。
 * 小事不能要玩家花錢（mvp.md §4.4.2，#188）：會花錢的題目，花費要比寶箱最少的魚幣少很多才出（DAILY_COST）。
 * 判定看出題以後玩家有沒有再做一次（任何一缸都算）；要點畫面的題目（找螺、看魚、翻圖鑑…）由畫面呼叫 markDaily。
 */

export type DailyCategory = 'care' | 'observe' | 'scape' | 'tidy';

export const DAILY_CATEGORY_LABEL: Record<DailyCategory, string> = { care: '照顧', observe: '觀察', scape: '造景', tidy: '整理' };

/** 每一題屬於哪一類（題庫，U6）。 */
export const DAILY_CATEGORY = {
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
/**
 * 寶箱保底：已經這麼多天沒賺到任何魚幣（賣魚、交單、市場、寶箱），一般寶箱一定開出魚幣（仍受上限管）。
 * 讓 §4.3「任兩筆收入隔 ≤ 7 天」在訂單空窗期也成立；有在賺錢的玩家幾乎碰不到，寶箱魚幣還是以 25% 為主。
 */
export const CHEST_DRY_DAYS = 6;
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

export const DAILY_TEXT: Record<DailyTaskId, string> = {
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
  const ok: Record<DailyTaskId, boolean> = {
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
  return DAILY_IDS.filter((id) => ok[id] && DAILY_COST[id] < CHEST_COINS_MIN / DAILY_COUNT);
}

/** 天數和種子混成 0–1 的亂數（不動模擬的亂數，讀檔重算也一樣）。 */
function hash01(day: number, seed: number, salt: number): number {
  let x = (Math.imul(day + 1, 0x9e3779b1) ^ seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** 用天數和存檔種子挑題目：先打散，盡量每類各一題，不夠再補。 */
function pick(ids: DailyTaskId[], day: number, seed: number): DailyTaskId[] {
  const rest = [...ids];
  const order: DailyTaskId[] = [];
  let x = (Math.imul(day + 1, 0x9e3779b1) ^ seed) >>> 0;
  while (rest.length) {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    order.push(rest.splice(x % rest.length, 1)[0]);
  }
  const out: DailyTaskId[] = [];
  const cats = new Set<DailyCategory>();
  for (const id of order) {
    if (out.length < DAILY_COUNT && !cats.has(DAILY_CATEGORY[id])) {
      out.push(id);
      cats.add(DAILY_CATEGORY[id]);
    }
  }
  for (const id of order) if (out.length < DAILY_COUNT && !out.includes(id)) out.push(id);
  return out;
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
    const recent = recentIds(tanks, day);
    const ids = pick(
      eligibleDaily(tanks).filter((id) => !recent.has(id)),
      day,
      home.rng.seed,
    );
    e.dailyRecent = [...(e.dailyRecent ?? []).filter((r) => r.day < day && r.day > day - DAILY_GAP_DAYS), { day, ids }];
    e.daily = {
      day,
      issuedHours: home.hours,
      tasks: ids.map((id) => ({ id, done: false })),
      before: Object.fromEntries(TIMED.map((id) => [id, lastTime(id, tanks)])),
      marked: [],
      claimed: false,
      chestSeed: home.rng.seed,
    };
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

/** 畫面回報玩家做了某件要點畫面的事（找到螺、點魚看、翻圖鑑…）。 */
export function markDaily(tanks: TankState[], id: DailyTaskId): void {
  const d = tanks[0] && economy(tanks[0]).daily;
  if (d && !d.marked.includes(id)) d.marked.push(id);
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

/** 這一天的寶箱會開出什麼（不改狀態；只看天數和出題時的種子）。forceCoins：保底，一般寶箱一定開出魚幣。 */
export function rollChest(day: number, seed: number, big: boolean, forceCoins = false): ChestReward {
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
  const item = forceCoins ? 'coins' : (CHEST_POOL.find((p) => (roll -= p.weight) < 0)?.item ?? 'coins');
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
  const dry = d.day - (e.lastEarnedDay ?? 0) >= CHEST_DRY_DAYS;
  let got = rollChest(d.day, d.chestSeed ?? 0, big, dry);
  // 到上限：只給剩下的額度，額度用完改給一罐飼料
  const room = CHEST_COINS_CAP - (e.chestCoins ?? 0);
  if (got.coins > room && d.day <= CHEST_CAP_DAY) got = room > 0 ? { ...got, coins: room, value: room, text: `${room} 魚幣` } : foodChest(big);
  e.coins += got.coins;
  e.chestCoins = (e.chestCoins ?? 0) + got.coins;
  if (got.coins > 0) e.lastEarnedDay = d.day;
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
