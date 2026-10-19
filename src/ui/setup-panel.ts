import { applySetup, economy, RECOMMENDED_SETUP, setupCards, setupCost, setupRefusal, withTank, type SetupCategory, type SetupChoice } from '../sim';
import { h } from './dom';
import type { PanelContext } from './panels';
import { cardGrid, priceTag, shopCard } from './shop-cards';

/**
 * 開缸畫面（F1-a）：每一類一排設備卡，點卡片選它；底下是總價、剩下的錢、「推薦組合」和「開缸」。
 * 卡片資料來自 setupCards()，美術與 UI 之後可以換成正式版面（F1-b 的演出接在「開缸」之後）。
 */

/** 玩家在開缸畫面上的選擇（關掉面板再打開還在）。 */
let draft: SetupChoice = { ...RECOMMENDED_SETUP };

export function setupPanel(ctx: PanelContext, onDone: () => void): HTMLElement {
  const { game, sheet, toasts } = ctx;
  const coins = economy(game.tanks[0]).coins;
  const pick = (category: SetupCategory, id: string) => {
    draft = category === 'tank' ? withTank(draft, id as SetupChoice['tank']) : { ...draft, [category]: id };
    sheet.refresh();
  };
  const sections = setupCards(draft).map(({ category, title, options }) =>
    h(
      'section.setup-cat',
      {},
      h('h3', {}, title),
      cardGrid(
        ...options.map((o) => {
          const chosen = draft[category] === o.id;
          return shopCard({
            art: o.art,
            name: o.name,
            price: category === 'tank' ? null : o.price,
            badge: chosen ? '已選' : o.recommended ? '推薦' : undefined,
            chips: o.locked ? ['🔒 ' + o.locked] : category === 'tank' ? ['阿德老闆送的', '＋ ' + o.pro, '－ ' + o.con] : ['＋ ' + o.pro, '－ ' + o.con],
            note: o.warning ? `阿德：${o.warning}` : undefined,
            cls: o.locked ? '.locked' : chosen ? '.owned' : '',
            actions: o.locked ? [] : [h(`button.btn.small${chosen ? '' : '.primary'}`, { disabled: chosen, onclick: () => pick(category, o.id) }, chosen ? '已選' : '選這個')],
          });
        }),
      ),
    ),
  );
  const cost = setupCost(draft);
  const refusal = setupRefusal(game.tanks[0], draft);
  const total = h(
    'div.setup-total',
    {},
    h('span', {}, '合計 '),
    priceTag(cost),
    h('span', {}, `　買完剩 ${(coins - cost).toLocaleString('zh-TW')} 元買魚和水草`),
  );
  const recommend = h('button.btn', { onclick: () => ((draft = { ...RECOMMENDED_SETUP }), sheet.refresh()) }, '推薦組合');
  const confirm = h(
    'button.btn.primary',
    {
      disabled: !!refusal,
      onclick: () => {
        const why = game.act((s) => applySetup(s, draft));
        if (why) return toasts.show(why, 'warn');
        draft = { ...RECOMMENDED_SETUP };
        sheet.close();
        onDone();
      },
    },
    '開缸',
  );
  return h('div.setup-panel', {}, ...sections, total, refusal ? h('p.dead', {}, refusal) : '', h('div.row', {}, recommend, confirm));
}
