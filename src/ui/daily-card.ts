import { DAILY_TEXT, type DailyState, type DailyTaskId } from '../sim';
import { artUrl, type ArtIcon } from './art-icons';
import { h } from './dom';

/**
 * 每日 3 件小事（F3）的畫面（#185）：左上角常駐一張小卡，三件事各一個圖示，做完打勾；
 * 三件都做完卡片發光，按寶箱領魚幣。早上報告卡也列出今天的三件。
 * 題目和判定在 sim/daily.ts，這裡只負責畫。
 */

/** 每件事的圖示（找螺用螺的插畫）。 */
const DAILY_ART: Record<DailyTaskId, string> = {
  test: artUrl('testkit'),
  feed: artUrl('feed'),
  water: artUrl('waterchange'),
  trim: artUrl('trim'),
  snail: `${import.meta.env.BASE_URL}art/snail/snail-bladder.webp`,
  observe: artUrl('codex' satisfies ArtIcon),
  scape: artUrl('scape'),
};

/** 小卡上的短字（完整說明放 title 和早上報告卡）。 */
export const DAILY_SHORT: Record<DailyTaskId, string> = {
  test: '測一次水',
  feed: '餵一次飼料',
  water: '換一次水',
  trim: '修剪水草',
  snail: '找到螺點一下',
  observe: '點一尾魚看看',
  scape: '擺塊石頭',
};

export function dailyArt(id: DailyTaskId): string {
  return DAILY_ART[id];
}

/** 做完一件時的通知：還差哪幾件寫清楚。 */
export function dailyDoneText(d: DailyState, id: DailyTaskId): string {
  const done = d.tasks.filter((t) => t.done).length;
  const left = d.tasks.filter((t) => !t.done).map((t) => `「${DAILY_SHORT[t.id]}」`);
  const head = `✓ ${DAILY_TEXT[id]}（今天的小事 ${done}/${d.tasks.length}）`;
  return left.length ? `${head}，還差${left.join('、')}` : `${head}，打開左上角的寶箱領獎勵！`;
}

export interface DailyCardDeps {
  /** 點了某一件：帶去做（打開餵食面板、測水…）。 */
  go: (id: DailyTaskId) => void;
  /** 三件都做完：開寶箱。 */
  claim: () => void;
}

/** 左上角的小卡；d 是 null（還沒開缸、沒有題目）就不顯示。 */
export function dailyCard(d: DailyState | null, claimable: boolean, deps: DailyCardDeps): HTMLElement | null {
  if (!d || d.tasks.length === 0) return null;
  const done = d.tasks.filter((t) => t.done).length;
  const all = done === d.tasks.length;
  if (all && d.claimed) return null;
  const row = (id: DailyTaskId, ok: boolean) =>
    h(
      `button.daily-task${ok ? '.done' : ''}`,
      { type: 'button', title: DAILY_TEXT[id], disabled: ok, onclick: () => deps.go(id) },
      h('img', { src: DAILY_ART[id], alt: '', draggable: 'false' }),
      h('span', {}, DAILY_SHORT[id]),
      h('i.daily-check', { 'aria-hidden': 'true' }),
    );
  return h(
    `div.daily.glass${all ? '.ready' : ''}`,
    {},
    h('div.daily-head', {}, h('b', {}, '今天的小事'), h('span.daily-dots', { 'aria-label': `${done}/${d.tasks.length}` }, ...d.tasks.map((t) => h(`i${t.done ? '.on' : ''}`)))),
    ...d.tasks.map((t) => row(t.id, t.done)),
    all && claimable ? h('button.btn.primary.daily-chest', { type: 'button', onclick: () => deps.claim() }, h('span.daily-chest-icon', { 'aria-hidden': 'true' }), '開寶箱') : null,
  );
}
