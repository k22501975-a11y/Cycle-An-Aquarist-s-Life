import { tankLabel } from './household';
import { daysUntilMatch, matchingFish, orderTargetCm, orderBoard, orderExpiresHours, orderSupply, orderUnit, trimmableCuttings, type ShopOrder } from './orders';
import { isShrimpSpecies } from './species';
import { type TankState } from './state';

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
  /** 這張單還掛幾天（不到一天算 0）。 */
  daysLeft: number;
  /** 估的天數比單子剩下的久：等魚長大之前客人就不等了。 */
  late: boolean;
  /** 跟這張搶同一批魚的其他單。 */
  sharesWith: number[];
}

export function orderOutlook(tanks: TankState[], o: ShopOrder, keep: readonly number[] = []): OrderOutlook {
  const have = Math.min(o.count, orderSupply(tanks, o, keep));
  const hoursLeft = Math.max(0, orderExpiresHours(o) - tanks[0].hours);
  const base = { orderId: o.id, have, coins: o.count * o.unitPrice, sharesWith: [] as number[], daysLeft: Math.floor(hoursLeft / 24), late: false };
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
  const days = fish.length < o.count ? null : Math.max(0, ...fish.map((f) => f.days));
  return { ...base, fish, days, late: days !== null && days * 24 > hoursLeft };
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

/** 卡片上的「所需天數」：現在就能交／修剪一下就能交／再養約 N 天／來不及／估不出來的原因。 */
export function outlookDaysLine(x: OrderOutlook, o: ShopOrder): string {
  if (x.trim) return '修剪一下就能交';
  if (x.days === 0) return '現在就能交';
  if (x.late) {
    // 交不出的單寫原因和預估時間（mvp.md §4.4.5 第 5 點），例如「中魚 2.3 cm：最快那尾約 9 天後，單子剩 4 天」
    const shrimp = o.species !== undefined && isShrimpSpecies(o.species);
    const what = o.kind === 'fry' ? '小孔雀' : o.size === 'adult' ? (shrimp ? '成蝦' : '成魚') : shrimp ? '幼蝦' : '中魚';
    const need = o.count - x.have;
    const when = need <= 1 ? `最快那尾約 ${x.days} 天後` : `湊齊 ${need} ${orderUnit(o)}約 ${x.days} 天後`;
    return `${what} ${Number(orderTargetCm(o).toFixed(1))} cm：${when}，單子剩 ${x.daysLeft} 天`;
  }
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
