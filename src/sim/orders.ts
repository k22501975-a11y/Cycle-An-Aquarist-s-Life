import { buybackRefusal, economy, FISH_PRICES, guppyBuybackTier, householdTanks, noteBredSale, noteEarned, noteRaisedGone, PLANT_PRICES, sellableCuttings } from './economy';
import { phenotype, type FinTrait, type GuppyPhenotype } from './genetics';
import { nextRandom, type RngState } from './random';
import { PESTS, SNAILS, type PestKind } from './snails';
import { FISH_SPECIES, isShrimpSpecies, PLANT_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import { isJuvenile, type Fish, type TankState } from './state';
import { hidingFactor } from './processes/population';

/**
 * 店家訂單板（design/mvp.md §4.4，M21）：阿德老闆的店同時掛最多 3 張客人的單，交完一張隔天補一張。
 * 條件只看玩家看得到的東西（品系外觀、鰭型、尾鰭分數、公母、大小、數量），出價不受店售價限制。
 * 出什麼單看缸裡實際有什麼（mvp.md §4.4.1，不看天數）：
 * 起步（還沒有自己繁殖的魚）出水草插枝、螺；第一窩（有仔魚）出小孔雀單；選育（有中魚、成魚）出中魚、品系、鰭型單。
 * 板上至少一張是現在缸裡的東西、或修剪一下就交得出來的；到了選育階段也留一張小額單當穩定收入。
 * 訂單用自己的亂數，不會改到模擬的亂數序列。
 */

export const ORDER_BOARD_SIZE = 3;
/** 交完或撕掉一張單後，隔多久補新單（遊戲小時）。 */
export const ORDER_GAP_HOURS = 24;

/** 訂單看的品系外觀（只有公魚看得出來）。 */
export const ORDER_STRAINS = {
  grass: { name: '藍草', test: (p: GuppyPhenotype) => p.grass && !p.snake },
  goldSnake: { name: '黃金蛇王', test: (p: GuppyPhenotype) => p.snake && p.gold },
  albinoRed: { name: '白子全紅', test: (p: GuppyPhenotype) => p.albino && p.red && !p.snake && !p.grass && !p.tuxedo },
  tuxedo: { name: '禮服', test: (p: GuppyPhenotype) => p.tuxedo && !p.snake && !p.grass },
  redSnake: { name: '紅蛇王', test: (p: GuppyPhenotype) => p.snake && !p.gold },
} as const;
export type OrderStrain = keyof typeof ORDER_STRAINS;

export const FIN_NAMES: Record<FinTrait, string> = { swallow: '燕尾', ribbon: '緞帶', dumbo: '大耳', sword: '劍尾', halfmoon: '半月', bigC: '大C' };

const hasFin = (p: GuppyPhenotype, fin: FinTrait) => (fin === 'sword' ? (p.sword ?? 0) > 0 : fin === 'halfmoon' ? p.tailShape === 'halfmoon' : p[fin]);

/** 螺訂單收的螺：扁卷螺、囊螺（餵太多長出來的），或剛孵出來的小蘋果螺。 */
export type OrderSnail = Extract<PestKind, 'ramshorn' | 'bladder'> | 'appleYoung';

export const ORDER_SNAIL_NAMES: Record<OrderSnail, string> = { ramshorn: PESTS.ramshorn.name, bladder: PESTS.bladder.name, appleYoung: '小蘋果螺' };

/** 出螺單時害蟲小螺至少留幾隻當種螺。 */
export const SNAIL_BREEDERS = 2;

/** 小孔雀單收多大的仔魚（店家拿去當入門魚賣）。 */
export const FRY_ORDER_MIN_CM = 1.2;
/** 仔魚至少這麼多尾才出小孔雀單：一窩被吃得只剩幾尾時不出，免得把要養大的也賣掉。 */
export const FRY_ORDER_MIN_BROOD = 8;

export interface ShopOrder {
  id: number;
  /** fish：中魚、成魚；fry：小孔雀（仔魚長到 FRY_ORDER_MIN_CM）；cutting：插枝；snail：螺。 */
  kind: 'fish' | 'fry' | 'cutting' | 'snail';
  count: number;
  /** 每尾（每隻、每株）出價。 */
  unitPrice: number;
  /** 掛上來的時間（遊戲小時）。 */
  postedHours: number;
  species?: FishSpeciesId;
  plant?: PlantSpeciesId;
  snail?: OrderSnail;
  /** 小孔雀單：至少幾公分。 */
  minCm?: number;
  /** 'juvenile'：中魚以上就收；'adult'：要成魚。 */
  size?: 'juvenile' | 'adult';
  sex?: 'male' | 'female';
  strain?: OrderStrain;
  fin?: FinTrait;
  /** 尾鰭分數至少幾分（孔雀魚）。 */
  minTail?: number;
  /** 收入空檔保底單：連續 6 天沒收入時掛的小單，用手上現有的東西就交得出來（polish-to-9.md §4）。 */
  gap?: boolean;
  /** 小孔雀單：只收這個時間（遊戲小時）以前出生的（出生滿幾天）。 */
  bornBy?: number;
}

export interface OrderBoard {
  orders: ShopOrder[];
  nextId: number;
  /** 上次補單、交單或撕單的時間（遊戲小時），隔 ORDER_GAP_HOURS 補新單；還沒掛過單是 undefined。 */
  lastChangeHours?: number;
  rng: RngState;
  /** 玩家養出過的東西（品系、鰭型、物種、剪過的插枝），決定會出現哪些單。 */
  seen: string[];
  /** 累計交了幾張單、拿到多少錢。 */
  done: number;
  earned: number;
  /** 上次檢查收入空檔保底是第幾個遊戲小時（每小時最多查一次，離線補算比較快）。 */
  gapCheckedHour?: number;
}

export function orderBoard(state: TankState): OrderBoard {
  const e = economy(state);
  return (e.orders ??= { orders: [], nextId: 1, rng: { seed: (state.rng.seed ^ 0x5eed) | 1 }, seen: [], done: 0, earned: 0 });
}

/** 給畫面顯示的訂單內容，例如「2 尾禮服燕尾公魚，尾鰭 60 分以上」。 */
export function orderTitle(o: ShopOrder): string {
  if (o.kind === 'cutting') return `${o.count} 株${PLANT_SPECIES[o.plant!].name}插枝`;
  if (o.kind === 'snail') return `${o.count} 隻${ORDER_SNAIL_NAMES[o.snail!]}`;
  if (o.kind === 'fry') return `${o.count} 尾小孔雀，${o.minCm ?? FRY_ORDER_MIN_CM} cm 以上`;
  const species = o.species!;
  const shrimp = isShrimpSpecies(species);
  const unit = shrimp ? '隻' : '尾';
  const look = `${o.strain ? ORDER_STRAINS[o.strain].name : ''}${o.fin ? FIN_NAMES[o.fin] : ''}`;
  const sex = o.sex ? (o.sex === 'male' ? (shrimp ? '公蝦' : '公魚') : shrimp ? '母蝦' : '母魚') : '';
  const size = o.size === 'juvenile' ? (shrimp ? '幼蝦' : '中魚') : '';
  const name = species === 'guppy' && look ? `${look}${sex || '孔雀魚'}` : `${FISH_SPECIES[species].name}${sex || size}`;
  return `${o.count} ${unit}${name}${o.minTail ? `，尾鰭 ${o.minTail} 分以上` : ''}`;
}

/** 這條魚符不符合訂單（健康、店家收得下；成魚單不收還沒長大的）。 */
export function fishMatchesOrder(fish: Fish, o: ShopOrder): boolean {
  if (o.kind === 'fry') return fryMatches(fish, o);
  if (o.kind !== 'fish' || fish.species !== o.species || buybackRefusal(fish)) return false;
  // 只收自己繁殖的（第 1 代以後）：店裡買來直接交單會變成穩賺的套利（mvp.md：收購不高於店售價，只有自選育的不受限）
  if ((fish.generation ?? 0) < 1) return false;
  if (o.size === 'adult' && isJuvenile(fish)) return false;
  if (o.sex && fish.sex !== o.sex) return false;
  if (!o.strain && !o.fin && !o.minTail) return true;
  if (!fish.genome) return false;
  const p = phenotype(fish.genome);
  if (o.strain && !ORDER_STRAINS[o.strain].test(p)) return false;
  if (o.fin && !hasFin(p, o.fin)) return false;
  return fish.genome.tail >= (o.minTail ?? 0);
}

/** 小孔雀單：自己繁殖、夠大、健康的就收（還沒到店家收購的大小也可以，這張單就是要小魚）。 */
function fryMatches(fish: Fish, o: ShopOrder): boolean {
  if (fish.species !== o.species || (fish.generation ?? 0) < 1 || !fish.alive || fish.gift || fish.listing) return false;
  if (fish.lengthCm < (o.minCm ?? FRY_ORDER_MIN_CM)) return false;
  // 舊存檔沒有出生時間：看生理年齡
  if (o.bornBy !== undefined && (fish.bornHours !== undefined ? fish.bornHours > o.bornBy : (fish.ageDays ?? 0) < (o.postedHours - o.bornBy) / 24)) return false;
  const sick = fish.ich.stage === 'visible' || (fish.infections ?? []).some((i) => i.stage === 'visible') || fish.health < 0.6;
  return !sick;
}

/** 這缸可以拿去交的螺（扁卷、囊螺只記數量；小蘋果螺也是）。 */
function snailsIn(state: TankState, kind: OrderSnail): number {
  const s = state.snails;
  if (!s) return 0;
  return Math.floor(kind === 'appleYoung' ? s.appleYoung : s.pests[kind]);
}

/** 這缸（連產卵盒裡的）可以拿去交這張單的魚，差的排前面（不會先把最好的魚交出去）；keep 是玩家要留下來的魚。 */
export function matchingFish(state: TankState, o: ShopOrder, keep: readonly number[] = []): Fish[] {
  return [...state.fish, ...(state.quarantine?.fish ?? [])].filter((f) => fishMatchesOrder(f, o) && !keep.includes(f.id)).sort((a, b) => a.lengthCm + (a.genome?.tail ?? 0) / 10 - (b.lengthCm + (b.genome?.tail ?? 0) / 10));
}

/** 所有缸加起來湊得到幾份（魚從每一缸挑，插枝看手上）。 */
export function orderSupply(tanks: TankState[], o: ShopOrder, keep: readonly number[] = []): number {
  // 寶箱來的插枝不能交單換錢（polish-to-9.md §4）
  if (o.kind === 'cutting') return sellableCuttings(tanks[0], o.plant!);
  if (o.kind === 'snail') return tanks.reduce((n, t) => n + snailsIn(t, o.snail!), 0);
  return tanks.reduce((n, t) => n + matchingFish(t, o, keep).length, 0);
}

export function orderRefusal(tanks: TankState[], orderId: number, keep: readonly number[] = []): string | null {
  const o = orderBoard(tanks[0]).orders.find((x) => x.id === orderId);
  if (!o) return '這張單已經沒了';
  const n = orderSupply(tanks, o, keep);
  if (n >= o.count) return null;
  const unit = orderUnit(o);
  if (o.kind === 'cutting') return `手上的插枝只有 ${n} ${unit}，還差 ${o.count - n} ${unit}（長得夠高的水草可以修剪下來）`;
  if (o.kind === 'fry') return `${o.minCm ?? FRY_ORDER_MIN_CM} cm 以上的小魚只有 ${n} ${unit}，還差 ${o.count - n} ${unit}`;
  return `${o.kind === 'snail' ? '缸裡的' : '符合的'}只有 ${n} ${unit}，還差 ${o.count - n} ${unit}`;
}

/** 訂單的單位：插枝「株」、蝦和螺「隻」、魚「尾」。 */
export function orderUnit(o: ShopOrder): string {
  if (o.kind === 'cutting') return '株';
  if (o.kind === 'snail' || isShrimpSpecies(o.species!)) return '隻';
  return '尾';
}

/**
 * 交單：從所有缸挑符合的魚（或手上的插枝）交出去，回傳拿到多少錢（交不了回傳 0）。
 * 不算在每天的收購次數裡。keep 是玩家標記要留下來的魚。
 */
export function fulfillOrder(tanks: TankState[], orderId: number, keep: readonly number[] = []): number {
  if (orderRefusal(tanks, orderId, keep)) return 0;
  const state = tanks[0];
  const board = orderBoard(state);
  const o = board.orders.find((x) => x.id === orderId)!;
  let firstGiven: Fish | undefined;
  if (o.kind === 'cutting') economy(state).cuttings[o.plant!]! -= o.count;
  else if (o.kind === 'snail') {
    let left = o.count;
    for (const t of tanks) {
      const give = Math.min(left, snailsIn(t, o.snail!));
      if (give <= 0) continue;
      left -= give;
      if (o.snail === 'appleYoung') t.snails!.appleYoung -= give;
      else t.snails!.pests[o.snail!] -= give;
    }
  } else {
    let left = o.count;
    for (const t of tanks) {
      const give = new Set(matchingFish(t, o, keep).slice(0, left));
      firstGiven ??= give.values().next().value;
      left -= give.size;
      for (const f of give) noteRaisedGone(state, f);
      t.fish = t.fish.filter((f) => !give.has(f));
      if (t.quarantine) t.quarantine.fish = t.quarantine.fish.filter((f) => !give.has(f));
    }
  }
  const coins = o.count * o.unitPrice;
  economy(state).coins += coins;
  if (firstGiven) noteBredSale(state, firstGiven, coins, 'order');
  noteEarned(state);
  board.orders = board.orders.filter((x) => x !== o);
  board.done += 1;
  board.earned += coins;
  board.lastChangeHours = state.hours;
  return coins;
}

/** 不想做的單可以撕掉，隔天補一張新的。 */
export function dismissOrder(state: TankState, orderId: number): boolean {
  const board = orderBoard(state);
  const before = board.orders.length;
  board.orders = board.orders.filter((x) => x.id !== orderId);
  if (board.orders.length === before) return false;
  board.lastChangeHours = state.hours;
  return true;
}

/** 記下玩家養出過的品系、鰭型、物種（自己繁殖的才算）和剪過插枝的水草。 */
function noteProgress(state: TankState, board: OrderBoard): void {
  const seen = new Set(board.seen);
  // 剪過插枝的水草才會有人來訂
  for (const [plant, n] of Object.entries(economy(state).cuttings)) if ((n ?? 0) > 0) seen.add(`plant:${plant}`);
  for (const f of state.fish) {
    if (!f.alive || (f.generation ?? 0) < 1) continue;
    seen.add(`species:${f.species}`);
    if (!isJuvenile(f)) seen.add(`adult:${f.species}`);
    if (!f.genome || f.sex !== 'male' || isJuvenile(f)) continue;
    const p = phenotype(f.genome);
    for (const k of Object.keys(ORDER_STRAINS) as OrderStrain[]) if (ORDER_STRAINS[k].test(p)) seen.add(`strain:${k}`);
    for (const fin of Object.keys(FIN_NAMES) as FinTrait[]) if (hasFin(p, fin)) seen.add(`fin:${fin}`);
  }
  if (seen.size !== board.seen.length) board.seen = [...seen];
}

const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/** 孔雀魚的條件換算成收購倍率（guppyBuybackTier）。 */
function orderTier(o: ShopOrder): number {
  const p: GuppyPhenotype = { albino: false, gold: false, tuxedo: false, red: false, snake: false, grass: false, swallow: false, ribbon: false, dumbo: false, bigC: false, sword: 0, tailShape: 'delta', finLength: 0.45 };
  if (o.strain === 'grass') p.grass = true;
  if (o.strain === 'goldSnake') p.snake = p.gold = true;
  if (o.strain === 'albinoRed') p.albino = p.red = true;
  if (o.strain === 'tuxedo') p.tuxedo = true;
  if (o.strain === 'redSnake') p.snake = p.red = true;
  if (o.fin === 'sword') p.sword = 1;
  else if (o.fin === 'halfmoon') p.tailShape = 'halfmoon';
  else if (o.fin === 'bigC') p.ribbon = p.bigC = true;
  else if (o.fin) p[o.fin] = true;
  return guppyBuybackTier(p);
}

/** 出題階段（mvp.md §4.4.1）：看缸裡實際有什麼，不看天數。 */
export type OrderStage = 'start' | 'brood' | 'breeding';

/** 出題時看的缸況：現在交得出來的東西。 */
export interface OrderContext {
  stage: OrderStage;
  /** 每種水草手上的插枝加上現在修剪得下來的（有價錢的水草才算）。 */
  cuttings: Partial<Record<PlantSpeciesId, number>>;
  /** 缸裡抓得到的螺。 */
  snails: Partial<Record<OrderSnail, number>>;
  /** 自己繁殖、還沒長到店家收購大小的孔雀魚（含產卵盒）。 */
  fry: number;
  /** 其中在育幼盒、檢疫盒裡，大魚吃不到的。 */
  safeFry?: number;
  /** 水草的躲藏係數 0–0.7（hidingFactor）。 */
  hiding?: number;
}

/** 這株水草現在修剪得下幾株插枝（跟 trimPlant 一樣：留一半，多的剪下來）。 */
function trimmable(state: TankState, plant: PlantSpeciesId): number {
  const sp = PLANT_SPECIES[plant];
  return state.plants.filter((p) => p.species === plant).reduce((n, p) => n + Math.max(0, Math.floor((p.biomassG - sp.maxBiomassG * 0.5) / sp.cuttingMassG)), 0);
}

export function orderContext(state: TankState): OrderContext {
  const bred = [...state.fish, ...(state.quarantine?.fish ?? [])].filter((f) => f.alive && (f.generation ?? 0) >= 1);
  const sellable = bred.some((f) => f.lengthCm >= FISH_SPECIES[f.species].adultLengthCm * 0.5);
  const stage: OrderStage = sellable ? 'breeding' : bred.length > 0 ? 'brood' : 'start';
  const cuttings: OrderContext['cuttings'] = {};
  for (const plant of Object.keys(PLANT_PRICES) as PlantSpeciesId[]) {
    // 寶箱來的插枝不能交單，不照它出插枝單
    const n = sellableCuttings(state, plant) + trimmable(state, plant);
    if (n > 0) cuttings[plant] = n;
  }
  const snails: OrderContext['snails'] = {};
  for (const k of Object.keys(ORDER_SNAIL_NAMES) as OrderSnail[]) {
    // 害蟲小螺留幾隻當種螺，訂單不會把缸裡的螺收光（螺會自己繁殖，之後還有得交）
    const n = snailsIn(state, k) - (k === 'appleYoung' ? 0 : SNAIL_BREEDERS);
    if (n > 0) snails[k] = n;
  }
  const young = bred.filter((f) => f.species === 'guppy' && f.lengthCm < FISH_SPECIES.guppy.adultLengthCm * 0.5);
  const boxed = new Set(state.quarantine?.fish ?? []);
  const safeFry = young.filter((f) => f.nursery || boxed.has(f)).length;
  return { stage, cuttings, snails, fry: young.length, safeFry, hiding: hidingFactor(state) };
}

/**
 * 小孔雀單要幾尾（mvp.md §4.4.1 第 3 點、§4.4.2 第 4 點）：在主缸裡的，沒有密草大約只剩一成五長得到 1.2 cm，草越密留越多，
 * 全部拿去交；育幼盒、檢疫盒裡的都活得下來，但大多該留著養大交更貴的中魚單，只拿三成。
 */
export function fryOrderSize(ctx: OrderContext): number {
  const safe = Math.min(ctx.fry, ctx.safeFry ?? 0);
  return safe * 0.3 + (ctx.fry - safe) * (0.15 + 0.3 * (ctx.hiding ?? 0));
}

/** 前兩階段的小額單（插枝、螺、小孔雀）：到了選育階段也留一張當穩定收入。 */
const isSmallOrder = (o: ShopOrder) => o.kind !== 'fish';

/** 這張單現在交不交得出來：缸裡的東西就夠，或修剪一下就夠（插枝）。 */
export function deliverableNow(state: TankState, o: ShopOrder, ctx: OrderContext = orderContext(state)): boolean {
  if (o.kind === 'cutting') return (ctx.cuttings[o.plant!] ?? 0) >= o.count;
  return orderSupply([state], o) >= o.count;
}

/** 依玩家進度抽一張新單；ctx 是現在的缸況（沒給就只看養出過什麼，舊的出題方式）。 */
export function makeOrder(board: OrderBoard, hours: number, ctx?: OrderContext): ShopOrder {
  const r = () => nextRandom(board.rng);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const seen = (prefix: string) => board.seen.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const strains = seen('strain:') as OrderStrain[];
  const fins = seen('fin:') as FinTrait[];
  const plants = (seen('plant:') as PlantSpeciesId[]).filter((p) => p in PLANT_PRICES);
  const species = seen('species:') as FishSpeciesId[];
  const others = species.filter((s) => s !== 'guppy');
  const stage = ctx?.stage ?? (species.includes('guppy') ? 'breeding' : 'start');
  // 缸裡現在剪得下來的水草、抓得到的螺：起步階段的單就從這些出
  const trimPlants = Object.keys(ctx?.cuttings ?? {}).filter((p) => (ctx!.cuttings[p as PlantSpeciesId] ?? 0) >= 2) as PlantSpeciesId[];
  const snailKinds = Object.keys(ctx?.snails ?? {}).filter((k) => (ctx!.snails[k as OrderSnail] ?? 0) >= 3) as OrderSnail[];
  const o: ShopOrder = { id: board.nextId++, kind: 'fish', species: 'guppy', count: 3, unitPrice: 0, postedHours: hours };
  // 進度越多，越常出高價單；前期大多是交得出來的單
  const options: Array<[number, () => void]> = [
    [fins.length > 0 ? 3 : 0, () => {
      // 指定自選育的鰭型（加上品系），每尾 150～400
      o.size = 'adult';
      o.sex = 'male';
      o.fin = pick(fins);
      if (strains.length > 0 && r() < 0.6) o.strain = pick(strains);
      o.count = o.fin === 'bigC' ? 1 : 1 + Math.floor(r() * 2);
      o.minTail = r() < 0.5 ? 60 : undefined;
      o.unitPrice = round5(Math.min(400, Math.max(150, FISH_PRICES.guppy * orderTier(o) * (2.2 + r()))));
    }],
    [strains.length > 0 ? 3 : 0, () => {
      o.size = 'adult';
      o.sex = 'male';
      o.strain = pick(strains);
      o.count = 2 + Math.floor(r() * 2);
      o.minTail = r() < 0.5 ? 60 : undefined;
      o.unitPrice = round5(FISH_PRICES.guppy * orderTier(o) * (o.minTail ? 2.6 : 2.2) + r() * 15);
    }],
    [board.seen.includes('adult:guppy') ? 2 : 0, () => {
      // 普通的成魚就好（自己養大過成魚才會出現）
      o.size = 'adult';
      o.sex = r() < 0.5 ? 'male' : 'female';
      o.count = 2 + Math.floor(r() * 2);
      o.unitPrice = round5(60 + r() * 20);
    }],
    [stage === 'start' ? 1 : 3, () => {
      // 中魚：客人買回去自己養大（仔魚長到一半大小才收）；有仔魚以後就常出，當作養大的目標
      o.size = 'juvenile';
      o.count = 2 + Math.floor(r() * 3);
      o.unitPrice = round5(40 + r() * 15);
    }],
    [others.length > 0 ? 2 : 0, () => {
      o.species = pick(others);
      const shrimp = isShrimpSpecies(o.species);
      o.size = shrimp ? 'juvenile' : 'adult';
      o.count = shrimp ? 5 + 5 * Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
      o.unitPrice = round5(FISH_PRICES[o.species] * (shrimp ? 0.6 : 1) + r() * 5);
    }],
    [plants.length > 0 ? 2 : 0, () => {
      o.kind = 'cutting';
      delete o.species;
      o.plant = pick(plants);
      o.count = 3 + Math.floor(r() * 4);
      o.unitPrice = round5(PLANT_PRICES[o.plant] / 3 + r() * 5);
    }],
    [trimPlants.length > 0 ? (stage === 'start' ? 5 : 1) : 0, () => {
      // 起步：缸裡長得夠高、修剪下來就能交的水草（每張 40～120）
      o.kind = 'cutting';
      delete o.species;
      o.plant = pick(trimPlants);
      o.count = Math.min(ctx!.cuttings[o.plant]!, 2 + Math.floor(r() * 2));
      o.unitPrice = round5(Math.min(120 / o.count, Math.max(40 / o.count, PLANT_PRICES[o.plant] / 3 + r() * 5)));
    }],
    [snailKinds.length > 0 ? (stage === 'start' ? 4 : 1) : 0, () => {
      // 清潔隊螺：餵太多長出來的扁卷、囊螺，或蘋果螺孵出來的小螺（每張 40～120）
      o.kind = 'snail';
      delete o.species;
      o.snail = pick(snailKinds);
      const apple = o.snail === 'appleYoung';
      o.count = Math.min(ctx!.snails[o.snail]!, apple ? 3 + Math.floor(r() * 3) : 5 + 5 * Math.floor(r() * 2));
      o.unitPrice = round5(Math.min(120 / o.count, Math.max(40 / o.count, apple ? 15 + r() * 5 : 8 + r() * 4)));
    }],
    [ctx && ctx.fry >= FRY_ORDER_MIN_BROOD && !board.orders.some((x) => x.kind === 'fry') && stage === 'brood' ? 2 : 0, () => {
      // 第一窩：店家收小孔雀當入門魚賣，每尾 5～8 元起（小魚少的話每尾給多一點，一張約 50～100）。
      // 數量見 fryOrderSize：交得出來、又不會把該養大做中魚單的小魚賣光
      o.kind = 'fry';
      o.minCm = FRY_ORDER_MIN_CM;
      o.count = Math.max(3, Math.min(10, Math.round(fryOrderSize(ctx!))));
      o.unitPrice = Math.min(25, Math.max(5 + Math.floor(r() * 4), Math.round((50 + r() * 30) / o.count)));
    }],
  ];
  const total = options.reduce((a, [w]) => a + w, 0);
  let roll = r() * total;
  for (const [w, make] of options) if ((roll -= w) < 0) return make(), o;
  options[2][1]();
  return o;
}

/** 訂單掛幾天沒交就下架、換新的。 */
export const ORDER_EXPIRE_DAYS = 7;
/** 小孔雀單多等幾天：出單時小魚常常還沒長到 1.2 cm，要給牠們時間長（mvp.md §4.4.2 第 4 點）。 */
export const FRY_ORDER_EXPIRE_DAYS = 10;

/**
 * 補一張新單。板上還沒有現在就交得出來的單時，優先抽交得出來的（可交付保證，§4.4.1 第 2 點）；
 * 選育階段板上沒有小額單時，優先抽小額單（插枝、螺、小孔雀）。抽幾次都不合就用最後一張。
 */
function addOrder(state: TankState, board: OrderBoard, ctx: OrderContext): void {
  const needDeliverable = ctx.stage !== 'breeding' && !board.orders.some((o) => deliverableNow(state, o, ctx));
  // 選育階段留一張插枝或螺的小額單（缸裡剪得出、抓得到才算數）
  const canSmall = Object.values(ctx.cuttings).some((n) => (n ?? 0) >= 2) || Object.values(ctx.snails).some((n) => (n ?? 0) >= 3);
  const needSmall = ctx.stage === 'breeding' && canSmall && !board.orders.some(isSmallOrder);
  // 小孔雀單不拿來湊保證：不然每交一張隔天又補一張，仔魚還沒長大就被賣光
  const ok = (o: ShopOrder) => (!needDeliverable || (o.kind !== 'fry' && deliverableNow(state, o, ctx))) && (!needSmall || (isSmallOrder(o) && o.kind !== 'fry'));
  let o = makeOrder(board, state.hours, ctx);
  for (let tries = 0; tries < 8; tries++) {
    if (ok(o)) break;
    o = makeOrder(board, state.hours, ctx);
  }
  board.orders.push(o);
}

/**
 * 板子被交不出來的魚單佔滿時，把最舊、交不出來的那張換掉（換了回 true）：
 * - 開局（還沒有自家的魚）：缸裡剪得出插枝、抓得到螺了，就換一張現在交得出來的（遊戲性 g9：第 1～7 天全是中魚單）。
 * - 第一窩生出來以後：板上一定要有一張小額單（小孔雀、插枝、螺；mvp.md §4.4.2 第 4 點）。
 */
function swapInSmallOrder(state: TankState, board: OrderBoard, ctx: OrderContext): boolean {
  const canSmall = Object.values(ctx.cuttings).some((n) => (n ?? 0) >= 2) || Object.values(ctx.snails).some((n) => (n ?? 0) >= 3);
  const start = ctx.stage === 'start' && canSmall && !board.orders.some((o) => deliverableNow(state, o, ctx));
  const brood = ctx.stage === 'brood' && ctx.fry >= FRY_ORDER_MIN_BROOD && !board.orders.some(isSmallOrder);
  if (!start && !brood) return false;
  const stale = board.orders.filter((o) => o.kind === 'fish' && !deliverableNow(state, o, ctx)).sort((a, b) => a.postedHours - b.postedHours)[0];
  if (!stale) return false;
  for (let tries = 0; tries < 12; tries++) {
    const o = makeOrder(board, state.hours, ctx);
    if (!isSmallOrder(o) || (start && !deliverableNow(state, o, ctx))) continue;
    board.orders = board.orders.map((x) => (x === stale ? o : x));
    return true;
  }
  return false;
}

/** 連續幾天沒有真的收入（賣魚、賣插枝、交單），訂單板就保證出一張現在交得出來的小單（polish-to-9.md §4「收入空檔」）。 */
export const INCOME_GAP_DAYS = 6;

/** 保底單收的仔魚要出生滿幾天（剛生的魚苗店家不收，polish-to-9.md §4「第二次確認」）；大小不限。 */
export const GAP_FRY_MIN_DAYS = 7;
const GAP_FRY_MIN_CM = 0.5;
/** 保底單的小螺：一張收 5 隻，每隻 8 元（害蟲小螺店裡不賣，照一般螺單的行情）。 */
export const GAP_PEST_COUNT = 5;
export const GAP_PEST_MIN = 1;
const GAP_SNAIL_KEEP = SNAIL_BREEDERS;
const GAP_PEST_PRICE = 8;

/** 這張保底單在這幾缸（共用錢包）湊不湊得出來：插枝看手上能賣的加每缸剪得下來的，魚和螺從每一缸湊（跟交單一樣）。 */
function gapDeliverable(tanks: TankState[], o: ShopOrder): boolean {
  if (o.kind === 'cutting') return sellableCuttings(tanks[0], o.plant!) + tanks.reduce((n, t) => n + trimmable(t, o.plant!), 0) >= o.count;
  return orderSupply(tanks, o) >= o.count;
}

/**
 * 收入空檔保底的小單：用玩家缸裡自己長出來、生出來的東西（插枝、螺、仔魚擇一，有哪種挑哪種；看所有缸）。
 * 只收自己缸裡來的（polish-to-9.md §4）：
 * - 插枝只算缸裡水草現在剪得下來的（買來的水草都比修剪線小，剪得下來的一定是自己長的）。可以只要 1 株。
 * - 螺收害蟲小螺 5 隻（跟著水草搭便車、在缸裡繁殖的，至少留 2 隻種螺；螺還少時收 3～4 隻）或蘋果螺孵出來的小螺，不收店裡買的大螺。
 * - 仔魚只收自己繁殖、出生滿 7 天的，每尾 5～8 元（§4.4.1），最多 2 尾。
 * 每份的價錢不超過店售價。什麼都沒有就回傳 null。
 */
export function incomeGapOrder(tanks: TankState[], board: OrderBoard): ShopOrder | null {
  const r = () => nextRandom(board.rng);
  const now = tanks[0].hours;
  const base = { id: 0, count: 0, unitPrice: 0, postedHours: now, gap: true };
  const candidates: ShopOrder[] = [];
  for (const plant of Object.keys(PLANT_PRICES) as PlantSpeciesId[]) {
    const count = Math.min(tanks.reduce((n, t) => n + trimmable(t, plant), 0), 2);
    if (count > 0) candidates.push({ ...base, kind: 'cutting', plant, count, unitPrice: Math.max(1, Math.floor(PLANT_PRICES[plant] / 3)) });
  }
  for (const snail of Object.keys(ORDER_SNAIL_NAMES) as OrderSnail[]) {
    const have = tanks.reduce((n, t) => n + snailsIn(t, snail), 0);
    if (snail === 'appleYoung') {
      const count = Math.min(have, 3);
      if (count > 0) candidates.push({ ...base, kind: 'snail', snail, count, unitPrice: Math.min(SNAILS.apple.price, Math.round(40 / count)) });
    } else {
      // 一張 5 隻約 40 元；螺還少的時候收 3～4 隻（每隻一樣 8 元）
      const count = Math.min(GAP_PEST_COUNT, have - GAP_SNAIL_KEEP);
      if (count >= GAP_PEST_MIN) candidates.push({ ...base, kind: 'snail', snail, count, unitPrice: GAP_PEST_PRICE });
    }
  }
  const fry: ShopOrder = { ...base, kind: 'fry', species: 'guppy', minCm: GAP_FRY_MIN_CM, bornBy: now - GAP_FRY_MIN_DAYS * 24, count: 1 };
  const fryCount = Math.min(2, orderSupply(tanks, fry));
  if (fryCount > 0) candidates.push({ ...fry, count: fryCount, unitPrice: 5 + Math.floor(r() * 4) });
  const ok = candidates.filter((o) => gapDeliverable(tanks, o));
  if (ok.length === 0) return null;
  const o = ok[Math.floor(r() * ok.length)];
  o.id = board.nextId++;
  return o;
}

/**
 * 收入空檔保底（§4.4.1「至少一張交得出的單」的加強）：從開局（舊存檔從讀檔那天）起算，連續 INCOME_GAP_DAYS 天沒有真的收入，
 * 就掛一張交得出來的保底單。板上同時只會有一張保底單：保底單掛 INCOME_GAP_DAYS 天就下架（updateOrders），還是沒收入就照當時手上有的東西換一張新的，
 * 交不出來了也撤下（手上什麼都沒有就先不出，不會卡著一張交不了的單）。板子滿了就換掉最舊、交不出來的那張（都交得出來就換最舊的）。
 * 寶箱魚幣不算收入。訂單板是所有缸共用的：每個遊戲小時查一次，一次看所有缸（哪一缸有東西都算）。
 */
function ensureIncomeOrder(state: TankState, board: OrderBoard): void {
  const hour = Math.floor(state.hours);
  if (board.gapCheckedHour === hour) return;
  board.gapCheckedHour = hour;
  const tanks = householdTanks(state);
  const e = economy(state);
  const today = Math.floor(state.hours / 24);
  if (e.lastEarnedDay === undefined) e.lastEarnedDay = today;
  if (today - e.lastEarnedDay < INCOME_GAP_DAYS) return;
  const current = board.orders.find((o) => o.gap);
  if (current && gapDeliverable(tanks, current)) return;
  board.orders = board.orders.filter((x) => !x.gap);
  const o = incomeGapOrder(tanks, board);
  if (!o) return;
  if (board.orders.length >= ORDER_BOARD_SIZE) {
    const byAge = [...board.orders].sort((a, b) => a.postedHours - b.postedHours);
    const stale = byAge.find((x) => !tanks.some((t) => deliverableNow(t, x))) ?? byAge[0];
    board.orders = board.orders.filter((x) => x !== stale);
  }
  board.orders.push(o);
}

/** 每次模擬更新時呼叫：記下玩家養出了什麼；第一次掛滿 3 張，之後交掉一張隔天補一張。 */
export function updateOrders(state: TankState): void {
  const board = orderBoard(state);
  noteProgress(state, board);
  fillOrders(state, board);
  ensureIncomeOrder(state, board);
}

function fillOrders(state: TankState, board: OrderBoard): void {
  // 太久沒人交的單，客人就不等了（不用玩家自己撕）；保底單掛 INCOME_GAP_DAYS 天
  const expired = board.orders.filter((o) => state.hours - o.postedHours >= (o.gap ? INCOME_GAP_DAYS : o.kind === 'fry' ? FRY_ORDER_EXPIRE_DAYS : ORDER_EXPIRE_DAYS) * 24);
  if (expired.length > 0) board.orders = board.orders.filter((o) => !expired.includes(o));
  if (board.orders.length >= ORDER_BOARD_SIZE) {
    if (board.lastChangeHours !== undefined && state.hours - board.lastChangeHours >= ORDER_GAP_HOURS && swapInSmallOrder(state, board, orderContext(state))) board.lastChangeHours = state.hours;
    return;
  }
  if (board.lastChangeHours === undefined) {
    const ctx = orderContext(state);
    while (board.orders.length < ORDER_BOARD_SIZE) addOrder(state, board, ctx);
    board.lastChangeHours = state.hours;
  } else if (state.hours - board.lastChangeHours >= ORDER_GAP_HOURS) {
    addOrder(state, board, orderContext(state));
    board.lastChangeHours = state.hours;
  }
}
