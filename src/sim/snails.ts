import { temperatureFactor } from './chemistry';
import { nextRandom } from './random';
import { noteAct, recordEvent, type TankState } from './state';

/**
 * 螺（design/snails.md）：清潔隊也是麻煩。
 * 買來的螺（蘋果螺、斑馬螺、刺客螺）逐隻模擬；跟著水草混進來的害蟲小螺（扁卷、囊螺、馬來螺）
 * 只記數量。小螺吃殘餌和有機物，餵太多就爆量，少餵自然變少，數量直接反映有沒有餵太多。
 */

export type SnailKind = 'apple' | 'nerite' | 'assassin';
export type PestKind = 'ramshorn' | 'bladder' | 'mts';
export type AppleColor = 'gold' | 'blue' | 'purple' | 'ivory';

export interface Snail {
  id: number;
  kind: SnailKind;
  color?: AppleColor;
  sex?: 'male' | 'female';
  alive: boolean;
  /** 0（飽）–1（餓）。 */
  hunger: number;
  ageDays: number;
  /** 死掉沒撈的大螺：剩多少屍體（mg）還在慢慢爛。 */
  corpseMg: number;
  /** 上次產卵的遊戲小時。 */
  laidHour?: number;
}

/** 蘋果螺的卵塊：產在水面上方的缸壁，粉紅色一團，看得到。 */
export interface AppleClutch {
  id: number;
  hour: number;
  eggs: number;
  color: AppleColor;
}

export interface SnailState {
  snails: Snail[];
  pests: Record<PestKind, number>;
  clutches: AppleClutch[];
  /** 剛孵出來的小蘋果螺（數量）：慢慢長成大螺。 */
  appleYoung: number;
  appleYoungColor?: AppleColor;
  /** 斑馬螺產在石頭、沉木上的白色卵點（淡水孵不出來，只是難看）。 */
  neriteEggs: number;
  /** 螺陷阱（放一片燙過的菜）：放下去的時間。 */
  trapHour?: number;
  /** 舊版：這缸在店裡買過幾次水草（現在記在共用錢包的 plantBuys，整個存檔只算一次；只在讀舊存檔時看）。 */
  plantBuys?: number;
  /** 缸裡的害蟲小螺已經多到看得見了（第一次看見時記一筆 pests_seen）。 */
  pestsSeen?: boolean;
}

export interface SnailSpec {
  name: string;
  price: number;
  /** 每天吃多少（mg 殘餌、有機物）。 */
  dailyFoodMg: number;
  lifespanDays: number;
  /** 屍體重量（mg）：大螺死了沒撈很髒。 */
  bodyMassMg: number;
}

export const SNAILS: Record<SnailKind, SnailSpec> = {
  apple: { name: '蘋果螺', price: 40, dailyFoodMg: 6, lifespanDays: 365, bodyMassMg: 3000 },
  nerite: { name: '斑馬螺', price: 50, dailyFoodMg: 0.5, lifespanDays: 900, bodyMassMg: 1500 },
  assassin: { name: '刺客螺', price: 45, dailyFoodMg: 0.3, lifespanDays: 700, bodyMassMg: 800 },
};

export const PESTS: Record<PestKind, { name: string; growthPerDay: number; dailyFoodMg: number; bodyMassMg: number }> = {
  // 扁卷：雌雄同體，在玻璃、水草上產透明卵
  ramshorn: { name: '扁卷螺', growthPerDay: 0.1, dailyFoodMg: 1.5, bodyMassMg: 40 },
  // 囊螺：一隻就能生，最典型的爆螺
  bladder: { name: '囊螺', growthPerDay: 0.16, dailyFoodMg: 1.2, bodyMassMg: 30 },
  // 馬來螺：住在底沙裡，晚上才出來
  mts: { name: '馬來螺', growthPerDay: 0.07, dailyFoodMg: 1, bodyMassMg: 40 },
};

export const APPLE_COLOR_LABELS: Record<AppleColor, string> = { gold: '黃金', blue: '藍', purple: '紫', ivory: '象牙' };

/** 一缸頂多這麼多隻大蘋果螺（再多的小螺留在數量裡）。 */
const MAX_APPLES = 30;

export function snailState(state: TankState): SnailState {
  return (state.snails ??= { snails: [], pests: { ramshorn: 0, bladder: 0, mts: 0 }, clutches: [], appleYoung: 0, neriteEggs: 0 });
}

export function pestCount(state: TankState, kind?: PestKind): number {
  const p = state.snails?.pests;
  if (!p) return 0;
  return Math.round(kind ? p[kind] : p.ramshorn + p.bladder + p.mts);
}

export function addSnail(state: TankState, kind: SnailKind, color?: AppleColor, sex?: 'male' | 'female'): Snail {
  const s = snailState(state);
  const snail: Snail = {
    id: state.nextId++,
    kind,
    color: kind === 'apple' ? (color ?? 'gold') : undefined,
    // 蘋果螺、刺客螺雌雄異體；斑馬螺也分公母，但在淡水裡卵孵不出來
    sex: sex ?? (nextRandom(state.rng) < 0.5 ? 'male' : 'female'),
    alive: true,
    hunger: 0.3,
    ageDays: kind === 'apple' ? 70 : 120,
    corpseMg: 0,
  };
  s.snails.push(snail);
  return snail;
}

/** 店裡買的水草夾帶扁卷螺的機率（第一次買必定夾帶，polish-to-9.md §4「第二次確認」）；有檢疫盒先泡過低很多。 */
export const PLANT_HITCHHIKE_CHANCE = 0.3;
export const PLANT_HITCHHIKE_QUARANTINE = 0.08;
/** 害蟲小螺多到這麼多隻才看得見（第一次看見老闆會說一句話；保底單收「小螺 5 隻」）。 */
export const PESTS_VISIBLE = 5;

/**
 * 在店裡買了一株水草：整個存檔第一次買（first，次數記在共用錢包，見 actions.ts buyPlant）必定、之後 30%（有檢疫盒 8%）
 * 夾帶 2～3 隻扁卷螺（「搭便車的螺」，卵小到看不到，會自己繁殖）。回傳夾帶了幾隻（沒有是 0）。
 */
export function plantHitchhikers(state: TankState, first: boolean): number {
  const s = snailState(state);
  if (!first && nextRandom(state.rng) >= (state.quarantine ? PLANT_HITCHHIKE_QUARANTINE : PLANT_HITCHHIKE_CHANCE)) return 0;
  const n = 2 + Math.floor(nextRandom(state.rng) * 2);
  s.pests.ramshorn += n;
  return n;
}

/** 水草夾帶的害蟲小螺（卵小到看不到）：跟著新水草混進來。 */
export function hitchhike(state: TankState, chance = 0.25): PestKind | null {
  if (nextRandom(state.rng) >= chance) return null;
  const r = nextRandom(state.rng);
  const kind: PestKind = r < 0.45 ? 'bladder' : r < 0.8 ? 'ramshorn' : 'mts';
  snailState(state).pests[kind] += 2 + Math.floor(nextRandom(state.rng) * 3);
  return kind;
}

/** 缸裡有多少吃的（mg）：殘餌、正在分解的有機物、藻。 */
function forage(state: TankState): number {
  const volume = state.equipment.tank.volumeL;
  return state.water.foodMg + state.water.organicMg * 0.15 + state.algae * volume * 0.4;
}

/** 從殘餌、有機物、藻依序吃掉 mg，回傳實際吃到多少。 */
function eat(state: TankState, mg: number): number {
  const w = state.water;
  const volume = state.equipment.tank.volumeL;
  let left = mg;
  const fromFood = Math.min(left, w.foodMg);
  if (fromFood > 0) {
    // 各批飼料照比例少一點
    const k = 1 - fromFood / w.foodMg;
    w.foodMg -= fromFood;
    for (const lot of w.food ?? []) lot.mg *= k;
    left -= fromFood;
  }
  const fromOrganic = Math.min(left, w.organicMg * 0.15);
  w.organicMg -= fromOrganic;
  left -= fromOrganic;
  const fromAlgae = Math.min(left, state.algae * volume * 0.4);
  state.algae = Math.max(0, state.algae - fromAlgae / (volume * 0.4));
  left -= fromAlgae;
  return mg - left;
}

export function updateSnails(state: TankState, dt: number): void {
  const s = state.snails;
  if (!s) return;
  const w = state.water;
  const volume = state.equipment.tank.volumeL;
  const day = dt / 24;
  const warm = w.tempC < 18 ? 0 : Math.min(1.4, temperatureFactor(w.tempC));
  const copper = w.copper ?? 0;
  const living = s.snails.filter((x) => x.alive);

  // 吃：大家搶同一份食物，不夠就一起餓（蜑螺只刮藻）
  const pestNeed = (Object.keys(PESTS) as PestKind[]).reduce((sum, k) => sum + s.pests[k] * PESTS[k].dailyFoodMg, 0);
  const appleNeed = living.filter((x) => x.kind === 'apple').length * SNAILS.apple.dailyFoodMg + s.appleYoung * 0.4;
  const need = (pestNeed + appleNeed) * day;
  const got = need > 0 ? eat(state, Math.min(need, forage(state))) : 0;
  const fed = need > 0 ? got / need : 1;
  // 吃下去的大半變成螺便（有機物），一點點直接排成氨
  w.organicMg += got * 0.3;
  w.tan += (got * 0.02) / volume;
  const nerites = living.filter((x) => x.kind === 'nerite').length;
  if (nerites > 0) state.algae = Math.max(0, state.algae - 0.02 * nerites * (40 / volume) * day);

  // 害蟲小螺：食物夠就指數成長，不夠就變少；銅藥一下就死光
  for (const k of Object.keys(PESTS) as PestKind[]) {
    const n = s.pests[k];
    if (n <= 0) continue;
    const growth = PESTS[k].growthPerDay * warm * Math.max(0, fed - 0.3) / 0.7;
    const death = 0.015 + (fed < 0.5 ? (0.5 - fed) * 0.2 : 0) + copper * 8;
    let next = n * Math.exp((growth - death) * day);
    const dead = Math.max(0, n - next);
    // 殼佔大半，爛掉的軟體大約一成
    w.organicMg += dead * PESTS[k].bodyMassMg * 0.1;
    if (next < 0.5) next = 0;
    s.pests[k] = next;
  }
  // 第一次多到看得見：記一筆，讓老闆說一句話
  if (!s.pestsSeen && s.pests.ramshorn + s.pests.bladder + s.pests.mts >= PESTS_VISIBLE) {
    s.pestsSeen = true;
    recordEvent(state, { type: 'pests_seen', count: Math.floor(s.pests.ramshorn + s.pests.bladder + s.pests.mts) });
  }

  // 刺客螺：吃其他螺（小螺先），沒得吃就餓
  for (const a of living.filter((x) => x.kind === 'assassin')) {
    // 一隻刺客螺一天吃掉好幾隻剛孵的小螺（大螺吃得慢）
    const want = 3 * day;
    const pests = s.pests.bladder + s.pests.ramshorn + s.pests.mts;
    if (pests >= want) {
      for (const k of Object.keys(PESTS) as PestKind[]) s.pests[k] = Math.max(0, s.pests[k] - (want * s.pests[k]) / pests);
      a.hunger = Math.max(0, a.hunger - 0.5 * day);
    } else if (s.appleYoung >= want) {
      s.appleYoung -= want;
      a.hunger = Math.max(0, a.hunger - 0.5 * day);
    } else {
      eat(state, SNAILS.assassin.dailyFoodMg * day);
      a.hunger = Math.min(1, a.hunger + 0.05 * day);
    }
  }

  // 個體：年紀、飢餓、死亡
  for (const x of living) {
    x.ageDays += day;
    if (x.kind === 'apple' || x.kind === 'nerite') x.hunger = Math.min(1, Math.max(0, x.hunger + (0.6 - fed) * 0.3 * day));
    const life = x.ageDays / SNAILS[x.kind].lifespanDays;
    const deathRate = (life > 1 ? 0.05 : 0.001) + (x.hunger >= 1 ? 0.04 : 0) + copper * 4;
    if (nextRandom(state.rng) < deathRate * day) {
      x.alive = false;
      x.corpseMg = SNAILS[x.kind].bodyMassMg;
      recordEvent(state, { type: 'snail_died', subjectId: x.id, cause: copper > 0.05 ? 'copper' : life > 1 ? 'old_age' : x.hunger >= 1 ? 'starvation' : 'unknown' });
    }
  }
  // 死掉沒撈的大螺慢慢爛：很髒
  for (const x of s.snails) {
    if (x.alive || x.corpseMg <= 0) continue;
    const rot = Math.min(x.corpseMg, x.corpseMg * 0.04 * dt + 1);
    x.corpseMg -= rot;
    w.organicMg += rot;
  }

  // 蘋果螺餓了會啃水草
  const hungryApples = living.filter((x) => x.kind === 'apple' && x.alive && x.hunger > 0.6).length;
  if (hungryApples > 0 && state.plants.length > 0) {
    const plant = state.plants[Math.floor(nextRandom(state.rng) * state.plants.length)];
    plant.biomassG = Math.max(0.5, plant.biomassG - 0.05 * hungryApples * day);
  }

  // 蘋果螺：公母都有、水溫夠、吃得飽，母螺大約每兩週在水面上方產一團卵
  const adults = living.filter((x) => x.kind === 'apple' && x.alive && x.ageDays > 60);
  if (adults.some((x) => x.sex === 'male') && w.tempC >= 20) {
    for (const f of adults.filter((x) => x.sex === 'female' && x.hunger < 0.5)) {
      if (state.hours - (f.laidHour ?? -1e9) < 24 * 7) continue;
      if (nextRandom(state.rng) < (dt / (24 * 7)) * warm) {
        f.laidHour = state.hours;
        s.clutches.push({ id: state.nextId++, hour: state.hours, eggs: 50 + Math.floor(nextRandom(state.rng) * 150), color: f.color ?? 'gold' });
        recordEvent(state, { type: 'snail_eggs', subjectId: f.id });
      }
    }
  }
  // 卵塊約三週孵化（暖一點快一點），孵出約四成
  const hatchHours = (24 * 21) / Math.max(0.6, warm);
  for (const c of [...s.clutches]) {
    if (state.hours - c.hour < hatchHours) continue;
    s.appleYoung += Math.round(c.eggs * 0.4);
    s.appleYoungColor = c.color;
    s.clutches = s.clutches.filter((x) => x !== c);
    recordEvent(state, { type: 'snail_hatched', count: Math.round(c.eggs * 0.4) });
  }
  // 小蘋果螺：吃不夠會死，吃得夠一兩個月慢慢長成大螺
  if (s.appleYoung > 0) {
    s.appleYoung *= Math.exp(-(0.01 + (fed < 0.5 ? (0.5 - fed) * 0.3 : 0) + copper * 4) * day);
    const grown = s.appleYoung * (1 / 45) * day * fed;
    const apples = s.snails.filter((x) => x.alive && x.kind === 'apple').length;
    if (grown >= 1 || nextRandom(state.rng) < grown) {
      s.appleYoung = Math.max(0, s.appleYoung - 1);
      if (apples < MAX_APPLES) {
        const a = addSnail(state, 'apple', s.appleYoungColor ?? 'gold');
        a.ageDays = 40;
      }
    }
    if (s.appleYoung < 0.5) s.appleYoung = 0;
  }

  // 斑馬螺吃飽了在石頭、沉木上產白色卵點（淡水孵不出來）
  if (nerites > 0) s.neriteEggs = Math.min(200, s.neriteEggs + 0.4 * nerites * day * (state.algae > 0.02 ? 1 : 0.3));

  // 螺陷阱放超過兩天沒收，菜會爛
  if (s.trapHour !== undefined && state.hours - s.trapHour > 48) {
    s.trapHour = undefined;
    w.organicMg += 400;
    recordEvent(state, { type: 'trap_rotted' });
  }
  // 銅藥慢慢被濾材、底沙吸附
  if (copper > 0) w.copper = copper * Math.exp(-dt / 120);
}

// ---------- 玩家能做的事（各有代價，design/snails.md §3） ----------

/** 摘掉所有蘋果螺卵塊。回傳摘了幾團。 */
export function removeClutches(state: TankState): number {
  const s = state.snails;
  if (!s) return 0;
  const n = s.clutches.length;
  s.clutches = [];
  if (n > 0) noteAct(state, 'clutch');
  return n;
}

/** 手撈：只抓得到看得見的（馬來螺白天躲在沙裡）。回傳抓了幾隻。 */
export function catchPests(state: TankState, lightsOn: boolean): number {
  // 撈到 0 隻也算撈過一次（今天的小事「撈一次小螺」，g23）
  noteAct(state, 'pests');
  const s = state.snails;
  if (!s) return 0;
  let caught = 0;
  for (const k of Object.keys(PESTS) as PestKind[]) {
    const share = k === 'mts' ? (lightsOn ? 0.05 : 0.25) : 0.25;
    const n = Math.floor(s.pests[k] * share);
    s.pests[k] -= n;
    caught += n;
  }
  return caught;
}

/** 放一片燙過的菜當陷阱，隔夜再收。 */
export function setTrap(state: TankState): boolean {
  const s = snailState(state);
  if (s.trapHour !== undefined) return false;
  s.trapHour = state.hours;
  noteAct(state, 'pests');
  return true;
}

/** 收陷阱：放了 8 小時以上才有用，一次抓走一批小螺。回傳抓了幾隻；沒放回傳 -1。 */
export function collectTrap(state: TankState): number {
  const s = state.snails;
  if (!s || s.trapHour === undefined) return -1;
  const hours = state.hours - s.trapHour;
  s.trapHour = undefined;
  const share = Math.min(0.45, Math.max(0, (hours - 2) / 14) * 0.45);
  let caught = 0;
  for (const k of Object.keys(PESTS) as PestKind[]) {
    const n = Math.floor(s.pests[k] * share);
    s.pests[k] -= n;
    caught += n;
  }
  const young = Math.floor(s.appleYoung * share * 0.5);
  s.appleYoung -= young;
  return caught + young;
}

/** 除螺藥（含銅）：一兩天內螺幾乎死光，但對蝦有毒，死螺一起爛會讓氨暴衝。 */
export function doseMolluscicide(state: TankState): void {
  state.water.copper = (state.water.copper ?? 0) + 0.3;
}

/** 刮掉斑馬螺的卵點（刮不乾淨）。 */
export function scrapeNeriteEggs(state: TankState): number {
  const s = state.snails;
  if (!s) return 0;
  const n = Math.floor(s.neriteEggs * 0.7);
  s.neriteEggs -= n;
  return n;
}

/** 撈出死掉的大螺。回傳撈了幾隻。 */
export function removeDeadSnails(state: TankState): number {
  const s = state.snails;
  if (!s) return 0;
  const dead = s.snails.filter((x) => !x.alive).length;
  s.snails = s.snails.filter((x) => x.alive);
  if (dead > 0) noteAct(state, 'deadSnail');
  return dead;
}

/** 螺太多了：看得到的小螺數量（畫面和待辦用）。 */
export function snailBloom(state: TankState): 'none' | 'many' | 'plague' {
  const n = pestCount(state) + Math.round(state.snails?.appleYoung ?? 0);
  const per40 = (n * 40) / state.equipment.tank.volumeL;
  return per40 > 150 ? 'plague' : per40 > 50 ? 'many' : 'none';
}
