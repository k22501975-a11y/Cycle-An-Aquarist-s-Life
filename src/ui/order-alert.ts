import type { KeyValueStore } from '../game/save';
import { orderBoard, orderSupply, tankStarted, type OrderStrain, type ShopOrder, type TankState } from '../sim';
import { fryArt, guppyArt, plantArt, speciesArt } from './shop-cards';

/**
 * 訂單入口的提醒（主畫面每半秒看一次）：從 orders-panel.ts 拆出來留在主程式，
 * 訂單板本身的畫面跟著其他面板延後載入（ui/deferred-ui.ts）。
 */

/** 訂單品系對應的精繪圖（shop-cards 的 GUPPY_STRAIN_ART 順序）。 */
const STRAIN_INDEX: Record<OrderStrain, number> = { grass: 0, goldSnake: 1, albinoRed: 2, tuxedo: 3, redSnake: 4 };

export function orderArt(o: ShopOrder): string {
  if (o.kind === 'cutting') return plantArt(o.plant!);
  if (o.kind === 'fry') return fryArt(o.species!);
  if (o.kind === 'snail') return o.snail === 'appleYoung' ? 'snail/snail-apple-babies.webp' : o.snail === 'bladder' ? 'snail/snail-bladder.webp' : 'snail/snail-ramshorn-red.webp';
  if (o.species === 'guppy' && (o.strain || o.fin)) return guppyArt(o.strain ? STRAIN_INDEX[o.strain] : 0, o.fin);
  return speciesArt(o.species!, o.sex);
}

/** 第一次「有訂單可以交貨了」卡上說客人要的是什麼（照訂單種類，交螺的單不說「你養的魚」）。 */
export function orderReadyWhat(o: ShopOrder): string {
  if (o.kind === 'snail') return '缸裡的小螺';
  if (o.kind === 'cutting') return '你修下來的插枝';
  if (o.kind === 'fry') return '你生的小魚';
  return '你養的魚';
}

/** 看過的訂單（這台裝置記住，不進存檔）：沒看過的單讓入口亮一個小點。 */
export const ORDERS_SEEN_KEY = 'cycle.orders.seen.v1';

export function loadSeenOrders(store: KeyValueStore): Set<number> {
  try {
    const raw = store.getItem(ORDERS_SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is number => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

export function markOrdersSeen(store: KeyValueStore, seen: Set<number>, state: TankState): void {
  const ids = orderBoard(state).orders.map((o) => o.id);
  if (ids.every((id) => seen.has(id))) return;
  seen.clear();
  for (const id of ids) seen.add(id);
  try {
    store.setItem(ORDERS_SEEN_KEY, JSON.stringify(ids));
  } catch {
    // 存不了就只在這次遊戲記得
  }
}

export interface OrderAlert {
  /** 現在就湊得齊、可以交貨的單。 */
  ready: ShopOrder[];
  /** 還沒看過的新單數。 */
  fresh: number;
}

/**
 * 入口要不要提醒：有能交的單，或有沒看過的新單。
 * 玩家還沒自己繁殖出任何東西前（新手期），新單不提醒，免得一開局就有個紅點吵人。
 */
export function orderAlert(tanks: TankState[], seen: Set<number>): OrderAlert {
  // 開機前不提示訂單（#204）
  if (!tankStarted(tanks[0])) return { ready: [], fresh: 0 };
  const board = orderBoard(tanks[0]);
  const ready = board.orders.filter((o) => orderSupply(tanks, o) >= o.count);
  const fresh = board.seen.length > 0 ? board.orders.filter((o) => !seen.has(o.id)).length : 0;
  return { ready, fresh };
}
