import { artUrl, ownerImg, type ArtIcon } from './art-icons';
import { ownerMood } from './owner-mood';
import { h } from './dom';
import type { MorningReport, ReportItem, ReportKind } from './morning-report';

/**
 * 「過一晚」醒來的早上報告卡（first-10-minutes.md F2）：阿德老闆一句話、一條一條的圖卡，
 * 點一條就帶去處理（撈死魚、餵食、看那條魚…）。報告的內容在 morning-report.ts，這裡只負責畫面。
 */

/** 每種事情的圖示（有魚的照片時用照片）。 */
const KIND_ICON: Record<ReportKind, ArtIcon> = {
  crisis: 'gear',
  death: 'net',
  birth: 'owner',
  eaten: 'net',
  grown: 'owner',
  cycle: 'bacteria',
  cycled: 'bacteria',
  disease: 'testkit',
  equipment: 'gear',
  snails: 'net',
  algae: 'waterchange',
  plant_died: 'trim',
  hungry: 'feed',
  orders: 'orders',
  nursery: 'net',
  plant_grew: 'trim',
  fish_relaxed: 'owner',
  ammonia: 'waterchange',
  gear: 'gear',
  belly: 'owner',
  courtship: 'owner',
  fry_grew: 'feed',
  new_leaf: 'trim',
  rescued: 'testkit',
  lookalike: 'owner',
  quiet: 'owner',
};

/** 危機（半夜叫醒）照要去處理的事放圖示。 */
const ACTION_ICON: Record<NonNullable<ReportItem['action']>, ArtIcon> = {
  remove_dead: 'net',
  test_water: 'testkit',
  water_change: 'waterchange',
  feed: 'feed',
  treat: 'testkit',
  equipment: 'gear',
  fish: 'owner',
  orders: 'orders',
  snails: 'net',
  trim: 'trim',
  fry_box: 'net',
  nursery: 'net',
};

/** 點下去會做什麼（按鈕上的小字）。 */
const ACTION_LABEL: Record<NonNullable<ReportItem['action']>, string> = {
  remove_dead: '撈起來',
  test_water: '測水',
  water_change: '換水',
  feed: '餵食',
  treat: '看看',
  equipment: '檢查設備',
  fish: '看看',
  orders: '看訂單',
  snails: '處理',
  trim: '修剪',
  fry_box: '救小魚',
  nursery: '放進盒子',
};

export interface MorningCardDeps {
  /** 這一條要放的圖（魚的照片、小魚圖）；沒有就用種類的圖示。 */
  picture?: (item: ReportItem) => string | null;
  /** 點了某一條：關掉報告卡後帶去處理。 */
  go: (item: ReportItem) => void;
  /** 今天的小事（F3，#185）：早上一起列出來，點一件就關掉報告卡帶去做。 */
  daily?: { tasks: Array<{ id: string; art: string; text: string; done: boolean }>; go: (id: string) => void };
}

/** 老闆的開場白：照最要緊的那一條說。 */
export function morningLine(report: MorningReport): string {
  const top = report.items[0];
  if (report.stopped) return '半夜有狀況，我先把你叫起來了。先處理最上面那件！';
  if (!top || top.kind === 'quiet') return '一夜平安，魚都睡得很好。';
  if (top.tone === 'bad') return '昨晚出了點事，先看最上面那件。';
  if (report.items.some((i) => i.tone === 'good')) return '有好消息！看看昨晚發生了什麼。';
  return '早！昨晚的狀況幫你整理好了。';
}

/**
 * 死亡那條的「下次：…」先收起來，點「怎麼避免」才展開（報告卡一眼看得完，想知道再看）。
 * 展開那一下不算點整條（整條是帶去處理）。
 */
function reportText(text: string): HTMLElement {
  const at = text.indexOf('下次：');
  if (at < 0) return h('span.morning-text', {}, text);
  const avoid = h('span.morning-avoid', { hidden: true }, text.slice(at));
  const more = h(
    'span.morning-more',
    {
      role: 'button',
      tabindex: '0',
      'aria-expanded': 'false',
      onclick: (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        avoid.hidden = !avoid.hidden;
        more.setAttribute('aria-expanded', String(!avoid.hidden));
        more.textContent = avoid.hidden ? '怎麼避免 ▾' : '收起 ▴';
      },
    },
    '怎麼避免 ▾',
  );
  return h('span.morning-text', {}, text.slice(0, at).trimEnd(), ' ', more, avoid);
}

export function morningCard(report: MorningReport, deps: MorningCardDeps, close: () => void): HTMLElement {
  const row = (item: ReportItem) => {
    const pic = deps.picture?.(item) ?? artUrl(item.kind === 'crisis' && item.action ? ACTION_ICON[item.action] : KIND_ICON[item.kind]);
    const img = h('img', { src: pic, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    const go = item.action
      ? () => {
          close();
          deps.go(item);
        }
      : undefined;
    return h(
      `button.morning-item.${item.tone}`,
      { type: 'button', disabled: !go, onclick: go },
      h('span.morning-pic', {}, img, item.count && item.count > 1 ? h('b.morning-count', {}, `×${item.count}`) : null),
      reportText(item.text),
      item.action ? h('span.morning-go', {}, ACTION_LABEL[item.action], ' ›') : null,
    );
  };
  const items = report.items.length > 0 ? report.items : [{ kind: 'quiet', tank: 0, tone: 'good', text: '沒什麼特別的事，魚都很好' } satisfies ReportItem];
  return h(
    `div.morning.glass${report.stopped ? '.stopped' : ''}`,
    { role: 'dialog', 'aria-label': report.title },
    h('div.morning-sky', { 'aria-hidden': 'true' }, h('span.morning-sun')),
    h('b.morning-title', {}, report.title),
    h('div.owner-say', {}, ownerImg('owner-say-avatar', ownerMood(morningLine(report))), h('span', {}, morningLine(report))),
    h('div.morning-list', {}, ...items.map(row)),
    deps.daily && deps.daily.tasks.length > 0
      ? h(
          'div.morning-daily',
          {},
          h('b.morning-daily-title', {}, '今天的小事'),
          h(
            'div.morning-daily-list',
            {},
            ...deps.daily.tasks.map((t) =>
              h(
                `button.morning-daily-task${t.done ? '.done' : ''}`,
                {
                  type: 'button',
                  disabled: t.done,
                  onclick: () => {
                    close();
                    deps.daily!.go(t.id);
                  },
                },
                h('img', { src: t.art, alt: '', draggable: 'false' }),
                h('span', {}, t.text),
              ),
            ),
          ),
        )
      : null,
    h('button.btn.primary.morning-start', { type: 'button', onclick: close }, report.stopped ? '知道了' : '開始新的一天'),
  );
}
