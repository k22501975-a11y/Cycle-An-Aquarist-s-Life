import { artUrl, ownerImg, type ArtIcon } from './art-icons';
import { ownerMood } from './owner-mood';
import { h } from './dom';
import { keeperRibbon } from './keeper-ribbon';
import { choiceVisual, type FishLookup } from './choice-card';
import { lookalikeVisual } from './lookalike-card';
import { choiceFollowUp, DECISION_LINE, isBadNews, isPinned, lineGroup, slimReport, type Milestone, type MorningReport, type Reveal, type ReportItem, type ReportKind } from './morning-report';
import type { ChoiceCard } from '../sim/choices';

/**
 * 「過一晚」醒來的早上報告卡（first-10-minutes.md F2）：阿德老闆一句話、一條一條的圖卡，
 * 點一條就帶去處理（撈死魚、餵食、看那條魚…）。報告的內容在 morning-report.ts，這裡只負責畫面。
 */

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
  shop_fish: 'shop',
  insulate: 'gear',
  heater_credit: 'shop',
  move_warm: 'net',
  buy_heater: 'shop',
  move_fry: 'net',
  cycle_tank: 'gear',
  buy_tank: 'shop',
  buy_big: 'shop',
  add_air: 'gear',
  shop_plants: 'shop',
  nursery_soon: 'net',
  clear_box: 'net',
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
  shop_fish: '去買魚',
  insulate: '保溫',
  heater_credit: '先賒一支',
  move_warm: '搬魚',
  buy_heater: '買一支',
  move_fry: '搬小魚',
  cycle_tank: '養新缸',
  buy_tank: '買缸',
  buy_big: '換大缸',
  add_air: '加打氣',
  shop_plants: '種水草',
  nursery_soon: '放進盒子',
  clear_box: '搬小魚',
};

/** 早上報告每行的三類（daily-loop.md §2）：要處理的壞消息、目標的進度、好消息。 */
export type ReportGroup = 'bad' | 'goal' | 'good';

/** 三類的小圖示：紅寶石驚嘆號、金色星星、綠色葉子，和選育卡的寶石同一套畫法。 */
const GROUP_SVG: Record<ReportGroup, string> = {
  bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="rg-bad" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#ffd2c4"/><stop offset=".45" stop-color="#ff6b5e"/><stop offset="1" stop-color="#9c2230"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#rg-bad)" stroke="#e3bd6d" stroke-width="1.2"/><rect x="10.6" y="5.6" width="2.8" height="8.4" rx="1.4" fill="#fff6ea"/><circle cx="12" cy="17.4" r="1.6" fill="#fff6ea"/></svg>',
  goal: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="rg-goal" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="#e3bd6d"/><stop offset="1" stop-color="#8a6224"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#rg-goal)" stroke="#fff4cf" stroke-opacity=".8" stroke-width="1.2"/><path d="M12 5.2l1.95 4.3 4.65.5-3.5 3.15 1 4.6L12 15.4l-4.1 2.35 1-4.6-3.5-3.15 4.65-.5z" fill="#fff8de" stroke="#8a6224" stroke-width=".6" stroke-linejoin="round"/></svg>',
  good: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="rg-good" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#e2ffe9"/><stop offset=".5" stop-color="#6fcf97"/><stop offset="1" stop-color="#1f6b4a"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#rg-good)" stroke="#e3bd6d" stroke-width="1.2"/><path d="M7 16.5c0-5.5 4-9 10-9.5-.3 6-3.8 10-9.2 10z" fill="#f2fff4"/><path d="M7.4 16.6c2.2-2.6 4.3-4.4 7.2-6.1" stroke="#2f8a5f" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>',
};

const GROUP_LABEL: Record<ReportGroup, string> = { bad: '要處理', goal: '目標進度', good: '好消息' };

let glyphSeq = 0;

/** 一類的小圖示（每個用自己的漸層 id，同 keeper-ribbon 的做法）。 */
export function groupGlyph(group: ReportGroup, cls = 'morning-glyph'): HTMLElement {
  const el = h(`span.${cls}.${group}`, { title: GROUP_LABEL[group] });
  const n = ++glyphSeq;
  el.innerHTML = GROUP_SVG[group].replace(/rg-(bad|goal|good)/g, `rg-$1-${n}`);
  return el;
}

/** 把字切成一段一段：數字（含 %）標 num，畫面用粗體；魚的編號（#12）不算。 */
export function numberParts(text: string): Array<{ text: string; num: boolean }> {
  const out: Array<{ text: string; num: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(/(?<![#\d])\d+(?:[.,]\d+)*%?/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), num: false });
    out.push({ text: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), num: false });
  return out;
}

function boldNumbers(text: string): Array<string | HTMLElement> {
  return numberParts(text).map((p) => (p.num ? h('b.morning-num', {}, p.text) : p.text));
}

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
  /** 今天的小事（daily-loop.md §2）：收成右上角的圖示加 0/3，點了才展開，點一件就關掉報告卡帶去做。 */
  daily?: { tasks: Array<{ id: string; art: string; text: string; done: boolean }>; go: (id: string) => void };
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

/** 回音的小圖示：一圈一圈的漣漪（你丟下的選擇，現在傳回來了）。 */
const ECHO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.4 4.6a10.4 10.4 0 0 0 0 14.8M19.6 4.6a10.4 10.4 0 0 1 0 14.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/></svg>';

/** 選擇的回音（polish-to-9.md §10.0）：那行上面一個小標「你選了：躲草」，下面是結果。 */
export function echoTag(choice: string): HTMLElement {
  const icon = h('i.morning-echo-icon');
  icon.innerHTML = ECHO_SVG;
  return h('span.morning-echo', {}, icon, '你選了：', h('b', {}, choice));
}

/**
 * 死亡那條的「下次：…」先收起來，點「怎麼避免」才展開（報告卡一眼看得完，想知道再看）。
 * 展開那一下不算點整條（整條是帶去處理）。
 */
function reportText(text: string): HTMLElement {
  const at = text.indexOf('下次：');
  if (at < 0) return h('span.morning-text', {}, ...boldNumbers(text));
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
  return h('span.morning-text', {}, ...boldNumbers(text.slice(0, at).trimEnd()), ' ', more, avoid);
}

export function morningCard(report: MorningReport, deps: MorningCardDeps, close: () => void): HTMLElement {
  // 選擇卡：不是整條一個按鈕，選項各自一個按鈕；選完換成「選好了」
  // 選擇卡先收成一行「有一件事要你決定 ›」（daily-loop.md §2），點了才在原地展開
  const choiceRow = (item: ReportItem) => {
    const box = h(`div.morning-item.${item.tone}.choice-item.closed`, {});
    const open = () => {
      box.classList.remove('closed');
      box.replaceChildren();
      fillChoice(item, box);
      box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    };
    box.append(
      h(
        'button.morning-decide',
        { type: 'button', onclick: open },
        groupGlyph('goal'),
        h('span.morning-decide-text', {}, h('b', {}, DECISION_LINE), h('small', {}, item.text)),
        h('span.morning-go', {}, '›'),
      ),
    );
    return box;
  };
  const fillChoice = (item: ReportItem, box: HTMLElement) => {
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
  // 開獎倒數（polish-to-9.md §12.1）：大數字＋懷著夢想窩那尾母魚的肚子特寫（照片放大、對準胎斑）
  // 標題「開獎倒數 n 天」畫面自己寫；text 是同一句就不重複，另外寫了話（例如肚子的樣子）放在下面
  const countdownRow = (item: ReportItem, c: NonNullable<ReportItem['countdown']>) => {
    const photo = deps.picture?.(item);
    const img = photo ? h('img', { src: photo, alt: '', draggable: 'false' }) : null;
    img?.addEventListener('error', () => img.remove());
    return h(
      'button.morning-item.good.countdown-item',
      { type: 'button', disabled: !item.action, onclick: item.action ? () => (close(), deps.go(item)) : undefined },
      h('span.cd-close', {}, img),
      h('span.morning-body', {}, h('span.cd-title', {}, '開獎倒數 ', h('b.cd-num', {}, String(c.days)), ' 天'), item.text && !item.text.startsWith('開獎倒數') ? reportText(item.text) : null),
      item.action ? h('span.morning-go', {}, ACTION_LABEL[item.action], ' ›') : null,
    );
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
    if (item.countdown) return countdownRow(item, item.countdown);
    if (item.milestone) return milestoneRow(item, item.milestone);
    if (item.lineDone) return lineDoneRow(item, item.lineDone);
    if (item.kind === 'breeding') return h(`div.morning-item.${item.tone}.breeding-item`, {}, h('div.bc-line', {}, keeperRibbon('bc-line-ribbon'), h('span.bc-line-text', {}, item.text)));
    // 每行前面一個三類的小圖示；有那條魚、那株草的照片就放照片，圖示掛在照片角落
    const group = lineGroup(item);
    // 半夜的危機照要去處理的事放工具圖（撈網、測試劑）
    const photo = deps.picture?.(item) ?? (item.kind === 'crisis' && item.action ? artUrl(ACTION_ICON[item.action]) : null);
    const img = photo ? h('img', { src: photo, alt: '', draggable: 'false' }) : null;
    img?.addEventListener('error', () => img.remove());
    const go = item.action
      ? () => {
          close();
          deps.go(item);
        }
      : undefined;
    return h(
      `button.morning-item.${item.tone}.g-${group}`,
      { type: 'button', disabled: !go, onclick: go },
      h(`span.morning-pic${img ? '' : '.glyph-only'}`, {}, img, groupGlyph(group, img ? 'morning-glyph.corner' : 'morning-glyph'), item.count && item.count > 1 ? h('b.morning-count', {}, `×${item.count}`) : null),
      // 長得像誰（G2）：文字下面多爸媽和小魚並排的比較圖
      // 特徵跟誰的已經畫成小標，文字只留到冒號前（「小魚看得出像誰了！長大後比較像爸爸」）
      item.lookalike
        ? h('span.morning-body', {}, reportText(item.text.includes('：') ? item.text.slice(0, item.text.lastIndexOf('：')) : item.text), lookalikeVisual(item.lookalike))
        : item.echo
          ? h('span.morning-body.echo', {}, echoTag(item.echo), reportText(item.text))
          : reportText(item.text),
      item.action ? h('span.morning-go', {}, item.goLabel ? `· ${item.goLabel}` : ACTION_LABEL[item.action], ' ›') : null,
    );
  };
  // 最多 3 行加一行「有一件事要你決定 ›」（daily-loop.md §2）：點了才換成選擇卡；取名那天排第一行
  const slim = slimReport(report);
  const urgent = slim.lines.filter((i) => isPinned(i) || i.kind === 'reveal' || !!i.countdown);
  const lines = slim.decision
    ? slim.decisionFirst
      ? [...urgent.map(row), choiceRow(slim.decision), ...slim.lines.filter((i) => !urgent.includes(i)).map(row)]
      : [...slim.lines.map(row), choiceRow(slim.decision)]
    : slim.lines.map(row);
  // 今天的小事（daily-loop.md §2）：不在報告裡列，收成右上角的一個圖示加 0/3，點了才展開
  const daily = deps.daily && deps.daily.tasks.length > 0 ? deps.daily : null;
  const dailyList = daily
    ? h(
        'div.morning-daily',
        { hidden: true },
        h('b.morning-daily-title', {}, '今天的小事'),
        h(
          'div.morning-daily-list',
          {},
          ...daily.tasks.map((t) =>
            h(
              `button.morning-daily-task${t.done ? '.done' : ''}`,
              {
                type: 'button',
                disabled: t.done,
                onclick: () => {
                  close();
                  daily.go(t.id);
                },
              },
              h('img', { src: t.art, alt: '', draggable: 'false' }),
              h('span', {}, t.text),
              t.done ? h('i.morning-daily-check', { 'aria-hidden': 'true' }, '✓') : null,
            ),
          ),
        ),
      )
    : null;
  const doneCount = daily ? daily.tasks.filter((t) => t.done).length : 0;
  const dailyBtn = daily
    ? h(
        `button.morning-daily-btn${doneCount === daily.tasks.length ? '.all' : ''}`,
        {
          type: 'button',
          'aria-expanded': 'false',
          'aria-label': `今天的小事，做完 ${doneCount} 件，共 ${daily.tasks.length} 件`,
          onclick: () => {
            dailyList!.hidden = !dailyList!.hidden;
            dailyBtn!.setAttribute('aria-expanded', String(!dailyList!.hidden));
            dailyBtn!.classList.toggle('open', !dailyList!.hidden);
          },
        },
        h('span.daily-chest-icon', { 'aria-hidden': 'true' }),
        h('b', {}, `${doneCount}/${daily.tasks.length}`),
      )
    : null;
  return h(
    `div.morning.glass${report.stopped ? '.stopped' : ''}`,
    { role: 'dialog', 'aria-label': report.title },
    h('div.morning-sky', { 'aria-hidden': 'true' }, h('span.morning-sun')),
    dailyBtn,
    h('b.morning-title', {}, report.title),
    h('div.owner-say', {}, ownerImg('owner-say-avatar', ownerMood(morningLine(report))), h('span', {}, morningLine(report))),
    dailyList,
    h('div.morning-list', {}, ...lines),
    h('button.btn.primary.morning-start', { type: 'button', onclick: close }, report.stopped ? '知道了' : '開始新的一天'),
  );
}
