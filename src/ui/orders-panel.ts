import { compareOrders, dismissOrder, FIN_NAMES, fulfillOrder, markDaily, ORDER_STRAINS, orderBoard, orderRefusal, orderSupply, orderTitle, orderUnit, outlookDaysLine, outlookFishLine, type OrderOutlook, type ShopOrder, type TankState } from '../sim';
import { artUrl, ownerImg } from './art-icons';
import { orderArt } from './order-alert';
import { ownerMood } from './owner-mood';
import { h } from './dom';
import type { PanelContext } from './panels';

/**
 * 店家訂單板（#143）：主畫面有自己的入口，每張單是一張圖卡（要什麼魚、出多少錢、湊到幾尾），一鍵交貨。
 * 交單的規則在 sim/orders.ts（#105），這裡只負責畫面和提醒。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

export { loadSeenOrders, markOrdersSeen, orderAlert, orderArt, ORDERS_SEEN_KEY, type OrderAlert } from './order-alert';

/** 訂單入口的圖示（工具列、賣魚分頁的連結）。 */
export const ORDER_ICON = artUrl('orders');

/** 條件改成小圖示（#148）：公母、大小、鰭型、尾鰭分數，一眼看得出要什麼魚。 */
function conditionChips(o: ShopOrder): HTMLElement | null {
  const chips: Array<[icon: string, text: string, cls: string]> = [];
  if (o.sex) chips.push([o.sex === 'male' ? '♂' : '♀', o.sex === 'male' ? '公' : '母', o.sex]);
  if (o.size) chips.push(['◐', o.size === 'adult' ? '成魚' : '中魚以上', 'size']);
  if (o.strain) chips.push(['●', ORDER_STRAINS[o.strain].name, `strain-${o.strain}`]);
  if (o.fin) chips.push(['❧', FIN_NAMES[o.fin], 'fin']);
  if (o.minTail) chips.push(['★', `尾鰭 ${o.minTail}+`, 'tail']);
  if (o.kind === 'cutting') chips.push(['✂', '插枝', 'cutting']);
  if (o.kind === 'fry') chips.push(['◔', `${o.minCm} cm+`, 'size']);
  if (chips.length === 0) return null;
  return h('div.order-chips', {}, ...chips.map(([icon, text, cls]) => h(`span.order-chip.${cls}`, {}, h('i', {}, icon), text)));
}

/** 同時有 2 張以上的單時（G5）：所需天數、要用的魚，搶同一批魚的提醒，讓玩家比較先接哪張。 */
function outlookRow(tanks: TankState[], o: ShopOrder, x: OrderOutlook | undefined): HTMLElement | null {
  if (!x) return null;
  const fish = outlookFishLine(tanks, x, o);
  return h(
    'div.order-outlook',
    {},
    h(`span.order-eta${x.days === 0 ? '.now' : x.late ? '.late' : ''}`, {}, h('i', {}, '⏱'), outlookDaysLine(x, o)),
    fish ? h('span.order-use', {}, fish) : null,
    x.sharesWith.length > 0 ? h('span.order-shared', {}, '跟另一張單搶同一批魚') : null,
  );
}

function orderCard(ctx: PanelContext, o: ShopOrder, refresh: () => void, outlook?: OrderOutlook): HTMLElement {
  const { game, toasts } = ctx;
  const have = Math.min(orderSupply(game.tanks, o), o.count);
  const ready = have >= o.count;
  const img = h('img', { src: ART + orderArt(o), alt: '', loading: 'lazy', draggable: 'false' });
  img.addEventListener('error', () => img.remove());
  const unit = orderUnit(o);
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
      outlookRow(game.tanks, o, outlook),
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
                ctx.reward?.(from, got, 'medium');
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
  // 每日小事「看一眼店裡的訂單」
  markDaily(game.tanks, 'orders');
  const board = orderBoard(game.state);
  const refresh = () => sheet.open('客人的訂單', () => ordersPanel(ctx));
  const anyReady = board.orders.some((o) => orderSupply(game.tanks, o) >= o.count);
  const outlooks = compareOrders(game.tanks);
  const say = board.orders.length === 0 ? '單都交完了，明天會有新的客人來訂。' : anyReady ? '有單湊齊了，按「交貨」我就幫你包好送過去。' : '客人只收你自己繁殖的魚。照單子挑魚配對，養大就能交。';
  return h(
    'div.stack',
    {},
    h('div.owner-say', {}, ownerImg('owner-say-avatar', ownerMood(say)), h('span', {}, say)),
    board.done > 0 ? h('div.order-stats', {}, h('span', {}, `已交 ${board.done} 張`), h('span', {}, h('i.coin'), ` ${board.earned}`)) : null,
    h('div.card-grid.order-grid', {}, ...board.orders.map((o) => orderCard(ctx, o, refresh, outlooks.find((x) => x.orderId === o.id)))),
  );
}
