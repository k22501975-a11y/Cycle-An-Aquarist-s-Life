import { buybackRefusal, economy, FISH_PRICES, guppyBuybackTier, PLANT_PRICES } from './economy';
import { phenotype, type FinTrait, type GuppyPhenotype } from './genetics';
import { nextRandom, type RngState } from './random';
import { FISH_SPECIES, isShrimpSpecies, PLANT_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';
import { isJuvenile, type Fish, type TankState } from './state';

/**
 * 店家訂單板（design/mvp.md §4.4，M21）：阿德老闆的店同時掛最多 3 張客人的單，交完一張隔天補一張。
 * 條件只看玩家看得到的東西（品系外觀、鰭型、尾鰭分數、公母、大小、數量），出價不受店售價限制。
 * 前期是交得出來的單（中魚、成魚、水草插枝、米蝦）；玩家自己繁殖出某個品系或鰭型後，
 * 才會出現指定那個品系、鰭型的高價單（每尾 150～400）。
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

export interface ShopOrder {
  id: number;
  kind: 'fish' | 'cutting';
  count: number;
  /** 每尾（每隻、每株）出價。 */
  unitPrice: number;
  /** 掛上來的時間（遊戲小時）。 */
  postedHours: number;
  species?: FishSpeciesId;
  plant?: PlantSpeciesId;
  /** 'juvenile'：中魚以上就收；'adult'：要成魚。 */
  size?: 'juvenile' | 'adult';
  sex?: 'male' | 'female';
  strain?: OrderStrain;
  fin?: FinTrait;
  /** 尾鰭分數至少幾分（孔雀魚）。 */
  minTail?: number;
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
}

export function orderBoard(state: TankState): OrderBoard {
  const e = economy(state);
  return (e.orders ??= { orders: [], nextId: 1, rng: { seed: (state.rng.seed ^ 0x5eed) | 1 }, seen: [], done: 0, earned: 0 });
}

/** 給畫面顯示的訂單內容，例如「2 尾禮服燕尾公魚，尾鰭 60 分以上」。 */
export function orderTitle(o: ShopOrder): string {
  if (o.kind === 'cutting') return `${o.count} 株${PLANT_SPECIES[o.plant!].name}插枝`;
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

/** 這缸可以拿去交這張單的魚，差的排前面（不會先把最好的魚交出去）；keep 是玩家要留下來的魚。 */
export function matchingFish(state: TankState, o: ShopOrder, keep: readonly number[] = []): Fish[] {
  return state.fish.filter((f) => fishMatchesOrder(f, o) && !keep.includes(f.id)).sort((a, b) => a.lengthCm + (a.genome?.tail ?? 0) / 10 - (b.lengthCm + (b.genome?.tail ?? 0) / 10));
}

/** 所有缸加起來湊得到幾份（魚從每一缸挑，插枝看手上）。 */
export function orderSupply(tanks: TankState[], o: ShopOrder, keep: readonly number[] = []): number {
  return o.kind === 'cutting' ? (economy(tanks[0]).cuttings[o.plant!] ?? 0) : tanks.reduce((n, t) => n + matchingFish(t, o, keep).length, 0);
}

export function orderRefusal(tanks: TankState[], orderId: number, keep: readonly number[] = []): string | null {
  const o = orderBoard(tanks[0]).orders.find((x) => x.id === orderId);
  if (!o) return '這張單已經沒了';
  const n = orderSupply(tanks, o, keep);
  if (n >= o.count) return null;
  const unit = o.kind === 'cutting' ? '株' : isShrimpSpecies(o.species!) ? '隻' : '尾';
  return `${o.kind === 'cutting' ? '手上的插枝' : '符合的'}只有 ${n} ${unit}，還差 ${o.count - n} ${unit}`;
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
  if (o.kind === 'cutting') economy(state).cuttings[o.plant!]! -= o.count;
  else {
    let left = o.count;
    for (const t of tanks) {
      const give = new Set(matchingFish(t, o, keep).slice(0, left));
      left -= give.size;
      t.fish = t.fish.filter((f) => !give.has(f));
    }
  }
  const coins = o.count * o.unitPrice;
  economy(state).coins += coins;
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

/** 依玩家進度抽一張新單。 */
export function makeOrder(board: OrderBoard, hours: number): ShopOrder {
  const r = () => nextRandom(board.rng);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const seen = (prefix: string) => board.seen.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const strains = seen('strain:') as OrderStrain[];
  const fins = seen('fin:') as FinTrait[];
  const plants = (seen('plant:') as PlantSpeciesId[]).filter((p) => p in PLANT_PRICES);
  const species = seen('species:') as FishSpeciesId[];
  const others = species.filter((s) => s !== 'guppy');
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
    [species.includes('guppy') ? 3 : 1, () => {
      // 中魚：客人買回去自己養大，前期最好交
      o.size = 'juvenile';
      o.count = 3 + Math.floor(r() * 3);
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
  ];
  const total = options.reduce((a, [w]) => a + w, 0);
  let roll = r() * total;
  for (const [w, make] of options) if ((roll -= w) < 0) return make(), o;
  options[2][1]();
  return o;
}

/** 每次模擬更新時呼叫：記下玩家養出了什麼；第一次掛滿 3 張，之後交掉一張隔天補一張。 */
export function updateOrders(state: TankState): void {
  const board = orderBoard(state);
  noteProgress(state, board);
  if (board.orders.length >= ORDER_BOARD_SIZE) return;
  if (board.lastChangeHours === undefined) {
    while (board.orders.length < ORDER_BOARD_SIZE) board.orders.push(makeOrder(board, state.hours));
    board.lastChangeHours = state.hours;
  } else if (state.hours - board.lastChangeHours >= ORDER_GAP_HOURS) {
    board.orders.push(makeOrder(board, state.hours));
    board.lastChangeHours = state.hours;
  }
}
