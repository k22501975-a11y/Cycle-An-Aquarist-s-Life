import { isJuvenile, isLightOn, recordEvent, type Fish, type TankState } from './state';
import type { ChoiceState } from './choices';
import { growthStage } from './growth';
import { CYCLED_BACTERIA } from './processes/nitrogen';
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
  'med:salt': 20,
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
  /** 魚死光、說了要送起步包的時間（#382）：之後錢變多也照樣送，直到領了或缸裡又有魚。 */
  starterPackPromised?: number;
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
  /** 買過店裡的孔雀魚母魚了（開局第一次買的是快生的那尾，polish-to-9.md §7.1）。 */
  firstMomBought?: boolean;
  /** 開局第一次買到的那尾快生母魚：懷孕程度（takeStoreFemales 記下）和放進缸後的 id（addFish 對上就記，早上報告的胎斑里程碑用）。 */
  firstMomPregnancy?: number;
  firstMomId?: number;
  /** 任務卡現在這句（輪播前的原句）從什麼時候開始（polish-to-9.md §8.2：同一句超過 3 天換成進度句）。 */
  stepSince?: { text: string; hours: number };
  /** 寶箱累計開出多少魚幣（第 60 天前上限 400，polish-to-9.md §4）。 */
  chestCoins?: number;
  /**
   * 最後一次有真的收入（賣魚、賣插枝、交單、市場賣出）是第幾個遊戲天；寶箱魚幣不算。
   * 訂單板的收入空檔保底用（polish-to-9.md §4「收入空檔」）；舊存檔沒有，第一次檢查時從那天開始算。
   */
  lastEarnedDay?: number;
  /** 跟阿德賒加熱棒還欠多少（mvp.md §4.4.6）：之後每筆收入扣 3 成來還（LOAN_SHARE），不收利息；0 或沒有就是沒欠。 */
  heaterLoan?: number;
  /** 還欠阿德錢時，有幾筆收入因為手上太少或缸還沒穩先不扣（早上報告看有沒有變多，寫「阿德說不急」）。 */
  loanWaived?: number;
  /** 最近一次加熱棒故障是第幾個遊戲小時（全家共用）：7 天內不會再壞第二支（mvp.md §4.4.6）。 */
  heaterBrokeHours?: number;
  /** 最近一次危機是第幾個遊戲小時（設備壞、一天死 3 尾以上、生病；全家共用）：30 天內、手上又少，保底單出得比較快（mvp.md §4.4.6 g33）。 */
  crisisHours?: number;
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
  const promised = e.starterPackPromised !== undefined;
  const hadFish = promised || state.events.some((ev) => ev.type === 'fish_died') || state.fish.length > 0;
  const cooled = e.starterPackHours === undefined || state.hours - e.starterPackHours >= STARTER_PACK_COOLDOWN_DAYS * 24;
  return !anyAlive && hadFish && (promised || e.coins < STARTER_PACK_MAX_COINS) && cooled;
}

/**
 * 每個整點記一次：魚死光、領得到起步包的那一刻就算說好要送了（#382：死光那天報告說老闆送一包，
 * 後來手上的錢超過 200 元，起步包就不見了）。缸裡又有活魚（領了、自己買了）就作廢，下次死光再重新看。
 */
export function noteStarterPack(state: TankState): void {
  const e = economy(state);
  const tanks = householdTanks(state);
  if (tanks.some((t) => t.fish.some((f) => f.alive) || (t.quarantine?.fish ?? []).some((f) => f.alive))) {
    delete e.starterPackPromised;
    return;
  }
  if (e.starterPackPromised === undefined && canClaimStarterPack(state, tanks.filter((t) => t !== state))) e.starterPackPromised = state.hours;
}

/** 孔雀魚放進這缸會不會冷到：沒有能用的加熱棒、室溫又撐不住，或現在的水溫已經在適溫外（#397）。 */
export function starterPackTooCold(t: TankState): boolean {
  const { temp } = FISH_SPECIES.guppy;
  const env = t.environment;
  const heater = t.equipment.heater;
  const roomOk = env.roomTempC - (env.roomSwingC ?? 1.5) >= temp.min;
  return (!(heater && !heater.broken) && !roomOk) || t.water.tempC < temp.min;
}

/** 每一缸都太冷（#397：一月兩缸加熱棒都壞，起步包放進 15.5°C 的缸）：收下之前先提醒玩家換加熱棒。 */
export function starterPackAllCold(tanks: TankState[]): boolean {
  return tanks.every((t) => starterPackTooCold(t));
}

/**
 * 起步包要放哪一缸（#391）：不是看玩家正在看哪缸，而是挑孔雀魚住得最安穩的那缸。
 * 加熱棒壞了而室溫撐不住、沒開過濾、還沒養好水、水裡還有白點蟲、氨或亞硝偏高、現在水溫在適溫外的都往後排；一樣好就放目前這缸。
 */
export function starterPackTank(tanks: TankState[], active = 0): number {
  const { temp } = FISH_SPECIES.guppy;
  const score = (t: TankState): number => {
    const env = t.environment;
    const swing = env.roomSwingC ?? 1.5;
    const heater = t.equipment.heater;
    const roomOk = env.roomTempC - swing >= temp.min && env.roomTempC + swing <= temp.max;
    let s = 0;
    if (heater?.broken) s -= heater.stuckOn ? 100 : roomOk ? 5 : 50;
    else if (!heater && !roomOk) s -= 50;
    // 現在的水溫在適溫外（加熱棒剛換好、水還沒回溫）也往後排（g29）
    if (t.water.tempC < temp.min || t.water.tempC > temp.max) s -= 15;
    if (!t.equipment.filter?.on) s -= 30;
    if (t.water.ichPathogen + t.water.ichCysts >= 0.01) s -= 20;
    // 還沒養好水的新缸：魚放進去會氨中毒，比有白點蟲的缸更不適合（#392 架構）
    if (Math.min(t.bacteria.aob, t.bacteria.nob) < CYCLED_BACTERIA) s -= 25;
    if (t.water.tan >= 0.5 || t.water.no2 >= 0.5) s -= 10;
    return s;
  };
  // 領不到的缸（例如從來沒養過魚、又還沒說好要送）不挑，不然收下會失敗
  const claimable = (i: number) => canClaimStarterPack(tanks[i], tanks.filter((_, j) => j !== i));
  let best = Math.min(Math.max(0, active), tanks.length - 1);
  tanks.forEach((t, i) => {
    if (claimable(i) && (!claimable(best) || score(t) > score(tanks[best]))) best = i;
  });
  return best;
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

/** 每筆收入扣幾成還阿德加熱棒的錢（mvp.md §4.4.6 g33 之後：原本一半，危機過後錢回不來）。 */
export const LOAN_SHARE = 0.3;
/** 手上（入帳後）低於這個數就先不扣還款：阿德說不急（g33）。 */
export const LOAN_PAUSE_COINS = 250;

/** 任務卡、選擇卡推薦買東西時，買完手上至少要剩這麼多（polish-to-9.md §11：g39 一買水草燈從 1,604 剩 2 元）。救急（藥、加熱棒、打氣機）不算。 */
export const BUY_RESERVE = 500;
/** 推薦買 cost 元的東西還差多少（買完要剩 BUY_RESERVE）；0 就是可以推薦。 */
export const reserveShort = (coins: number, cost: number): number => Math.max(0, cost + BUY_RESERVE - coins);
/** 錢不夠推薦時任務卡的說法。 */
export const reserveText = (what: string, short: number): string => `錢夠了再買${what}（還差 ${short} 元）`;

/** 這缸還沒穩：有活魚，而且有魚看得到病、加熱棒壞了或卡住、停電，或水溫超出魚的適溫（還款暫停的「有病、有危機」）。 */
function unsettled(t: TankState): boolean {
  const living = t.fish.filter((f) => f.alive);
  if (living.length === 0) return false;
  if (living.some((f) => f.ich.stage === 'visible' || (f.infections ?? []).some((i) => i.stage === 'visible'))) return true;
  const heater = t.equipment.heater;
  if (heater?.broken || heater?.stuckOn || t.environment.powerOut) return true;
  const min = Math.max(...living.map((f) => FISH_SPECIES[f.species].temp.min));
  const max = Math.min(...living.map((f) => FISH_SPECIES[f.species].temp.max));
  return t.water.tempC < min - 0.5 || t.water.tempC > max + 0.5;
}

/**
 * 這筆收入要扣多少還阿德（g33）：每筆扣 LOAN_SHARE（無條件進位）；這筆入帳後（扣款前）手上低於 LOAN_PAUSE_COINS 就先不扣；
 * 任何一缸有病、有危機也先不扣。coinsAfter 是這筆入帳後手上有多少，owed 是還欠多少。緊急賣魚算到手的錢也用這個（raise-cash.ts）。
 */
export function loanPayment(state: TankState, coinsAfter: number, income: number, owed = economy(state).heaterLoan ?? 0): number {
  if (owed <= 0 || income <= 0 || coinsAfter < LOAN_PAUSE_COINS || householdTanks(state).some(unsettled)) return 0;
  return Math.min(owed, Math.ceil(income * LOAN_SHARE));
}

/**
 * 記一筆收入（訂單板看多久沒收入，orders.ts 的收入空檔保底；寶箱魚幣不算）。coins 是這筆入帳多少：
 * 還欠阿德加熱棒的錢就照 loanPayment 扣來還（mvp.md §4.4.6），回傳還了多少；暫停扣款時記在 loanWaived，早上報告寫阿德說不急。
 * real 為 false 的（一尾 2 元的小魚）不算真收入，不重算收入空檔（g33：擠缸自動賣小魚讓保底單一直不出）。
 */
export function noteEarned(state: TankState, coins = 0, real = true): number {
  const e = economy(state);
  if (real) e.lastEarnedDay = Math.floor(state.hours / 24);
  const owed = e.heaterLoan ?? 0;
  if (owed <= 0 || coins <= 0) return 0;
  const pay = loanPayment(state, e.coins, coins, owed);
  if (pay === 0) {
    e.loanWaived = (e.loanWaived ?? 0) + 1;
    return 0;
  }
  e.coins -= pay;
  e.heaterLoan = owed - pay;
  if (e.heaterLoan <= 0) delete e.heaterLoan;
  return pay;
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

export function countSale(state: TankState, fry = false): boolean {
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

/** 賣掉或交出一尾魚時呼叫：自己繁殖的第一次，記一筆 first_bred_sale 給畫面演慶祝（polish-to-9.md G2）。 */
export function noteBredSale(state: TankState, fish: Fish, coins: number, via: 'order' | 'shop'): void {
  if ((fish.generation ?? 0) < 1) return;
  const e = economy(state);
  if (e.firstBredSale) return;
  e.firstBredSale = true;
  recordEvent(state, { type: 'first_bred_sale', subjectId: fish.id, value: coins, cause: via });
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

export function addCuttings(state: TankState, species: PlantSpeciesId, count: number): void {
  const e = economy(state);
  e.cuttings[species] = (e.cuttings[species] ?? 0) + count;
}

