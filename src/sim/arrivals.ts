import { economy, householdTanks } from './economy';
import { type Fish, type TankState } from './state';

/**
 * 到貨存活追蹤（L2，#76；market-and-breeding.md §3.6）：市場買來的魚到貨後記一筆，死了記下時間和死因。
 * 伺服器拿買家上傳的存檔算賣家的「到貨後 30 天存活率」：只有死於出貨時就帶著的病才算賣家的，
 * 買家自己養死的（水質、餓、沒對水）不算。帶不帶病看伺服器自己存的出貨資料，不信存檔。
 */

/** 追蹤幾天（存活率看 30 天）。紀錄留 ARRIVAL_KEEP_DAYS 天：伺服器查收貨後 14 個現實天內的（約 98 遊戲天），要比那長，不然還沒回報就被清掉。 */
export const ARRIVAL_TRACK_DAYS = 30;
const ARRIVAL_KEEP_DAYS = 120;

export interface MarketArrival {
  /** 市場訂單編號。 */
  order: number;
  /** 買家缸裡的魚編號。 */
  fish: number;
  /** 到貨時間（遊戲小時）。 */
  hours: number;
  /** 死掉的時間和死因。 */
  died?: number;
  cause?: string;
  /** 魚不在缸裡了又沒死（賣掉、交單、送人）：從這時候起不算。 */
  gone?: number;
}

/** 收到市場買的魚時呼叫（market.ts 的 receiveFish）。 */
export function noteArrival(state: TankState, fish: Fish, order: number): void {
  fish.marketOrder = order;
  const e = economy(state);
  const list = (e.arrivals ??= []).filter((a) => state.hours - a.hours < ARRIVAL_KEEP_DAYS * 24 && a.order !== order);
  list.push({ order, fish: fish.id, hours: state.hours });
  e.arrivals = list;
}

/**
 * 每個 tick 看一次還在追蹤的魚：死了記時間和死因（早上報告用的同一個 fish_died 事件），不見了記 gone。
 * 死魚撈掉之前一定先經過一個 tick，所以不會漏記死因。
 */
export function trackArrivals(state: TankState): void {
  const list = state.economy?.arrivals;
  if (!list?.length) return;
  for (const a of list) {
    if (a.died !== undefined || a.gone !== undefined || state.hours - a.hours > ARRIVAL_TRACK_DAYS * 24) continue;
    let fish: Fish | undefined;
    let home: TankState | undefined;
    for (const t of householdTanks(state)) {
      fish = t.fish.find((f) => f.id === a.fish && f.marketOrder === a.order) ?? t.quarantine?.fish.find((f) => f.id === a.fish && f.marketOrder === a.order);
      if (fish) {
        home = t;
        break;
      }
    }
    if (!fish) {
      // 這一缸找不到可能只是換到還沒登記的別缸：只有主缸（錢包的主人）才判定不見
      if (householdTanks(state)[0] === state) a.gone = state.hours;
      continue;
    }
    if (fish.alive) continue;
    const ev = [...home!.events].reverse().find((x) => x.type === 'fish_died' && x.subjectId === fish!.id);
    a.died = ev?.hours ?? state.hours;
    a.cause = ev?.cause ?? 'unknown';
  }
}

/** 伺服器出貨時存的魚資料裡帶著哪些病（白點潛伏或發病、柱狀病、鰓吸蟲）。 */
export function carriedDiseases(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const ich = item.ich as { stage?: unknown } | undefined;
  if (ich && (ich.stage === 'incubating' || ich.stage === 'visible')) out.push('ich');
  if (Array.isArray(item.infections)) for (const i of item.infections as Array<{ kind?: unknown }>) if (i && (i.kind === 'columnaris' || i.kind === 'flukes') && !out.includes(i.kind)) out.push(i.kind);
  return out;
}

export interface ArrivalStatus {
  order: number;
  /** 到貨幾天了（遊戲天）。 */
  days: number;
  /** alive：還活著；died：死了；gone：不在缸裡了（賣掉、交單）；unknown：存檔裡沒有這筆。 */
  status: 'alive' | 'died' | 'gone' | 'unknown';
  /** 到貨後第幾天死的、死因。 */
  diedDay?: number;
  cause?: string;
  /** 死於出貨時就帶著的病：算賣家的。 */
  sellerFault: boolean;
  /** 撐過 30 天（還活著，或 30 天後才死、才不見）。 */
  survived: boolean;
}

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
