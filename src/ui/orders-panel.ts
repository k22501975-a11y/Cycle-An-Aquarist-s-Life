import { chooseOption, compareOrders, orderDreamNote, tradeCheck, dismissOrder, FIN_NAMES, fulfillOrder, markDaily, ORDER_BOARD_SIZE, ORDER_STRAINS, orderStarter, orderBoard, orderRefusal, orderSupply, orderTitle, orderUnit, outlookDaysLine, outlookFishLine, updateOrders, type OrderOutlook, type ShopOrder, type TankState } from '../sim';
import { artUrl, ownerImg } from './art-icons';
import { orderArt } from './order-alert';
import { ownerMood } from './owner-mood';
import { choiceVisual } from './choice-card';
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

/**
 * 目標單預告（#290，mvp.md §4.4.5）：開局還沒有自家的魚時，第 2 格先讓玩家看到第一窩之後會開的單。
 * 半透明、不能接、不會過期，所以沒有交貨、撕單和進度條。
 */
function previewCard(o: ShopOrder): HTMLElement {
  const img = h('img', { src: ART + orderArt(o), alt: '', loading: 'lazy', draggable: 'false' });
  img.addEventListener('error', () => img.remove());
  const unit = orderUnit(o);
  return h(
    'div.shop-card.order-card.preview',
    { 'aria-disabled': 'true' },
    h('div.card-pic', {}, img, h('span.order-count', {}, `×${o.count}`), h('span.order-lock', {}, '預告')),
    h(
      'div.card-body',
      {},
      h('b.card-name', {}, orderTitle(o)),
      conditionChips(o),
      h('div.order-pay', {}, h('i.coin'), h('b', {}, String(o.unitPrice * o.count)), h('small', {}, `每${unit} ${o.unitPrice}`)),
      h('div.order-preview-note', {}, h('i', {}, '🐟'), '生小魚之後就能接'),
    ),
  );
}

/** 開局訂單板沒滿的格子（#290）：空著，不拿交不出的單充數。 */
function emptySlot(): HTMLElement {
  return h('div.order-slot-empty', {}, h('i', {}, '＋'), h('span', {}, '生小魚後會有更多客人'));
}

function orderCard(ctx: PanelContext, o: ShopOrder, refresh: () => void, outlook?: OrderOutlook): HTMLElement {
  if (o.preview) return previewCard(o);
  const { game, toasts } = ctx;
  const have = Math.min(orderSupply(game.tanks, o), o.count);
  const ready = have >= o.count;
  const img = h('img', { src: ART + orderArt(o), alt: '', loading: 'lazy', draggable: 'false' });
  img.addEventListener('error', () => img.remove());
  const unit = orderUnit(o);
  // 交不出的單（#290 §4.4.5 第 5 點）：卡片標「交不出」，原因和預估時間一定要看得到。
  // 期限內來不及的都標；估不出天數的只標魚（插枝、螺的起步單照規則交得出，還沒買水草時是「買第一株水草會附螺」）
  const blocked = !ready && !!outlook && (outlook.late || (outlook.days === null && (o.kind === 'fish' || o.kind === 'fry')));
  return h(
    `div.shop-card.order-card${ready ? '.ready' : ''}${blocked ? '.blocked' : ''}`,
    {},
    h('div.card-pic', {}, img, h('span.order-count', {}, `×${o.count}`), ready ? h('span.order-ready', {}, '湊齊了') : blocked ? h('span.order-blocked', {}, '交不出') : null),
    h(
      'div.card-body',
      {},
      h('b.card-name', {}, orderTitle(o)),
      conditionChips(o),
      // 選過「交單」之後不再跳卡，但會拿走有夢想魚基因的魚時，卡上寫一行（企劃 #316）
      ((note) => (note ? h('small.order-dream', {}, note) : null))(orderDreamNote(game.tanks, o)),
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
              const deliver = () => {
                const starter = orderStarter(game.tanks);
                const got = game.actAll((tanks) => fulfillOrder(tanks, o.id));
                if (got > 0) {
                  ctx.sound?.('buy');
                  ctx.reward?.(from, got, 'medium');
                  // 開局的起步單交掉馬上補（§4.4.5），先補好再重畫，玩家才看得到新的那張
                  if (starter) game.act((st) => updateOrders(st));
                  toasts.show(`交了「${orderTitle(o)}」，拿到 ${got} 元。${starter ? '店家馬上補了一張新的單' : '明天會有新的單'}`);
                } else toasts.show(orderRefusal(game.tanks, o.id) ?? '交不了', 'warn');
              };
              // 會交出有夢想魚基因、還沒留種的魚：先問一次（C5，#316）；選交單就照一般交貨走，沒選就關掉下次再問
              const ask = game.actAll((tanks) => tradeCheck(tanks, o.id));
              if (ask) {
                ctx.sheet.open(ask.title, () =>
                  choiceVisual(ask, (key) => {
                    const why = game.actAll((tanks) => chooseOption(tanks, 'C5', key));
                    if (why) return why;
                    if (key === 'keep') toasts.show('留下來當備用種魚了，訂單和收購不會拿走牠');
                    else deliver();
                    ctx.sheet.open('訂單', () => ordersPanel(ctx));
                    return null;
                  }),
                );
                return;
              }
              deliver();
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
              const starter = orderStarter(game.tanks);
              game.act((st) => dismissOrder(st, o.id) && starter && updateOrders(st));
              toasts.show(starter ? '撕掉這張單了，店家馬上補了一張新的' : '撕掉這張單了，明天會補一張新的');
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
  const starter = orderStarter(game.tanks);
  const empty = starter ? Math.max(0, ORDER_BOARD_SIZE - board.orders.length) : 0;
  // 開局（還沒有自家的魚）板上只有螺、插枝的起步單（§4.4.5），老闆的話要對得上
  const starterSay = '還沒有自己的小魚，先接螺和插枝的小單。生了小魚，客人就會多起來。';
  const say = board.orders.length === 0 ? '單都交完了。客人會陸續來，過幾天再來看看。' : anyReady ? '有單湊齊了，按「交貨」我就幫你包好送過去。' : starter ? starterSay : '客人只收你自己繁殖的魚。照單子挑魚配對，養大就能交。';
  return h(
    'div.stack',
    {},
    h('div.owner-say', {}, ownerImg('owner-say-avatar', ownerMood(say)), h('span', {}, say)),
    board.done > 0 ? h('div.order-stats', {}, h('span', {}, `已交 ${board.done} 張`), h('span', {}, h('i.coin'), ` ${board.earned}`)) : null,
    h(
      'div.card-grid.order-grid',
      {},
      ...board.orders.map((o) => orderCard(ctx, o, refresh, outlooks.find((x) => x.orderId === o.id))),
      ...Array.from({ length: empty }, emptySlot),
    ),
  );
}
