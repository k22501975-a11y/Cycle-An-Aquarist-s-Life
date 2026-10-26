import { artImg, ownerImg, type ArtIcon } from './art-icons';
import { h } from './dom';
import { pregnancyBadge, pregnancyStage } from './pregnancy-badge';
import { ART, type CardSpec, priceTag } from './shop-cards';

// 商店圖卡、分頁、建議框：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
export function shopCard(c: CardSpec): HTMLElement {
  const pic = h('div.card-pic');
  const stage = c.pregnancy !== undefined ? pregnancyStage(c.pregnancy) : null;
  // 肚子圓了、快生了的母魚換成大肚子的圖（同尾色），跟徽章對得上
  const art = c.art && (stage === 'round' || stage === 'due') ? c.art.replace('-base-', '-pregnant-') : c.art;
  if (art) {
    const img = h('img', { src: ART + art, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    pic.append(img);
  } else if (c.icon) pic.append(artImg(c.icon, 'card-icon'));
  if (c.badge) pic.append(h('span.card-badge', {}, c.badge));
  if (stage) pic.append(pregnancyBadge(stage));
  return h(
    `div.shop-card${c.cls ?? ''}`,
    {},
    pic,
    h(
      'div.card-body',
      {},
      h('b.card-name', {}, c.name),
      c.price !== null ? priceTag(c.price, c.unit) : '',
      c.chips?.length ? h('div.card-chips', {}, ...c.chips.map((t) => h('span', {}, t))) : '',
      c.note ? h('p.card-note', {}, c.note) : '',
      h('div.card-actions', {}, ...c.actions),
    ),
  );
}

/** 有圖的分頁籤。 */
export function iconTabs<T extends string>(tabs: Array<{ id: T; label: string; art?: string; icon?: ArtIcon }>, active: T, onPick: (id: T) => void): HTMLElement {
  return h(
    'div.icon-tabs',
    {},
    ...tabs.map((t) => {
      const pic = t.art ? h('img', { src: ART + t.art, alt: '', draggable: 'false' }) : t.icon ? artImg(t.icon, 'tab-icon') : '';
      return h(`button.icon-tab${t.id === active ? '.active' : ''}`, { onclick: () => onPick(t.id) }, h('span.tab-pic', {}, pic), h('span', {}, t.label));
    }),
  );
}

export function cardGrid(...cards: Node[]): HTMLElement {
  return h('div.card-grid', {}, ...cards);
}

/** 阿德老闆的建議：預設收起來，點開才看長說明。 */
export function advice(lines: Array<string | null | undefined | false>, open = false): HTMLElement {
  const items = lines.filter((l): l is string => !!l);
  const d = h(
    'details.advice',
    {},
    h('summary', {}, ownerImg('advice-avatar'), h('span', {}, '阿德老闆的建議'), h('small', {}, `${items.length} 則`)),
    h('ul', {}, ...items.map((t) => h('li', {}, t))),
  );
  if (open) d.setAttribute('open', '');
  return d;
}
