import { daysToLength } from './growth';
import { tankLabel } from './household';
import { FRY_ORDER_MIN_CM, fishMatchesOrder, matchingFish, orderBoard, orderSupply, orderUnit, trimmableCuttings, type ShopOrder } from './orders';
import { FISH_SPECIES } from './species';
import type { Fish, TankState } from './state';

/**
 * 訂單比較（polish-to-9.md G5）：同時有 2 張以上的單時，每張卡標出「要用哪些魚、還要等幾天」，
 * 跟另一張單搶同一批魚的也標出來，讓玩家比較要先接哪張。
 * 天數用標準照顧的成長曲線估（daysToLength），只算缸裡現在就有、長大就符合的魚。
 */

export interface OrderOutlook {
  orderId: number;
  /** 現在湊得到幾份。 */
  have: number;
  /** 交這張單會用到的魚：現在就符合的（差的先，跟交貨挑的一樣），不夠再補最快長到的。插枝、螺是空的。 */
  fish: Array<{ id: number; tank: number; days: number }>;
  /** 還要等幾天才湊得齊：0 是現在就能交（插枝可能要先修剪），null 是估不出來（缸裡沒有養得到的魚、要等螺生、等水草長）。 */
  days: number | null;
  /** 手上的插枝不夠，但修剪一下就夠。 */
  trim?: boolean;
  /** 整張單拿多少錢。 */
  coins: number;
  /** 跟這張搶同一批魚的其他單。 */
  sharesWith: number[];
}

/** 魚要長到多大這張單才收（中魚單是店家收購的大小，成魚單是成魚，小孔雀單看單上寫的）。 */
function targetCm(fish: Fish, o: ShopOrder): number {
  const adult = FISH_SPECIES[fish.species].adultLengthCm;
  if (o.kind === 'fry') return o.minCm ?? FRY_ORDER_MIN_CM;
  return adult * (o.size === 'adult' ? 0.75 : 0.5);
}

/** 長到單上的大小就符合的魚要幾天（只差大小；其他條件不合、長不到那麼大的回傳 null）。 */
function daysUntilMatch(fish: Fish, o: ShopOrder): number | null {
  const target = targetCm(fish, o);
  const days = daysToLength(fish, target);
  if (!Number.isFinite(days)) return null;
  // 假裝已經長到那麼大，其他條件（品系、公母、鰭型、健康）都合才算
  return fishMatchesOrder({ ...fish, lengthCm: Math.max(fish.lengthCm, target + 1e-6) }, o) ? days : null;
}

export function orderOutlook(tanks: TankState[], o: ShopOrder, keep: readonly number[] = []): OrderOutlook {
  const have = Math.min(o.count, orderSupply(tanks, o, keep));
  const base = { orderId: o.id, have, coins: o.count * o.unitPrice, sharesWith: [] as number[] };
  if (o.kind === 'cutting') {
    if (have >= o.count) return { ...base, fish: [], days: 0 };
    const more = tanks.reduce((n, t) => n + trimmableCuttings(t, o.plant!), 0);
    return have + more >= o.count ? { ...base, fish: [], days: 0, trim: true } : { ...base, fish: [], days: null };
  }
  if (o.kind === 'snail') return { ...base, fish: [], days: have >= o.count ? 0 : null };
  const now: OrderOutlook['fish'] = [];
  const later: OrderOutlook['fish'] = [];
  tanks.forEach((t, tank) => {
    const ready = matchingFish(t, o, keep);
    for (const f of ready) now.push({ id: f.id, tank, days: 0 });
    const readyIds = new Set(ready.map((f) => f.id));
    for (const f of [...t.fish, ...(t.quarantine?.fish ?? [])]) {
      if (!f.alive || readyIds.has(f.id) || keep.includes(f.id)) continue;
      const days = daysUntilMatch(f, o);
      if (days !== null && days > 0) later.push({ id: f.id, tank, days });
    }
  });
  later.sort((a, b) => a.days - b.days);
  const fish = [...now, ...later].slice(0, o.count);
  return { ...base, fish, days: fish.length < o.count ? null : Math.max(0, ...fish.map((f) => f.days)) };
}

/** 板上有 2 張以上的單才比較（一張單沒什麼好比）；回傳每張單的比較資料，順序跟板上一樣。 */
export function compareOrders(tanks: TankState[], keep: readonly number[] = []): OrderOutlook[] {
  const orders = orderBoard(tanks[0]).orders;
  if (orders.length < 2) return [];
  const list = orders.map((o) => orderOutlook(tanks, o, keep));
  for (const a of list) {
    const ids = new Set(a.fish.map((f) => f.id));
    a.sharesWith = list.filter((b) => b !== a && b.fish.some((f) => ids.has(f.id))).map((b) => b.orderId);
  }
  return list;
}

/** 卡片上的「所需天數」：現在就能交／修剪一下就能交／再養約 N 天／估不出來的原因。 */
export function outlookDaysLine(x: OrderOutlook, o: ShopOrder): string {
  if (x.trim) return '修剪一下就能交';
  if (x.days === 0) return '現在就能交';
  if (x.days !== null) return `再養約 ${x.days} 天`;
  if (o.kind === 'cutting') return '等水草長高再剪';
  if (o.kind === 'snail') return '等螺再多生一些';
  return '缸裡還沒有養得成的魚';
}

/** 卡片上的「要用的魚」：從哪幾缸挑幾尾（只有一缸就不寫缸名）；插枝、螺回傳 null。 */
export function outlookFishLine(tanks: TankState[], x: OrderOutlook, o: ShopOrder): string | null {
  if (x.fish.length === 0) return null;
  const unit = orderUnit(o);
  const byTank = new Map<number, number>();
  for (const f of x.fish) byTank.set(f.tank, (byTank.get(f.tank) ?? 0) + 1);
  const growing = x.fish.filter((f) => f.days > 0).length;
  const where = tanks.length > 1 ? [...byTank].map(([t, n]) => `${tankLabel(tanks, t)} ${n} ${unit}`).join('＋') : `${x.fish.length} ${unit}`;
  return `用${where}${growing > 0 ? `（${growing} ${unit}還在長）` : ''}`;
}
