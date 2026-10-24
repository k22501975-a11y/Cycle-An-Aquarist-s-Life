import { artUrl, ownerImg, type ArtIcon } from './art-icons';
import { ownerMood } from './owner-mood';
import { h } from './dom';
import { keeperRibbon } from './keeper-ribbon';
import { choiceVisual, type FishLookup } from './choice-card';
import { lookalikeVisual } from './lookalike-card';
import { choiceFollowUp, DECISION_LINE, isBadNews, slimReport, type Milestone, type MorningReport, type Reveal, type ReportItem, type ReportKind } from './morning-report';
import type { ChoiceCard } from '../sim/choices';

/**
 * 「過一晚」醒來的早上報告卡（first-10-minutes.md F2）：阿德老闆一句話、一條一條的圖卡，
 * 點一條就帶去處理（撈死魚、餵食、看那條魚…）。報告的內容在 morning-report.ts，這裡只負責畫面。
 */

/** 每種事情的圖示（有魚的照片時用照片）。 */
const KIND_ICON: Record<ReportKind, ArtIcon> = {
  crisis: 'gear',
  crowd: 'net',
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
  bloom: 'bacteria',
  gear: 'gear',
  belly: 'owner',
  courtship: 'owner',
  fry_grew: 'feed',
  new_leaf: 'trim',
  rescued: 'testkit',
  lookalike: 'owner',
  choice: 'owner',
  breeding: 'owner',
  milestone: 'owner',
  reveal: 'owner',
  second_brood: 'owner',
  line: 'codex',
  observe: 'owner',
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
  shop_tank: 'shop',
  buy_feeder: 'feed',
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
  shop_tank: '去買缸',
  buy_feeder: '裝上',
};

export interface MorningCardDeps {
  /** 這一條要放的圖（魚的照片、小魚圖）；沒有就用種類的圖示。 */
  picture?: (item: ReportItem) => string | null;
  /** 點了某一條：關掉報告卡後帶去處理。 */
  go: (item: ReportItem) => void;
  /**
   * 選擇卡（C1～C5）選了一個選項：套用選擇，回傳錯誤訊息（顯示在卡上），成功回傳 null。
   * 選了要去做的（放育幼盒、買缸），報告卡關掉再帶過去；其他留在報告卡上。
   */
  choose?: (item: ReportItem, key: string, picks: number[], text?: string) => string | null;
  /** 選擇卡上只有魚的編號（C4 的母魚、C5 那尾），照編號找牠的樣子來畫。 */
  fishLook?: FishLookup;
}

/** 老闆的開場白：照最要緊的那一條說。 */
/** 好消息的早上照最要緊的那件換開頭（體驗第 14 輪：天天「有好消息！」看膩了，#258）；沒列到的用「有好消息！」。 */
const GOOD_LINE: Partial<Record<ReportKind, string>> = {
  birth: '昨晚生小魚了！',
  belly: '母魚那邊有動靜了！',
  courtship: '昨晚公魚很努力喔！',
  grown: '小魚長大了！',
  fry_grew: '小魚又長大一點了！',
  lookalike: '小魚越來越像爸媽了！',
  choice: '今天有件事要你決定！',
  breeding: '選育有進展。',
  milestone: '種魚又長大一步了！',
  reveal: '開獎了！快來看！',
  second_brood: '第二窩生了！',
  cycled: '水養好了，好消息！',
  rescued: '你救回來了！',
  fish_relaxed: '魚慢慢習慣新家了。',
};

export function morningLine(report: MorningReport): string {
  if (report.stopped) return '半夜有狀況，我先把你叫起來了。先處理最上面那件！';
  // 照昨晚有沒有好事、壞事說（企劃 tutorial-lines.md §7，#258）；壞事本來就排在前面
  const bad = report.items.some(isBadNews);
  const good = report.items.find((i) => i.tone === 'good');
  if (bad) return good ? '昨晚有點狀況，也有好消息。' : '昨晚有點狀況。';
  if (good) return GOOD_LINE[good.kind] ?? '有好消息！';
  // 氨在升、藻變多、該餵了：死亡要有預警，不能寫「安靜」
  return report.items.some((i) => i.tone === 'warn') ? '有件事要留意一下。' : '安靜的一晚。';
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
  // 選擇卡：不是整條一個按鈕，選項各自一個按鈕；選完換成「選好了」
  const choiceRow = (item: ReportItem) => {
    const box = h(`div.morning-item.${item.tone}.choice-item`, {});
    const done = (text: string) => box.replaceChildren(h('span.morning-text', {}, `${item.text} ✓ ${text}`));
    box.append(
      h('span.morning-body', {}, h('span.morning-text', {}, h('b', {}, item.text)), choiceVisual(item.choice!, (key, picks, text) => {
        if (!deps.choose) return null;
        const why = deps.choose(item, key, picks, text);
        if (why) return why;
        // C18 取名：卡上自己換成金色名牌，不收成一行
        if (key === 'name' && item.choice!.naming) return null;
        done(item.choice!.options.find((o) => o.key === key)?.label ?? '');
        const go = choiceFollowUp(item.choice!, key);
        if (go) {
          close();
          deps.go({ ...item, action: go });
        }
        return null;
      }, deps.fishLook)),
    );
    return box;
  };
  // 成長里程碑（midgame.md §5.3）：一句話＋一張圖（放大鏡看肛鰭／胎斑、顯色前後、公母配對），圖跟選育卡一起延後載入
  const milestoneRow = (item: ReportItem, m: Milestone) => {
    const fish = deps.fishLook?.(m.fishId);
    const pic = h('div.ms-slot');
    if (fish) {
      const partner = m.partnerId !== undefined ? (deps.fishLook?.(m.partnerId) ?? undefined) : undefined;
      void import('./breeding-cards').then((bc) => pic.append(bc.milestoneVisual(m.step, fish, partner, m.earlierDays))).catch(() => pic.remove());
    }
    return h(`div.morning-item.${item.tone}.milestone-item`, {}, h('span.morning-body', {}, reportText(item.text), fish ? pic : null));
  };
  // 開獎卡（midgame.md §6.1）：標題＋小魚一尾一尾亮出來＋老闆那句話
  const revealRow = (item: ReportItem, r: Reveal) => {
    const pic = h('div.rv-slot');
    void import('./breeding-cards').then((bc) => pic.append(bc.revealVisual(r.fry))).catch(() => pic.remove());
    return h(`div.morning-item.${item.tone}.reveal-item`, {}, h('span.morning-body', {}, h('b.rv-title', {}, `開獎！${r.fry.length} 尾小魚出生了`), pic, reportText(item.text)));
  };
  // 品系完成（strain-fixing.md §5）：金色名牌＋穩定度條越過「品系完成」的線，圖跟選育卡一起延後載入
  const lineDoneRow = (item: ReportItem, done: NonNullable<ReportItem['lineDone']>) => {
    const pic = h('div.ld-slot');
    void import('./breeding-cards').then((bc) => pic.append(bc.lineDoneVisual(done.name, done.stability))).catch(() => pic.remove());
    return h(`div.morning-item.${item.tone}.line-done-item`, {}, h('span.morning-body', {}, pic, reportText(item.text)));
  };
  // C9 自動照上次的那一行（midgame.md §6.5）：點了展開 C9 的選項改設定（多「每次都問我」）
  const settingRow = (item: ReportItem, card: ChoiceCard) => {
    const box = h(`div.morning-item.${item.tone}.choice-item`, {});
    const open = () =>
      box.replaceChildren(
        h(
          'span.morning-body',
          {},
          h('span.morning-text', {}, h('b', {}, card.title)),
          choiceVisual(card, (key, picks) => {
            const why = deps.choose?.(item, key, picks) ?? null;
            if (!why) box.replaceChildren(h('span.morning-text', {}, `${item.text} ✓ ${card.options.find((o) => o.key === key)?.label ?? ''}`));
            return why;
          }),
        ),
      );
    box.append(h('span.morning-body', {}, reportText(item.text), h('button.btn.small', { type: 'button', onclick: open }, '改設定 ›')));
    return box;
  };
  const row = (item: ReportItem) => {
    if (item.choice) return choiceRow(item);
    if (item.broodSetting) return settingRow(item, item.broodSetting);
    // 選育進度（midgame.md §2）：緞帶開頭的一行，不是可以點的事
    if (item.reveal) return revealRow(item, item.reveal);
    if (item.milestone) return milestoneRow(item, item.milestone);
    if (item.lineDone) return lineDoneRow(item, item.lineDone);
    if (item.kind === 'breeding') return h(`div.morning-item.${item.tone}.breeding-item`, {}, h('div.bc-line', {}, keeperRibbon('bc-line-ribbon'), h('span.bc-line-text', {}, item.text)));
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
      // 長得像誰（G2）：文字下面多爸媽和小魚並排的比較圖
      // 特徵跟誰的已經畫成小標，文字只留到冒號前（「小魚看得出像誰了！長大後比較像爸爸」）
      item.lookalike ? h('span.morning-body', {}, reportText(item.text.includes('：') ? item.text.slice(0, item.text.lastIndexOf('：')) : item.text), lookalikeVisual(item.lookalike)) : reportText(item.text),
      item.action ? h('span.morning-go', {}, item.goLabel ? `· ${item.goLabel}` : ACTION_LABEL[item.action], ' ›') : null,
    );
  };
  // 最多 3 行加一行「有一件事要你決定 ›」（daily-loop.md §2）：點了才換成選擇卡；取名那天排第一行
  const slim = slimReport(report);
  const decisionRow = (item: ReportItem) => {
    const btn = h(
      `button.morning-item.good.decision-item`,
      { type: 'button', onclick: () => btn.replaceWith(choiceRow(item)) },
      h('span.morning-pic', {}, h('img', { src: artUrl('owner'), alt: '', draggable: 'false' })),
      h('span.morning-text', {}, DECISION_LINE),
      h('span.morning-go', {}, '›'),
    );
    return btn;
  };
  const urgent = slim.lines.filter((i) => i.kind === 'crisis' || i.kind === 'reveal');
  const lines = slim.decision
    ? slim.decisionFirst
      ? [...urgent.map(row), decisionRow(slim.decision), ...slim.lines.filter((i) => !urgent.includes(i)).map(row)]
      : [...slim.lines.map(row), decisionRow(slim.decision)]
    : slim.lines.map(row);
  return h(
    `div.morning.glass${report.stopped ? '.stopped' : ''}`,
    { role: 'dialog', 'aria-label': report.title },
    h('div.morning-sky', { 'aria-hidden': 'true' }, h('span.morning-sun')),
    h('b.morning-title', {}, report.title),
    h('div.owner-say', {}, ownerImg('owner-say-avatar', ownerMood(morningLine(report))), h('span', {}, morningLine(report))),
    h('div.morning-list', {}, ...lines),
    h('button.btn.primary.morning-start', { type: 'button', onclick: close }, report.stopped ? '知道了' : '開始新的一天'),
  );
}
