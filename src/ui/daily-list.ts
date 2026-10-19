import type { DailyState, DailyTaskId } from '../sim';
import { h } from './dom';

/**
 * 今日小事清單（mvp.md §4.4.2，#188）：主畫面和早上報告卡都放一張，3 項可以點、做完打勾，
 * 點了直接帶到該做的地方（畫面決定去哪）。正式的樣子由美術與 UI 再做。
 */

/** 清單上的短句（DAILY_TEXT 是完整說明，放提示用）。 */
export const DAILY_SHORT: Record<DailyTaskId, string> = {
  test: '測一次水',
  feed: '餵一次飼料',
  water: '換一次水',
  trim: '修剪長太長的水草',
  snail: '點一下缸裡的螺',
  observe: '點一尾魚看看',
  scape: '移動一塊造景',
};

export function dailyList(d: DailyState, go: (id: DailyTaskId) => void, chest?: () => void): HTMLElement {
  const done = d.tasks.filter((t) => t.done).length;
  return h(
    'div.daily-list',
    {},
    h('div.daily-head', {}, h('b', {}, '今天的小事'), h('span.daily-count', {}, d.claimed ? '已領寶箱' : `${done}/${d.tasks.length}`)),
    ...d.tasks.map((t) =>
      h(
        `button.daily-item${t.done ? '.done' : ''}`,
        { type: 'button', 'aria-pressed': String(t.done), onclick: () => go(t.id) },
        h('span.daily-check', { 'aria-hidden': 'true' }, t.done ? '✓' : ''),
        h('span', {}, DAILY_SHORT[t.id]),
      ),
    ),
    chest && !d.claimed && d.tasks.length > 0 && done === d.tasks.length ? h('button.btn.small.primary.daily-chest', { type: 'button', onclick: chest }, '開寶箱') : null,
  );
}
