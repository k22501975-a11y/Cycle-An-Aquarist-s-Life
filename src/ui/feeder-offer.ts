import { price } from '../sim';
import { h } from './dom';
import { shopCard } from './card-kit';

/** 早上報告「裝自動餵食器 ›」點了先看商品卡，按「買下裝上」才扣錢（daily-loop.md §7）。 */
export function feederOffer(deps: { buy: () => void; close: () => void }): HTMLElement {
  return h(
    'div.stack.feeder-offer',
    {},
    shopCard({
      art: 'gear/auto-feeder.webp',
      name: '自動餵食器',
      price: price('feeder:auto'),
      note: '一天自動餵兩次，份量跟著魚數變',
      actions: [h('button.btn', { onclick: deps.buy }, '買下裝上'), h('button.btn.ghost', { onclick: deps.close }, '先不要')],
    }),
  );
}
