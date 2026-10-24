import { isJuvenile, isLightOn, noteAct, recordEvent, type Fish, type TankState } from './state';
import type { ChoiceState } from './choices';
import { growthStage } from './growth';
import { FISH_SPECIES, isShrimpSpecies, type FishSpeciesId, type PlantSpeciesId } from './species';
import { phenotype, type GuppyGenome, type GuppyPhenotype } from './genetics';
import { updateOrders, type OrderBoard } from './orders';
import type { GoalState } from './goals';
import type { MarketArrival } from './arrivals';
import type { DailyEarly, DailyState, DailyTaskId } from './daily';

/**
 * 經濟（GAME_DESIGN 第 7 節、market-and-breeding.md §3.1）：
 * 魚幣以台幣計價、價格貼近台灣水族館；電費每週結算；水族店（NPC）收購成魚和插枝，每天有上限。
 * 單機版沒有玩家市場，店家是唯一出口：收購價約店價五成，孔雀魚依稀有度分級（design/mvp.md §4.3）。
 */

/** 起始資金：買完「推薦組合」（1,400）剩 2,000，跟以前送設備時一樣多，經濟節奏（mvp.md §4.3）不變。 */
export const STARTING_COINS = 3400;
/** 台灣住宅電費約每度 3 元。 */
export const KWH_PRICE = 3;
/** 電費多久結算一次（遊戲天數）。 */
export const BILL_DAYS = 7;
/** NPC 收購價是店價的幾成。 */
export const BUYBACK_SHARE = 0.5;
/** 還沒長大的中魚只收成魚的幾成（鼓勵養大再賣）。 */
export const JUVENILE_SHARE = 0.3;
/** 每個遊戲日最多賣給水族店幾次。 */
export const DAILY_SELL_LIMIT = 10;
/** 一餐飼料的錢（一罐 100 元約可以餵 200 餐）。 */
export const FOOD_PER_MEAL = 0.5;

/** 記一餐飼料，週末跟電費一起算。units 是標準飼料一餐的幾倍（好飼料貴、份量大也貴）。 */
export function chargeMeal(state: TankState, units = 1): void {
  const e = economy(state);
  e.meals = (e.meals ?? 0) + units;
}

/** 店價：品系孔雀魚在台灣約 50～100 元一隻、斑馬魚 20 元、極火蝦 25 元、半月鬥魚公魚約 250 元、水晶紅蝦（入門等級）約 120 元。 */
export const FISH_PRICES: Record<FishSpeciesId, number> = { guppy: 60, zebrafish: 20, cherry_shrimp: 25, apisto: 180, betta: 250, crystal_shrimp: 120 };
/** 鬥魚母魚短鰭、不起眼，比公魚便宜很多。 */
export const BETTA_FEMALE_PRICE = 100;
export const PLANT_PRICES: Record<PlantSpeciesId, number> = { anubias: 150, rotala: 60, eleocharis: 80, glosso: 100, hydrocotyle: 70, moss: 90 };

/** 設備、底材、造景、藥品、耗材的價格，鍵是「類別:id」。 */
export const PRICES: Record<string, number> = {
  'filter:sponge': 150,
  'filter:hangOn': 450,
  'filter:canister': 2800,
  'heater:h25': 280,
  'heater:h50': 350,
  'heater:h100': 450,
  'light:basic': 400,
  'light:planted': 1600,
  'air:small': 250,
  'co2:diy': 2600,
  'fan:clip': 350,
  'chiller:small': 8500,
  'controller:basic': 650,
  'quarantine:box': 700,
  'nursery:box': 150,
  'care:bacteria': 30,
  'care:holiday': 40,
  'feeder:auto': 600,
  'substrate:sand': 200,
  'substrate:soil': 450,
  'substrate:coral': 300,
  'hardscape:seiryu': 300,
  'hardscape:lava': 150,
  'hardscape:slate': 200,
  'hardscape:driftwood': 350,
  'med:ich': 150,
  'med:antibiotic': 250,
  'med:dewormer': 200,
  'med:snail': 120,
  /** 一次測水（一盒試紙約 200 元可以測 100 次）。 */
  'use:test': 2,
};

export interface Economy {
  coins: number;
  /** 全家今天擠死了幾尾（超過建議量的缸合起來一天最多 2 尾，midgame.md §7.1）。 */
  crowdDeaths?: { day: number; n: number };
  /** 今天（遊戲天）店裡各品系的母魚賣掉幾尾：連買的照懷孕程度往下挑，隔天換一批（midgame.md §6.6）。 */
  storeSold?: { day: number; counts: Record<number, number> };
  /** 這一期累積的用電（度）。 */
  kwh: number;
  /** 上次結算電費的時間（遊戲小時）。 */
  lastBillHours: number;
  /** 今天賣了幾次（以遊戲日計）。 */
  /** 今天賣給店家幾次；fry：今天賣掉的小小魚（一袋 FRY_BAG 尾算一次）。 */
  sold: { day: number; count: number; fry?: number };
  /** 剪下來還沒處理的插枝。 */
  cuttings: Partial<Record<PlantSpeciesId, number>>;
  /** 這一期餵了幾餐（飼料錢跟電費一起每週結算）。 */
  meals?: number;
  /** 阿德老闆送過育幼盒了（第一次有母魚快生時送一次，nursery.ts）。 */
  nurseryGifted?: boolean;
  /**
   * 還沒出過「長得像誰」比較卡前（G2，lookalike.ts），最近幾窩孔雀魚的爸媽基因（爸媽之後賣掉、死掉也比得了）；
   * 出過卡就清掉、改記 lookalikeShown。
   */
  broodLog?: Array<{ motherId: number; fatherId?: number; hours: number; mother: GuppyGenome; father: GuppyGenome }>;
  /** 「長得像誰」比較卡出過了（整個存檔一次）。 */
  lookalikeShown?: boolean;
  /** 早上報告說明過「新缸常見的細菌白濁」了（整個存檔一次，tap-feed.ts waterLook）。 */
  bloomNoted?: boolean;
  /** 平淡早上的小觀察（ui/morning-observe.ts）：每種句型上次出現的遊戲小時，3 天內不重複。 */
  observed?: number[];
  /** 自己繁殖的魚第一次賣掉或交單了（G2 的慶祝只演一次）。 */
  firstBredSale?: boolean;
  /** 上次領保底起步包的時間（遊戲小時）。 */
  starterPackHours?: number;
  /** 下一個新缸用的 id 區段（每缸的魚和水草 id 從不同區段開始，魚換缸也不會撞號）。 */
  nextTankBlock?: number;
  /** 新手教學之後的目標與解鎖（M19）；舊存檔沒有，第一次檢查時建立。 */
  goals?: GoalState;
  /** 累計賣給店家幾條魚。 */
  fishSold?: number;
  /** 自己繁殖、養過仔魚期、還沒轉色就交訂單的魚（目標「養大 5 條」也算這些，#183）。 */
  raisedGone?: number;
  /** 自己繁殖、長到轉色期過的魚累計幾尾（交單、賣掉、死掉都不扣，#303）。 */
  raisedEver?: number;
  /** 中期選擇點 C1～C5 出過、選過什麼（choices.ts，design/midgame.md）。 */
  choices?: ChoiceState;
  /** 已經領過獎勵的新手任務（任務進度存在裝置上，換裝置、匯入存檔重跑教學也不能再領）。 */
  questRewards?: string[];
  /** 手上還沒用的假期飼料錠（目標送的）。 */
  holidayTablets?: number;
  /** 店家訂單板（M21）；舊存檔沒有，第一次更新時掛上。 */
  orders?: OrderBoard;
  /** 用儲值點數買的商城道具（背包）：只是伺服器庫存的副本（docs/ledger.md §4），打開商城、用道具後照伺服器的數字覆寫；舊存檔沒有。 */
  mall?: MallBag;
  /** 新遊戲還沒開缸（還沒挑設備）；開完缸就刪掉。舊存檔沒有＝已經開過。 */
  setupPending?: boolean;
  /** 設備付錢裝好了、還沒按下「開機」（開缸 4 步的最後一步，mvp.md §4.4.4）；開機就刪掉。舊存檔沒有＝已經開機。 */
  powerPending?: boolean;
  /** 今天的每日小事（F3）；舊存檔沒有，開完缸第一次更新時出題。 */
  daily?: DailyState;
  /** 換天以後、出題以前畫面回報的動作（出題時算進去）。 */
  dailyEarly?: DailyEarly;
  /** 前兩天出過的小事（同一題 3 天內不重複出，U6）。 */
  dailyRecent?: Array<{ day: number; ids: DailyTaskId[]; keys?: string[] }>;
  /** 連續幾天開了小事寶箱、最後一次是第幾天（連續 7 天送大寶箱，U5）。 */
  dailyStreak?: { count: number; lastDay: number };
  /** 寶箱開出來、還沒擺進缸的石頭和沉木（HARDSCAPE 的 id）：到商店「設備」免費放進缸。 */
  hardscapeBag?: string[];
  /** 寶箱開出來、還沒倒的硝化菌液（瓶）。 */
  bacteriaBottles?: number;
  /** 寶箱開出來的飼料還能餵幾餐（週末結算飼料錢時先扣這個）。 */
  freeMeals?: number;
  /**
   * 這個存檔在店裡買過幾次水草（所有缸合計；第一次必定夾帶扁卷螺，snails.ts plantHitchhikers）。
   * 新遊戲從 0 開始；舊存檔沒有，讀檔時任一缸有水草就當作已經用掉第一次（migrateHousehold）。
   */
  plantBuys?: number;
  /** 寶箱累計開出多少魚幣（第 60 天前上限 400，polish-to-9.md §4）。 */
  chestCoins?: number;
  /**
   * 最後一次有真的收入（賣魚、賣插枝、交單、市場賣出）是第幾個遊戲天；寶箱魚幣不算。
   * 訂單板的收入空檔保底用（polish-to-9.md §4「收入空檔」）；舊存檔沒有，第一次檢查時從那天開始算。
   */
  lastEarnedDay?: number;
  /** 手上的插枝裡有幾株是寶箱來的：只能種，不能賣回店家、交單、上架或送人換錢（polish-to-9.md §4）。 */
  chestCuttings?: Partial<Record<PlantSpeciesId, number>>;
  /** 已經套用到伺服器帳本的第幾筆（市場的收支，docs/ledger.md）；舊存檔沒有＝0。 */
  ledgerSeq?: number;
  /** 市場買來的魚到貨後的紀錄（伺服器算賣家 30 天存活率用，arrivals.ts）；舊存檔沒有。 */
  arrivals?: MarketArrival[];
  /** 夢想魚路線做到的步驟（§6 P2）；做到就不會倒退。 */
  dreamSteps?: Array<'tank' | 'brood' | 'bred' | 'fixed'>;
  /** 已經選育出夢想魚。 */
  dreamAchieved?: boolean;
  /** 玩過幾次對水小遊戲（前幾次強制玩，F5）。 */
  dripsDone?: number;
}

export interface MallBag {
  /** 特效藥幾瓶。 */
  cure: number;
  /** 熟成套缸幾組（還沒擺出來）。 */
  tankset: number;
}

/** 保底起步包：整缸死光又沒錢時，水族店老闆送 3 條孔雀魚（GAME_DESIGN 第 14 節）。 */
export const STARTER_PACK_COOLDOWN_DAYS = 7;
export const STARTER_PACK_MAX_COINS = 200;

/** others：同一個玩家的其他缸（多缸時任何一缸還有活魚就不送）。 */
export function canClaimStarterPack(state: TankState, others: TankState[] = []): boolean {
  const e = economy(state);
  const anyAlive = [state, ...others].some((t) => t.fish.some((f) => f.alive) || (t.quarantine?.fish ?? []).some((f) => f.alive));
  const hadFish = state.events.some((ev) => ev.type === 'fish_died') || state.fish.length > 0;
  const cooled = e.starterPackHours === undefined || state.hours - e.starterPackHours >= STARTER_PACK_COOLDOWN_DAYS * 24;
  return !anyAlive && hadFish && e.coins < STARTER_PACK_MAX_COINS && cooled;
}

/** 領起步包：1 公 2 母、確認健康的孔雀魚。送的魚不能賣回店裡（牠們生的可以）。 */
export function claimStarterPack(state: TankState, addGuppy: (state: TankState, sex: 'male' | 'female') => Fish, others: TankState[] = []): boolean {
  if (!canClaimStarterPack(state, others)) return false;
  for (const sex of ['male', 'female', 'female'] as const) addGuppy(state, sex).gift = true;
  economy(state).starterPackHours = state.hours;
  return true;
}

/** 共用同一個錢包的所有缸（linkTanks 登記，不進存檔）：訂單板這類全家共用的東西要一次看所有缸。 */
const households = new WeakMap<Economy, TankState[]>();

/** 登記共用這個錢包的缸（household.ts 的 linkTanks 每次連線時呼叫）。 */
export function registerHousehold(tanks: TankState[]): void {
  const wallet = tanks[0]?.economy;
  if (wallet) households.set(wallet, [...tanks]);
}

/** 跟這缸共用錢包的所有缸（第一缸是主缸）；沒登記過（只有一缸、測試）就只有自己。 */
export function householdTanks(state: TankState): TankState[] {
  const list = state.economy && households.get(state.economy);
  return list && list.includes(state) ? list : [state];
}

export function economy(state: TankState): Economy {
  return (state.economy ??= { coins: STARTING_COINS, kwh: 0, lastBillHours: state.hours, sold: { day: -1, count: 0 }, cuttings: {}, plantBuys: 0 });
}

/**
 * 套用一筆伺服器帳本的收支（市場的扣款、入帳，docs/ledger.md §3.3）：照 delta 加減，不用伺服器回傳的餘額覆蓋，
 * 不然這中間本機花掉的錢會被加回來。已經套用過的（ledgerSeq 不比現在大）不再加。回傳有沒有套用。
 */
export function applyLedger(state: TankState, entry: { delta: number; ledgerSeq: number }): boolean {
  const e = economy(state);
  if (entry.ledgerSeq <= (e.ledgerSeq ?? 0)) return false;
  e.coins += entry.delta;
  if (entry.delta > 0) noteEarned(state);
  e.ledgerSeq = entry.ledgerSeq;
  return true;
}

/** 記下今天有真的收入（訂單板看多久沒收入，orders.ts 的收入空檔保底）。寶箱魚幣不算。 */
export function noteEarned(state: TankState): void {
  economy(state).lastEarnedDay = Math.floor(state.hours / 24);
}

export function price(key: string): number {
  return PRICES[key] ?? 0;
}

export function canAfford(state: TankState, cost: number): boolean {
  return economy(state).coins >= cost;
}

/** 付錢；錢不夠就不付、回傳 false。 */
export function spend(state: TankState, cost: number): boolean {
  const e = economy(state);
  if (e.coins < cost) return false;
  e.coins -= cost;
  return true;
}

/** 目前所有設備的耗電（W）。 */
export function powerWatts(state: TankState): number {
  if (state.environment.powerOut) return 0;
  const eq = state.equipment;
  let w = 0;
  if (eq.filter?.on) w += { sponge: 3, hangOn: 6, canister: 15 }[eq.filter.spec.id] ?? 8;
  if (eq.heater?.heating) w += eq.heater.spec.watts;
  if (eq.light && isLightOn(state)) w += eq.light.spec.par >= 80 ? 30 : 10;
  if (eq.airPump?.on) w += 3;
  if (eq.fan?.on) w += 5;
  if (eq.chiller?.cooling) w += 120;
  // 檢疫盒：小加熱棒平均開一半，加上海綿過濾的打氣
  if (state.quarantine) w += 12;
  return w;
}

export function updateEconomy(state: TankState, dt: number): void {
  const e = economy(state);
  updateOrders(state);
  e.kwh += (powerWatts(state) / 1000) * dt;
  if (state.hours - e.lastBillHours >= BILL_DAYS * 24) {
    const power = Math.round(e.kwh * KWH_PRICE);
    // 寶箱送的飼料先用掉，不收錢
    const free = Math.min(e.meals ?? 0, e.freeMeals ?? 0);
    if (free > 0) e.freeMeals = (e.freeMeals ?? 0) - free;
    const food = Math.round(((e.meals ?? 0) - free) * FOOD_PER_MEAL);
    e.coins -= power + food;
    recordEvent(state, { type: 'power_bill', count: power, cause: String(food) });
    e.kwh = 0;
    e.meals = 0;
    e.lastBillHours = state.hours;
  }
}

const today = (state: TankState) => Math.floor(state.hours / 24);

export function sellsLeftToday(state: TankState): number {
  const e = economy(state);
  return e.sold.day === today(state) ? Math.max(0, DAILY_SELL_LIMIT - e.sold.count) : DAILY_SELL_LIMIT;
}

/** 水族店收這條魚嗎？只收活的成魚，看起來有病的不收。 */
/** 店家收購（和中魚單）最小要長到成魚體長的這個比例。 */
export const BUYBACK_MIN_SIZE = 0.5;
/** 還沒長到收購大小的小小魚：滿這麼多天店家收（midgame.md §7.2），每尾 FRY_PRICE～FRY_PRICE+1 元，FRY_BAG 尾一袋算賣一次。 */
export const FRY_BUY_DAYS = 7;
export const FRY_PRICE = 2;
export const FRY_BAG = 10;

/** 這尾是店家照小小魚收的（滿 FRY_BUY_DAYS 天、還沒長到收購大小的魚，蝦子不算）。 */
export function isFrySale(fish: Fish): boolean {
  return !isShrimpSpecies(fish.species) && fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * BUYBACK_MIN_SIZE && (fish.ageDays ?? 0) >= FRY_BUY_DAYS;
}

/** fry：店家收購的時候（滿 FRY_BUY_DAYS 天的小小魚也收）；訂單看的是長到收購大小的。 */
export function buybackRefusal(fish: Fish, fry = false): string | null {
  if (!fish.alive) return '死魚不收';
  if (fish.gift) return '老闆送的魚不能賣回去';
  if (fish.listing) return '已經在市場上架了';
  if (fish.keeper) return '留種的魚不賣（先取消留種）';
  if (fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * BUYBACK_MIN_SIZE && !(fry && isFrySale(fish))) return fry ? `還太小，店家不收（小魚滿 ${FRY_BUY_DAYS} 天才收）` : '還太小，店家不收';
  if (fish.ich.stage === 'visible' || (fish.infections ?? []).some((i) => i.stage === 'visible') || fish.health < 0.6) return '看起來生病了，店家不收';
  return null;
}

/** 全家最多幾尾留種（選種日挑 1 公 2 母，C4 再加候選公魚；留太多訂單會交不出貨）。 */
export const MAX_KEEPERS = 6;

/** 為什麼這尾不能標留種；可以就回傳 null（取消留種永遠可以）。 */
export function keeperRefusal(state: TankState, fish: Fish): string | null {
  if (fish.keeper) return null;
  if (!fish.alive) return '死掉了';
  if (isShrimpSpecies(fish.species)) return '蝦子不用留種，留一群自己就會繁殖';
  if (fish.listing) return '已經在市場上架了，先下架';
  const n = householdTanks(state).reduce((k, t) => k + [...t.fish, ...(t.quarantine?.fish ?? [])].filter((f) => f.alive && f.keeper).length, 0);
  if (n >= MAX_KEEPERS) return `最多留 ${MAX_KEEPERS} 尾種魚，先取消一尾`;
  return null;
}

/** 標或取消「留種」（design/midgame.md C2）。回傳不能標的原因；成功回傳 null。 */
export function setKeeper(state: TankState, fishId: number, on: boolean): string | null {
  const fish = [...state.fish, ...(state.quarantine?.fish ?? [])].find((f) => f.id === fishId);
  if (!fish) return '這條魚不在缸裡';
  if (!on) {
    delete fish.keeper;
    return null;
  }
  const why = keeperRefusal(state, fish);
  if (why) return why;
  fish.keeper = true;
  return null;
}

export type GuppyRarity = 'common' | 'strain' | 'rare' | 'prized';
export const GUPPY_RARITY_LABELS: Record<GuppyRarity, string> = { common: '普通', strain: '品系', rare: '稀有', prized: '極稀有' };

/** 五個常見品系的收購倍率（市場建議價以它為 1）。 */
export const STRAIN_TIER = 0.6;

/**
 * 孔雀魚的收購倍率（相對店價 60 元）：野生型或混種 0.3、5 個品系 0.6、白子或黃金 1、
 * 每多一種鰭型再乘上去，大C 至少 3.5。選育出好魚的收入是隨便生的 5～10 倍。
 */
export function guppyBuybackTier(p: GuppyPhenotype): number {
  const strain = p.albino || p.gold ? 1 : p.snake || p.grass || p.tuxedo || p.red ? STRAIN_TIER : 0.3;
  const fins = (p.ribbon ? 1.8 : 1) * (p.swallow ? 1.8 : 1) * (p.dumbo ? 1.6 : 1) * (p.sword === 3 ? 1.6 : p.sword ? 1.3 : 1) * (p.tailShape === 'halfmoon' ? 1.3 : 1);
  return p.bigC ? Math.max(3.5, strain * fins * 2) : strain * fins;
}

export function guppyRarity(p: GuppyPhenotype): GuppyRarity {
  const t = guppyBuybackTier(p);
  return t >= 3 ? 'prized' : t >= 1 ? 'rare' : t >= 0.5 ? 'strain' : 'common';
}

/** 收購價：孔雀魚看稀有度和尾鰭分數，其他魚店價五成；還沒長大的中魚只收三成。 */
export function fishBuybackPrice(fish: Fish): number {
  // 小小魚論尾收：尾鰭好的（70 分以上）多 1 元
  if (isFrySale(fish)) return FRY_PRICE + ((fish.genome?.tail ?? 0) >= 70 ? 1 : 0);
  // 尾鰭 50 分是一般價，80 分多三成
  const base = fish.genome
    ? FISH_PRICES.guppy * guppyBuybackTier(phenotype(fish.genome)) * (0.5 + fish.genome.tail / 100)
    : (fish.species === 'betta' && fish.sex === 'female' ? BETTA_FEMALE_PRICE : FISH_PRICES[fish.species]) * BUYBACK_SHARE;
  // 發色好的魚（長期餵好飼料）賣得貴一點
  const color = 1 + 0.25 * (fish.colorBoost ?? 0);
  return Math.max(1, Math.round(base * color * (isJuvenile(fish) ? JUVENILE_SHARE : 1)));
}

export function plantBuybackPrice(species: PlantSpeciesId): number {
  // 插枝大約是一盆的三分之一
  return Math.max(1, Math.round((PLANT_PRICES[species] / 3) * BUYBACK_SHARE));
}

function countSale(state: TankState, fry = false): boolean {
  const e = economy(state);
  if (e.sold.day !== today(state)) e.sold = { day: today(state), count: 0 };
  // 小小魚一袋 FRY_BAG 尾算一次：袋子還沒裝滿就不用再算
  if (fry && (e.sold.fry ?? 0) % FRY_BAG !== 0) {
    e.sold.fry = (e.sold.fry ?? 0) + 1;
    return true;
  }
  if (sellsLeftToday(state) <= 0) return false;
  e.sold.count++;
  if (fry) e.sold.fry = (e.sold.fry ?? 0) + 1;
  return true;
}

/** 把一條魚賣給水族店，回傳拿到多少錢（不收就回傳 0）。 */
/** 發新手任務獎勵：每個任務只發一次，記在存檔裡。回傳這次發了多少（領過就是 0）。 */
export function claimQuestReward(state: TankState, questId: string, coins: number): number {
  const e = economy(state);
  const got = (e.questRewards ??= []);
  if (got.includes(questId)) return 0;
  got.push(questId);
  e.coins += coins;
  return coins;
}

export function sellFish(state: TankState, fishId: number): number {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish || buybackRefusal(fish, true) || !countSale(state, isFrySale(fish))) return 0;
  const coins = fishBuybackPrice(fish);
  state.fish = state.fish.filter((f) => f !== fish);
  const e = economy(state);
  e.coins += coins;
  noteEarned(state);
  e.fishSold = (e.fishSold ?? 0) + 1;
  noteBredSale(state, fish, coins, 'shop');
  return coins;
}

/** 賣掉或交出一尾魚時呼叫：自己繁殖的第一次，記一筆 first_bred_sale 給畫面演慶祝（polish-to-9.md G2）。 */
export function noteBredSale(state: TankState, fish: Fish, coins: number, via: 'order' | 'shop'): void {
  if ((fish.generation ?? 0) < 1) return;
  const e = economy(state);
  if (e.firstBredSale) return;
  e.firstBredSale = true;
  recordEvent(state, { type: 'first_bred_sale', subjectId: fish.id, value: coins, cause: via });
}

/**
 * 交訂單的魚如果是自己繁殖、養過仔魚期的，記一筆（#183）：中魚單常把剛長大的魚拿走，目標「養大 5 條」不會因此倒退。
 * 賣給店家的不算：那是玩家自己選擇換錢，目標本來就要留著魚看轉色。
 */
export function noteRaisedGone(state: TankState, fish: Fish): void {
  // 已經轉色過的算在 raisedEver 裡了
  if (fish.raisedSeen || (fish.generation ?? 0) < 1 || isShrimpSpecies(fish.species) || growthStage(fish) === 'fry') return;
  const e = economy(state);
  e.raisedGone = (e.raisedGone ?? 0) + 1;
}

/** 轉色期以後的成長階段。 */
const COLORED = new Set(['coloring', 'subadult', 'adult', 'old']);

/** 每個 tick：自己繁殖的魚（不含蝦）第一次長到轉色期，記進「養到轉色」的累計（#303）。 */
export function trackRaised(state: TankState): void {
  for (const f of [...state.fish, ...(state.quarantine?.fish ?? [])]) {
    if (f.raisedSeen || !f.alive || (f.generation ?? 0) < 1 || isShrimpSpecies(f.species) || !COLORED.has(growthStage(f))) continue;
    f.raisedSeen = true;
    const e = economy(state);
    e.raisedEver = (e.raisedEver ?? 0) + 1;
  }
}

/** 手上這種插枝有幾株是寶箱來的（不會比手上的多）。 */
export function chestCuttingsOf(state: TankState, species: PlantSpeciesId): number {
  const e = economy(state);
  return Math.min(e.chestCuttings?.[species] ?? 0, e.cuttings[species] ?? 0);
}

/** 手上這種插枝可以換錢的株數（賣給店家、交單、上架、送人）：寶箱來的不算（polish-to-9.md §4）。 */
export function sellableCuttings(state: TankState, species: PlantSpeciesId): number {
  return Math.max(0, (economy(state).cuttings[species] ?? 0) - chestCuttingsOf(state, species));
}

/** 把手上的插枝全部賣掉（算一次），回傳拿到多少錢。寶箱來的不收，留在手上可以種。 */
export function sellCuttings(state: TankState, species: PlantSpeciesId): number {
  const e = economy(state);
  const n = sellableCuttings(state, species);
  if (n <= 0 || !countSale(state)) return 0;
  const coins = n * plantBuybackPrice(species);
  e.cuttings[species] = (e.cuttings[species] ?? 0) - n;
  e.coins += coins;
  noteEarned(state);
  noteAct(state, 'cutting');
  return coins;
}

export function addCuttings(state: TankState, species: PlantSpeciesId, count: number): void {
  const e = economy(state);
  e.cuttings[species] = (e.cuttings[species] ?? 0) + count;
}

/** 種一株手上的插枝回缸裡（不用錢）。 */
export function takeCutting(state: TankState, species: PlantSpeciesId): boolean {
  const e = economy(state);
  if ((e.cuttings[species] ?? 0) <= 0) return false;
  // 先種寶箱來的（種下去就是缸裡的草了）
  const chest = chestCuttingsOf(state, species);
  if (chest > 0) e.chestCuttings![species] = chest - 1;
  e.cuttings[species]! -= 1;
  noteAct(state, 'cutting');
  return true;
}

