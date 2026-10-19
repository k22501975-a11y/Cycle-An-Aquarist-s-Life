import { isJuvenile, isLightOn, recordEvent, type Fish, type TankState } from './state';
import { FISH_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import { phenotype, type GuppyPhenotype } from './genetics';
import { updateOrders, type OrderBoard } from './orders';
import type { GoalState } from './goals';

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

/** 店價：品系孔雀魚在台灣約 50～100 元一隻、斑馬魚 20 元、櫻花蝦 25 元、半月鬥魚公魚約 250 元、水晶紅蝦（入門等級）約 120 元。 */
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
  'care:bacteria': 30,
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
  /** 這一期累積的用電（度）。 */
  kwh: number;
  /** 上次結算電費的時間（遊戲小時）。 */
  lastBillHours: number;
  /** 今天賣了幾次（以遊戲日計）。 */
  sold: { day: number; count: number };
  /** 剪下來還沒處理的插枝。 */
  cuttings: Partial<Record<PlantSpeciesId, number>>;
  /** 這一期餵了幾餐（飼料錢跟電費一起每週結算）。 */
  meals?: number;
  /** 上次領保底起步包的時間（遊戲小時）。 */
  starterPackHours?: number;
  /** 下一個新缸用的 id 區段（每缸的魚和水草 id 從不同區段開始，魚換缸也不會撞號）。 */
  nextTankBlock?: number;
  /** 新手教學之後的目標與解鎖（M19）；舊存檔沒有，第一次檢查時建立。 */
  goals?: GoalState;
  /** 累計賣給店家幾條魚。 */
  fishSold?: number;
  /** 已經領過獎勵的新手任務（任務進度存在裝置上，換裝置、匯入存檔重跑教學也不能再領）。 */
  questRewards?: string[];
  /** 店家訂單板（M21）；舊存檔沒有，第一次更新時掛上。 */
  orders?: OrderBoard;
  /** 用儲值點數買的商城道具（背包）；舊存檔沒有。 */
  mall?: MallBag;
  /** 新遊戲還沒開缸（還沒挑設備）；開完缸就刪掉。舊存檔沒有＝已經開過。 */
  setupPending?: boolean;
  /** 玩過幾次對水小遊戲（前幾次強制玩，F5）。 */
  dripsDone?: number;
}

export interface MallBag {
  /** 特效藥幾瓶。 */
  cure: number;
  /** 熟成套缸幾組（還沒擺出來）。 */
  tankset: number;
  /** 已經放進背包的伺服器道具編號（同一個不會領兩次）。 */
  claimed: number[];
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

export function economy(state: TankState): Economy {
  return (state.economy ??= { coins: STARTING_COINS, kwh: 0, lastBillHours: state.hours, sold: { day: -1, count: 0 }, cuttings: {} });
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
    const food = Math.round((e.meals ?? 0) * FOOD_PER_MEAL);
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
export function buybackRefusal(fish: Fish): string | null {
  if (!fish.alive) return '死魚不收';
  if (fish.gift) return '老闆送的魚不能賣回去';
  if (fish.listing) return '已經在市場上架了';
  if (fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * 0.5) return '還太小，店家不收';
  if (fish.ich.stage === 'visible' || (fish.infections ?? []).some((i) => i.stage === 'visible') || fish.health < 0.6) return '看起來生病了，店家不收';
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

function countSale(state: TankState): boolean {
  const e = economy(state);
  if (sellsLeftToday(state) <= 0) return false;
  if (e.sold.day !== today(state)) e.sold = { day: today(state), count: 0 };
  e.sold.count++;
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
  if (!fish || buybackRefusal(fish) || !countSale(state)) return 0;
  const coins = fishBuybackPrice(fish);
  state.fish = state.fish.filter((f) => f !== fish);
  const e = economy(state);
  e.coins += coins;
  e.fishSold = (e.fishSold ?? 0) + 1;
  return coins;
}

/** 把手上的插枝全部賣掉（算一次），回傳拿到多少錢。 */
export function sellCuttings(state: TankState, species: PlantSpeciesId): number {
  const e = economy(state);
  const n = e.cuttings[species] ?? 0;
  if (n <= 0 || !countSale(state)) return 0;
  const coins = n * plantBuybackPrice(species);
  e.cuttings[species] = 0;
  e.coins += coins;
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
  e.cuttings[species]! -= 1;
  return true;
}

