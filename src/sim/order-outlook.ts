import { economy } from './economy';
import { daysToFill, daysUntilMatch, matchingFish, orderExpiresHours, orderSupply, trimmableCuttings, type ShopOrder } from './orders';
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
  /** 估的天數比單子剩下的久：等魚長大之前客人就不等了。板上的單照板子每小時標的（ShopOrder.late，#299），不每次重算。 */
  late: boolean;
  /** 螺單：還沒買過水草、缸裡也沒螺（起步螺單照第一株一定夾帶的螺估，§4.4.5）。 */
  firstPlant?: boolean;
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
  if (o.kind === 'snail') {
    // 螺會自己生：照 daysToFill 的繁殖速度估（要留種螺）
    const d = daysToFill(tanks, o);
    const days = d === null ? null : Math.ceil(d);
    const firstPlant = d === null && (economy(tanks[0]).plantBuys ?? 0) === 0;
    return { ...base, fish: [], days, late: d !== null && (o.late ?? d * 24 > hoursLeft), ...(firstPlant ? { firstPlant } : {}) };
  }
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
  return { ...base, fish, days, late: days !== null && (o.late ?? days * 24 > hoursLeft) };
}

