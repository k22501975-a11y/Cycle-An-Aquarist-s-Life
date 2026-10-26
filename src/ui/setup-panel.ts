import { applySetup, economy, RECOMMENDED_SETUP, setupCards, setupCost, setupRefusal, withTank, type SetupCategory, type SetupChoice, type SetupDraft } from '../sim';
import { h } from './dom';
import type { PanelContext } from './panels';
import { priceTag } from './shop-cards';
import { cardGrid, shopCard } from './card-kit';

/**
 * 挑設備（F1-a；polish-to-9.md §8.1 起在開缸的「裝上設備」那一步才打開）：最上面是推薦組合一鍵裝好，
 * 下面每一類一排設備卡，點卡片選它；底下是總價、剩下的錢、「推薦組合」和「裝上設備」。
 * 卡片資料來自 setupCards()，美術與 UI 之後可以換成正式版面（F1-b 的演出接在「開缸」之後）。
 */

/** 玩家在開缸畫面上的選擇（關掉面板再打開還在）。一開始什麼都沒選，要自己挑或按「推薦組合」。 */
let draft: SetupDraft = {};

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
    h('span', {}, `　剩 ${(coins - cost).toLocaleString('zh-TW')} 元買魚和水草`),
  );
  const install = (choice: SetupDraft) => {
    const why = game.act((s) => applySetup(s, choice));
    if (why) return toasts.show(why, 'warn');
    draft = {};
    sheet.close();
    onDone();
  };
  const recommend = h('button.btn', { onclick: () => ((draft = { ...RECOMMENDED_SETUP }), sheet.refresh()) }, '推薦組合');
  const confirm = h('button.btn.primary', { disabled: !!refusal, onclick: () => install(draft) }, '裝上設備');
  // 推薦組合排第一（polish-to-9.md §8.1）：一下就裝好；想自己挑的往下看每一類
  const quick = h(
    'section.setup-quick',
    {},
    cardGrid(
      shopCard({
        art: 'gear/tank-empty.webp',
        name: '推薦組合',
        price: setupCost(RECOMMENDED_SETUP),
        badge: '推薦',
        chips: ['新手最好上手', '照阿德的建議一次配好'],
        actions: [h('button.btn.small.primary', { disabled: !!setupRefusal(game.tanks[0], RECOMMENDED_SETUP), onclick: () => install({ ...RECOMMENDED_SETUP }) }, '用這組裝上')],
      }),
    ),
    h('h3', {}, '或自己挑'),
  );
  return h('div.setup-panel', {}, quick, ...sections, total, refusal ? h('p.dead', {}, refusal) : '', h('div.row', {}, recommend, confirm));
}
