import { economy } from './economy';
import { type Fish, type TankState } from './state';
import { ARRIVAL_KEEP_DAYS, ARRIVAL_TRACK_DAYS, type ArrivalStatus } from './arrivals';

// 新魚到貨後的狀況：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/** 給伺服器：這幾筆市場訂單的魚在買家這邊的狀況。carried 是伺服器出貨資料算出來的帶病清單（carriedDiseases）。 */
export function arrivalStatus(tanks: TankState[], orders: ReadonlyArray<{ order: number; carried: readonly string[] }>): ArrivalStatus[] {
  const list = economy(tanks[0]).arrivals ?? [];
  const now = tanks[0].hours;
  return orders.map(({ order, carried }) => {
    const a = list.find((x) => x.order === order);
    if (!a) return { order, days: 0, status: 'unknown', sellerFault: false, survived: false };
    const days = Math.floor((now - a.hours) / 24);
    const limit = a.hours + ARRIVAL_TRACK_DAYS * 24;
    if (a.died !== undefined) {
      const early = a.died < limit;
      return { order, days, status: 'died', diedDay: Math.floor((a.died - a.hours) / 24), cause: a.cause, sellerFault: early && carried.includes(a.cause ?? ''), survived: !early };
    }
    if (a.gone !== undefined) return { order, days, status: 'gone', sellerFault: false, survived: a.gone >= limit };
    return { order, days, status: 'alive', sellerFault: false, survived: now >= limit };
  });
}

/** 收到市場買的魚時呼叫（market.ts 的 receiveFish）。 */
export function noteArrival(state: TankState, fish: Fish, order: number): void {
  fish.marketOrder = order;
  const e = economy(state);
  const list = (e.arrivals ??= []).filter((a) => state.hours - a.hours < ARRIVAL_KEEP_DAYS * 24 && a.order !== order);
  list.push({ order, fish: fish.id, hours: state.hours });
  e.arrivals = list;
}

/** 伺服器出貨時存的魚資料裡帶著哪些病（白點潛伏或發病、柱狀病、鰓吸蟲）。 */
export function carriedDiseases(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const ich = item.ich as { stage?: unknown } | undefined;
  if (ich && (ich.stage === 'incubating' || ich.stage === 'visible')) out.push('ich');
  if (Array.isArray(item.infections)) for (const i of item.infections as Array<{ kind?: unknown }>) if (i && (i.kind === 'columnaris' || i.kind === 'flukes') && !out.includes(i.kind)) out.push(i.kind);
  return out;
}
