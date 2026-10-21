import { CHEST_CAP_DAY, CHEST_COINS_CAP, CHEST_COINS_MAX } from './daily';
import { DAILY_SELL_LIMIT, economy, FISH_PRICES, fishBuybackPrice, guppyBuybackTier, plantBuybackPrice, PLANT_PRICES } from './economy';
import { GOALS } from './goals';
import { TANK_RESALE_SHARE, TANK_SETS, type TankSizeId } from './household';
import { phenotype } from './genetics';
import { FISH_SPECIES, PLANT_SPECIES, type PlantSpeciesId } from './species';
import { type Fish, type TankState } from './state';

/**
 * 錢的範圍檢查（L2，#76）：兩份存檔之間，遊戲端自己最多能賺多少錢。
 * 市場的收支走伺服器帳本（docs/ledger.md），伺服器上一份存檔已經算進去了，這裡只管單機的收入：
 * 賣給店家、交訂單、寶箱、目標和新手任務獎勵、收掉空缸。
 * 每一項都取寬鬆的上限：寧可放過一點點，也不要擋到正常玩家（上傳被擋就存不了雲端）。
 * 抓的是「改存檔把錢改大」這種一看就不可能的跳升。
 */

/** 新手任務獎勵（src/ui/tutorial.ts 的 reward）：一個任務最多幾元、全部加起來幾元。 */
export const QUEST_REWARD_MAX = 150;
export const QUEST_REWARD_TOTAL = 550;
/** 板上不是指定魚的小單（插枝、螺、小孔雀、保底單）一張最多幾元。 */
export const SMALL_ORDER_MAX = 250;
/** 一天最多新出幾張單（ORDER_GAP_HOURS 每 24 小時補一張）；收入空檔保底單另外再算一張。 */
export const ORDERS_PER_DAY = 1;
/** 孔雀魚的單每尾最多 400（指定鰭型，orders.ts）；普通成魚單 80。 */
export const GUPPY_ORDER_UNIT_MAX = 400;
const GUPPY_PLAIN_ORDER_MAX = 80;
/** 上一份存檔之後才出生、又在這段時間內長到店家收（成魚一半大）的魚，至少要這麼多天。 */
export const NEWBORN_SELL_DAYS = 14;
/** 誤差：存檔時間點的小落差（一筆電費、四捨五入）。 */
export const EARN_SLACK = 100;

/** 理論上最貴的孔雀魚（白子＋黃金＋全部鰭型、大C、尾鰭滿分、發色滿）。 */
const GUPPY_PRICE_MAX = Math.round(
  FISH_PRICES.guppy *
    guppyBuybackTier({ albino: true, gold: true, tuxedo: true, red: true, snake: true, grass: true, swallow: true, ribbon: true, dumbo: true, bigC: true, sword: 3, tailShape: 'halfmoon', finLength: 1 }) *
    1.5 *
    1.25,
);

const allFish = (tanks: TankState[]): Fish[] => tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]);

/** 這條魚最多換得到多少錢：長成成魚、發色滿的收購價，或交單的單價，取大的。 */
export function fishEarnCap(f: Fish): number {
  if (f.gift) return 0;
  const shop = fishBuybackPrice({ ...f, lengthCm: Math.max(f.lengthCm, FISH_SPECIES[f.species].adultLengthCm), colorBoost: 1 });
  // 孔雀魚的單價照稀有度（orders.ts：品系單 × 2.6 + 15，鰭型單 150～400）；沒有基因的照普通成魚單
  const order = f.species !== 'guppy' ? FISH_PRICES[f.species] + 5 : f.genome ? Math.min(GUPPY_ORDER_UNIT_MAX, Math.max(GUPPY_PLAIN_ORDER_MAX, Math.round(FISH_PRICES.guppy * guppyBuybackTier(phenotype(f.genome)) * 3.2) + 15)) : GUPPY_PLAIN_ORDER_MAX;
  return Math.max(shop, order);
}

/** 一段插枝最多換多少：賣給店家或交插枝單（店價三分之一再加 5）。 */
function cuttingUnit(sp: PlantSpeciesId): number {
  return Math.max(plantBuybackPrice(sp), Math.ceil(PLANT_PRICES[sp] / 3 / 5) * 5 + 5);
}

/** 一株水草一天最多長出幾段插枝：當作一直維持在長得到的最大重量（上限兩倍）、全速生長（processes/plants.ts）。 */
function cuttingsPerDay(sp: PlantSpeciesId): number {
  const s = PLANT_SPECIES[sp];
  return (2 * s.maxBiomassG * s.maxGrowthPerHour * 24) / s.cuttingMassG;
}


export interface EarnCapDetail {
  total: number;
  goals: number;
  quests: number;
  tanks: number;
  chest: number;
  fish: number;
  newborn: number;
  plants: number;
  orders: number;
}

/** 從 prev 到 next，遊戲端自己最多能多出多少錢（不含市場帳本）。 */
export function earnCap(prev: TankState[], next: TankState[]): EarnCapDetail {
  const pe = economy(prev[0]);
  const ne = economy(next[0]);
  const hours = Math.max(0, next[0].hours - prev[0].hours);
  // 跨了幾個遊戲天（頭尾都算，每天的寶箱、賣店家次數各一份）
  const days = Math.floor(next[0].hours / 24) - Math.floor(prev[0].hours / 24) + 1;

  // 目標獎勵：新完成的目標照表給
  const doneBefore = new Set(pe.goals?.done ?? []);
  const goals = (ne.goals?.done ?? []).filter((id, i, a) => !doneBefore.has(id) && a.indexOf(id) === i).reduce((n, id) => n + (GOALS.find((g) => g.id === id)?.coins ?? 0), 0);

  // 新手任務獎勵：每個任務只領一次，全部加起來有上限
  const questsBefore = new Set(pe.questRewards ?? []);
  const newQuests = new Set((ne.questRewards ?? []).filter((id) => !questsBefore.has(id))).size;
  const quests = Math.min(newQuests * QUEST_REWARD_MAX, QUEST_REWARD_TOTAL);

  // 收掉空缸：少了幾缸，就算收掉的是最貴的那幾缸
  const refunds = prev.map((t) => Math.round((TANK_SETS[t.equipment.tank.id as TankSizeId]?.price ?? 0) * TANK_RESALE_SHARE)).sort((a, b) => b - a);
  const tanks = refunds.slice(0, Math.max(0, prev.length - next.length)).reduce((n, x) => n + x, 0);

  // 寶箱：一天一次；第 60 天前累計有上限
  let chest = days * CHEST_COINS_MAX;
  if (Math.floor(next[0].hours / 24) <= CHEST_CAP_DAY) chest = Math.min(chest, Math.max(0, CHEST_COINS_CAP - (pe.chestCoins ?? 0)));

  // 魚：上一份有、這一份不見的魚，每條照最高價算（賣店家或交單）
  const stillHere = new Set(allFish(next).map((f) => f.id));
  const before = allFish(prev).filter((f) => f.alive);
  const fish = before.filter((f) => !stillHere.has(f.id)).reduce((n, f) => n + fishEarnCap(f), 0);

  // 這段時間內才出生又賣掉的魚：要長夠久才收，所以短時間的上傳不會有
  // 長到收購大小之前的那幾天賣不了；單價照上一份最貴的魚（小魚可能比爸媽好一點，再寬一點取 1.5 倍）
  const sellDays = Math.max(0, Math.ceil(hours / 24 - NEWBORN_SELL_DAYS));
  const newborn = sellDays * DAILY_SELL_LIMIT * Math.min(GUPPY_PRICE_MAX, Math.round(1.5 * Math.max(GUPPY_PLAIN_ORDER_MAX, ...before.map(fishEarnCap))));

  // 插枝：手上的、上一份每株現在就剪得下來的（剪到上限一半），加上每株每天長出來的
  let plants = 0;
  for (const t of prev) for (const p of t.plants) if (p.species in PLANT_PRICES) plants += (Math.max(0, p.biomassG - PLANT_SPECIES[p.species].maxBiomassG * 0.5) / PLANT_SPECIES[p.species].cuttingMassG) * cuttingUnit(p.species);
  for (const [sp, n] of Object.entries(pe.cuttings ?? {}) as Array<[PlantSpeciesId, number]>) if (sp in PLANT_PRICES) plants += Math.max(0, n) * cuttingUnit(sp);
  const plantCount = new Map<PlantSpeciesId, number>();
  for (const list of [prev, next]) {
    const here = new Map<PlantSpeciesId, number>();
    for (const t of list) for (const p of t.plants) if (p.species in PLANT_PRICES) here.set(p.species, (here.get(p.species) ?? 0) + 1);
    for (const [sp, n] of here) plantCount.set(sp, Math.max(plantCount.get(sp) ?? 0, n));
  }
  for (const [sp, n] of plantCount) plants += n * days * cuttingsPerDay(sp) * cuttingUnit(sp);
  plants = Math.ceil(plants);

  // 小單（螺、小孔雀、保底單）：板上現有的加上每天新出的
  const board = pe.orders?.orders.length ?? 0;
  const orders = (board + days * ORDERS_PER_DAY + 1) * SMALL_ORDER_MAX;

  const total = goals + quests + tanks + chest + fish + newborn + plants + orders + EARN_SLACK;
  return { total, goals, quests, tanks, chest, fish, newborn, plants, orders };
}
