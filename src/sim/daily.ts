import { economy, FOOD_PER_MEAL, price } from './economy';
import { PLANT_SPECIES } from './species';
import { tankStarted } from './setup';
import type { TankState } from './state';

/**
 * 每日 3 件小事（design/first-10-minutes.md F3）：每個遊戲天早上從玩家缸裡做得到的事挑 3 件，
 * 全部做完給一小筆魚幣（寶箱演出由畫面負責）。不出做不到的題目：沒有螺就不出找螺、沒有長太長的草就不出修剪。
 * 小事不能要玩家花錢（mvp.md §4.4.2，#188）：會花錢的題目，花費要比獎勵少很多才出（DAILY_COST）。
 * 判定看出題以後玩家有沒有再做一次（任何一缸都算）；要點畫面的題目（找螺、看魚）由畫面呼叫 markDaily。
 */

export type DailyTaskId = 'test' | 'feed' | 'water' | 'trim' | 'snail' | 'observe' | 'scape';

export const DAILY_COUNT = 3;
/** 三件都做完的獎勵。 */
export const DAILY_REWARD = 30;
/** 多久沒換水才出「換水」題（不鼓勵天天大換水）。 */
const WATER_TASK_GAP_HOURS = 4 * 24;
/** 每件小事要花的魚幣（測一次水 2 元試劑、餵一次飼料約半元，其他都免費）。三件加起來一定要比獎勵少。 */
export const DAILY_COST: Record<DailyTaskId, number> = { test: price('use:test'), feed: FOOD_PER_MEAL, water: 0, trim: 0, snail: 0, observe: 0, scape: 0 };

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
  /** 畫面回報的動作（找到螺、點魚看）。 */
  marked: DailyTaskId[];
  /** 獎勵領過了。 */
  claimed: boolean;
}

export const DAILY_TEXT: Record<DailyTaskId, string> = {
  test: '測一次水',
  feed: '餵一次飼料',
  water: '換一次水',
  trim: '修剪一株長太長的水草',
  snail: '找到缸裡的螺，點牠一下',
  observe: '點一尾魚，看看牠今天怎麼樣',
  scape: '進造景模式，移動一塊石頭、沉木或一叢水草',
};

type TimedTask = 'test' | 'feed' | 'water' | 'trim' | 'scape';
const TIMED: TimedTask[] = ['test', 'feed', 'water', 'trim', 'scape'];

/** 所有缸裡這個動作最後一次的時間。 */
function lastTime(id: TimedTask, tanks: TankState[]): number | undefined {
  const times = tanks.map((t) => (id === 'test' ? t.lastTest?.hours : id === 'feed' ? t.lastFedHours : id === 'water' ? t.lastWaterChangeHours : id === 'trim' ? t.lastTrimHours : t.lastScapeHours));
  const known = times.filter((h): h is number => h !== undefined);
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

/** 今天出得了哪些題目。 */
export function eligibleDaily(tanks: TankState[]): DailyTaskId[] {
  const out: DailyTaskId[] = ['test'];
  const home = tanks[0];
  if (tanks.some(living)) out.push('feed', 'observe');
  if (tanks.some((t) => home.hours - (t.lastWaterChangeHours ?? 0) >= WATER_TASK_GAP_HOURS)) out.push('water');
  if (tanks.some(trimmable)) out.push('trim');
  if (tanks.some(hasSnails)) out.push('snail');
  // 移動現有的造景（不用買新的）：缸裡有石頭、沉木或水草才出
  if (tanks.some((t) => (t.equipment.hardscape ?? []).length > 0 || t.plants.length > 0)) out.push('scape');
  return out.filter((id) => DAILY_COST[id] < DAILY_REWARD / DAILY_COUNT);
}

/** 用天數和存檔種子挑題目（不動模擬的亂數，讀檔重算也一樣）。 */
function pick(ids: DailyTaskId[], day: number, seed: number): DailyTaskId[] {
  const rest = [...ids];
  const out: DailyTaskId[] = [];
  let x = (Math.imul(day + 1, 0x9e3779b1) ^ seed) >>> 0;
  while (out.length < DAILY_COUNT && rest.length) {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    out.push(rest.splice(x % rest.length, 1)[0]);
  }
  return out;
}

function isDone(id: DailyTaskId, d: DailyState, tanks: TankState[]): boolean {
  switch (id) {
    case 'test':
    case 'feed':
    case 'water':
    case 'trim':
    case 'scape': {
      // 用「比出題時晚」而不是「不一樣」：收掉一缸會讓最後時間變早，不能算做了
      const now = lastTime(id, tanks);
      const before = d.before[id];
      return now !== undefined && (before === undefined || now > before);
    }
    default:
      return d.marked.includes(id);
  }
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
    e.daily = {
      day,
      issuedHours: home.hours,
      tasks: pick(eligibleDaily(tanks), day, home.rng.seed).map((id) => ({ id, done: false })),
      before: Object.fromEntries(TIMED.map((id) => [id, lastTime(id, tanks)])),
      marked: [],
      claimed: false,
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

/** 畫面回報玩家做了某件要點畫面的事（找到螺、點魚看）。 */
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

/** 開寶箱：回傳拿到的魚幣（不能領就是 0）。 */
export function claimDaily(tanks: TankState[]): number {
  if (!canClaimDaily(tanks)) return 0;
  const e = economy(tanks[0]);
  e.daily!.claimed = true;
  e.coins += DAILY_REWARD;
  return DAILY_REWARD;
}
