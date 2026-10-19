import type { KeyValueStore } from '../game/save';
import { dismissOrder, FIN_NAMES, fulfillOrder, ORDER_STRAINS, orderBoard, orderRefusal, orderSupply, orderTitle, type OrderStrain, type ShopOrder, type TankState } from '../sim';
import { artUrl, ownerImg } from './art-icons';
import { h } from './dom';
import type { PanelContext } from './panels';
import { guppyArt, plantArt, speciesArt } from './shop-cards';

/**
 * 店家訂單板（#143）：主畫面有自己的入口，每張單是一張圖卡（要什麼魚、出多少錢、湊到幾尾），一鍵交貨。
 * 交單的規則在 sim/orders.ts（#105），這裡只負責畫面和提醒。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

/** 訂單入口的圖示（工具列、賣魚分頁的連結）。 */
export const ORDER_ICON = artUrl('orders');

/** 訂單品系對應的精繪圖（shop-cards 的 GUPPY_STRAIN_ART 順序）。 */
const STRAIN_INDEX: Record<OrderStrain, number> = { grass: 0, goldSnake: 1, albinoRed: 2, tuxedo: 3, redSnake: 4 };

export function orderArt(o: ShopOrder): string {
  if (o.kind === 'cutting') return plantArt(o.plant!);
  if (o.species === 'guppy' && (o.strain || o.fin)) return guppyArt(o.strain ? STRAIN_INDEX[o.strain] : 0, o.fin);
  return speciesArt(o.species!, o.sex);
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
  const board = orderBoard(tanks[0]);
  const ready = board.orders.filter((o) => orderSupply(tanks, o) >= o.count);
  const fresh = board.seen.length > 0 ? board.orders.filter((o) => !seen.has(o.id)).length : 0;
  return { ready, fresh };
}

/** 條件改成小圖示（#148）：公母、大小、鰭型、尾鰭分數，一眼看得出要什麼魚。 */
function conditionChips(o: ShopOrder): HTMLElement | null {
  const chips: Array<[icon: string, text: string, cls: string]> = [];
  if (o.sex) chips.push([o.sex === 'male' ? '♂' : '♀', o.sex === 'male' ? '公' : '母', o.sex]);
  if (o.size) chips.push(['◐', o.size === 'adult' ? '成魚' : '中魚以上', 'size']);
  if (o.strain) chips.push(['●', ORDER_STRAINS[o.strain].name, `strain-${o.strain}`]);
  if (o.fin) chips.push(['❧', FIN_NAMES[o.fin], 'fin']);
  if (o.minTail) chips.push(['★', `尾鰭 ${o.minTail}+`, 'tail']);
  if (o.kind === 'cutting') chips.push(['✂', '插枝', 'cutting']);
  if (chips.length === 0) return null;
  return h('div.order-chips', {}, ...chips.map(([icon, text, cls]) => h(`span.order-chip.${cls}`, {}, h('i', {}, icon), text)));
}

function orderCard(ctx: PanelContext, o: ShopOrder, refresh: () => void): HTMLElement {
  const { game, toasts } = ctx;
  const have = Math.min(orderSupply(game.tanks, o), o.count);
  const ready = have >= o.count;
  const img = h('img', { src: ART + orderArt(o), alt: '', loading: 'lazy', draggable: 'false' });
  img.addEventListener('error', () => img.remove());
  const unit = o.kind === 'cutting' ? '株' : '尾';
  return h(
    `div.shop-card.order-card${ready ? '.ready' : ''}`,
    {},
    h('div.card-pic', {}, img, h('span.order-count', {}, `×${o.count}`), ready ? h('span.order-ready', {}, '湊齊了') : null),
    h(
      'div.card-body',
      {},
      h('b.card-name', {}, orderTitle(o)),
      conditionChips(o),
      h('div.order-pay', {}, h('i.coin'), h('b', {}, String(o.unitPrice * o.count)), h('small', {}, `每${unit} ${o.unitPrice}`)),
      h('div.order-meter', { title: `湊到 ${have} / ${o.count}` }, h('i', { style: `width:${(have / o.count) * 100}%` }), h('span', {}, `${have} / ${o.count}`)),
      h(
        'div.order-actions',
        {},
        h(
          `button.btn${ready ? '.primary' : ''}`,
          {
            onclick: (e: MouseEvent) => {
              // 先記下按鈕位置：交貨後面板會重畫，按鈕就不在畫面上了
              const from = (e.currentTarget as Element).getBoundingClientRect();
              const got = game.actAll((tanks) => fulfillOrder(tanks, o.id));
              if (got > 0) {
                ctx.sound?.('buy');
                ctx.reward?.(from, got);
                toasts.show(`交了「${orderTitle(o)}」，拿到 ${got} 元。明天會有新的單`);
              } else toasts.show(orderRefusal(game.tanks, o.id) ?? '交不了', 'warn');
              refresh();
            },
          },
          '交貨',
        ),
        h(
          'button.btn.small.order-skip',
          {
            title: '換一張',
            'aria-label': '換一張',
            onclick: () => {
              game.act((st) => dismissOrder(st, o.id));
              toasts.show('撕掉這張單了，明天會補一張新的');
              refresh();
            },
          },
          '↻',
        ),
      ),
    ),
  );
}

/** 訂單板：老闆一句話＋每張單一張圖卡。 */
export function ordersPanel(ctx: PanelContext): Node {
  const { game, sheet } = ctx;
  const board = orderBoard(game.state);
  const refresh = () => sheet.open('客人的訂單', () => ordersPanel(ctx));
  const anyReady = board.orders.some((o) => orderSupply(game.tanks, o) >= o.count);
  const say = board.orders.length === 0 ? '單都交完了，明天會有新的客人來訂。' : anyReady ? '有單湊齊了，按「交貨」我就幫你包好送過去。' : '客人只收你自己繁殖的魚。照單子挑魚配對，養大就能交。';
  return h(
    'div.stack',
    {},
    h('div.owner-say', {}, ownerImg('owner-say-avatar'), h('span', {}, say)),
    board.done > 0 ? h('div.order-stats', {}, h('span', {}, `已交 ${board.done} 張`), h('span', {}, h('i.coin'), ` ${board.earned}`)) : null,
    h('div.card-grid.order-grid', {}, ...board.orders.map((o) => orderCard(ctx, o, refresh))),
  );
}
