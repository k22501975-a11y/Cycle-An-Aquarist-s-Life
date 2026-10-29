import { temperatureFactor } from './chemistry';
import { buybackRefusal, economy, reserveShort, spend } from './economy';
import { sellFish } from './economy-actions';
import { growFish } from './growth';
import { FISH_SPECIES } from './species';
import { isJuvenile, type Fish, type TankState } from './state';

/**
 * 收納箱暫養（polish-to-9.md §13.7）：太擠、錢不夠買缸、小魚又還太小不能賣時，現實的水族玩家會拿收納箱暫養。
 * 箱子附打氣和小加熱棒，放在缸旁；只放小魚，不能種草也不能繁殖，小魚長到能賣再撈出來賣。
 * 一個存檔最多 MAX_TUBS 個（一缸旁邊放一個），不算擴缸（不佔缸位、不影響買缸的價錢）。
 */
export const TUB_PRICE = 180;
/** 一個收納箱放幾尾小魚還不算擠（§7 的擠缸照這個算）。 */
export const TUB_CAPACITY = 30;
export const MAX_TUBS = 2;
/** 箱子的小加熱棒固定的水溫。 */
export const TUB_TEMP_C = 26;

/** 全家有幾個收納箱。 */
export const tubCount = (tanks: TankState[]): number => tanks.filter((t) => t.tub).length;

/** 收納箱擠不擠（1 就是剛好放滿）。 */
export const tubCrowding = (t: TankState): number => (t.tub?.fish.filter((f) => f.alive).length ?? 0) / TUB_CAPACITY;

/** 為什麼不能在這缸旁邊放收納箱；可以就回傳 null（已經有了也是 null：直接放進去）。 */
export function tubRefusal(tanks: TankState[], tank: number): string | null {
  const t = tanks[tank];
  if (!t) return '沒有這一缸';
  if (t.tub) return t.tub.fish.filter((f) => f.alive).length >= TUB_CAPACITY ? '收納箱已經放滿了' : null;
  if (tubCount(tanks) >= MAX_TUBS) return `最多放 ${MAX_TUBS} 個收納箱`;
  if (economy(tanks[0]).coins < TUB_PRICE) return '錢不夠';
  return null;
}

/** 要花多少錢（已經有收納箱就是 0）。 */
export const tubCost = (t: TankState): number => (t.tub ? 0 : TUB_PRICE);

/** 推薦用收納箱嗎：買完手上還要剩 BUY_RESERVE（polish-to-9.md §11）。 */
export const tubAffordable = (tanks: TankState[], tank: number): boolean => !tubRefusal(tanks, tank) && reserveShort(economy(tanks[0]).coins, tubCost(tanks[tank])) === 0;

/**
 * 這缸可以搬進收納箱的小魚：自己繁殖的、還沒長大的小魚（品系的小魚也可以，太擠的繁殖缸多半是牠們）；
 * 留種的、種魚、懷孕的不搬，育幼盒裡的也不動。小的先搬（最容易被吃、也最久才能賣）。
 */
export function tubCandidates(t: TankState, breeders: ReadonlySet<number>): Fish[] {
  return t.fish
    .filter((f) => f.alive && !f.keeper && !f.nursery && !f.listing && f.pregnancy <= 0 && (f.generation ?? 0) >= 1 && isJuvenile(f) && !breeders.has(f.id))
    .sort((a, b) => a.lengthCm - b.lengthCm);
}

/** 收納箱還放得下幾尾。 */
export const tubRoom = (t: TankState): number => Math.max(0, TUB_CAPACITY - (t.tub?.fish.filter((f) => f.alive).length ?? 0));

/** 在這缸旁邊放收納箱（沒有才買），把小魚搬進去：回傳搬了幾尾；不能放就回傳 0。 */
export function moveToTub(tanks: TankState[], tank: number, breeders: ReadonlySet<number>): number {
  const t = tanks[tank];
  if (!t || tubRefusal(tanks, tank)) return 0;
  const fish = tubCandidates(t, breeders).slice(0, tubRoom(t));
  if (fish.length === 0) return 0;
  if (!t.tub) {
    if (!spend(tanks[0], TUB_PRICE)) return 0;
    t.tub = { fish: [] };
  }
  for (const f of fish) {
    t.fish = t.fish.filter((x) => x !== f);
    f.stress = Math.max(f.stress, 0.3);
    t.tub.fish.push(f);
  }
  return fish.length;
}

/** 收納箱裡長到能賣的（店家照一般價收，不是論尾收的小小魚）。 */
export const tubReady = (t: TankState): Fish[] => (t.tub?.fish ?? []).filter((f) => f.alive && !buybackRefusal(f));

/**
 * 收納箱的一個 tick：箱子有打氣、小加熱棒，跟主缸一起餵、一起換水，水質不用另外顧。
 * 小魚照常長大；放超過 TUB_CAPACITY 尾就長得慢、壓力變大。沒有成魚，也不會繁殖。
 */
export function updateTub(state: TankState, dt: number): void {
  const tub = state.tub;
  if (!tub) return;
  const tf = temperatureFactor(TUB_TEMP_C);
  const living = tub.fish.filter((f) => f.alive);
  const crowd = living.length / TUB_CAPACITY;
  for (const fish of living) {
    fish.ageDays = (fish.ageDays ?? 0) + (dt / 24) * Math.sqrt(tf);
    fish.hunger = 0.2;
    if (fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm) growFish(state, fish, tf, crowd, dt);
    const target = crowd > 1 ? Math.min(1, 0.1 + (crowd - 1) * 0.8) : 0.1;
    fish.stress += (target - fish.stress) * (1 - Math.exp(-0.1 * dt));
  }
  if (living.length < tub.fish.length) tub.fish = living;
}

/** 把收納箱裡長到能賣的撈出來賣給阿德（照每天能賣的次數）：回傳 {賣了幾尾, 拿到多少錢}。 */
export function sellTub(tanks: TankState[], tank: number): { n: number; coins: number } {
  const t = tanks[tank];
  let n = 0;
  let coins = 0;
  for (const f of t ? tubReady(t) : []) {
    const got = sellFish(t, f.id);
    // 今天賣不了了
    if (got === 0) break;
    n++;
    coins += got;
  }
  return { n, coins };
}
