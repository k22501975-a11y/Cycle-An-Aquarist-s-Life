import { ownerImg } from './art-icons';
import { h } from './dom';
import { OWNER_NAME } from './tutorial';

/**
 * 阿德老闆問一句或說一句（取代瀏覽器的 confirm）：有頭像，跟新手引導的對話框同一個樣子。
 * 系統的 confirm 是灰色方框、一大段字，跟遊戲畫面不搭。
 */
export interface OwnerAsk {
  text: string;
  /** 照做（回傳 true）的按鈕。 */
  yes: string;
  /** 打消念頭（回傳 false）的按鈕；這是老闆建議的，所以是主要按鈕。 */
  no: string;
}

/** 開著的對話框：收起它並回傳主要按鈕的值（老闆建議的那個）。 */
let dismissOpen: (() => void) | null = null;

/**
 * 疊一個老闆對話框；按任何一顆按鈕就收起來並回傳那顆的值。
 * 舊的還開著又來一個新的，舊的當作按了主要按鈕（問句就是「不要」），等它的人不會一直卡著。
 */
function bubble<T>(text: string, buttons: Array<{ label: string; value: T; primary?: boolean }>, host: HTMLElement): Promise<T> {
  dismissOpen?.();
  // 老闆的話可能帶著「阿德老闆：」開頭（模擬那邊寫的），對話框已經有名字了就去掉
  const body = text.replace(new RegExp(`^${OWNER_NAME}[：:]\\s*`), '');
  return new Promise((resolve) => {
    const el = h('div.owner.glass.open.owner-ask', { role: 'dialog', 'aria-label': OWNER_NAME });
    const answer = (value: T) => {
      el.remove();
      if (dismissOpen === dismiss) dismissOpen = null;
      resolve(value);
    };
    const fallback = buttons.find((b) => b.primary) ?? buttons[buttons.length - 1];
    const dismiss = () => answer(fallback.value);
    el.append(
      h('div.owner-avatar.has-art', {}, ownerImg('owner-art')),
      h(
        'div.owner-body',
        {},
        h('div.owner-name', {}, OWNER_NAME),
        h('p.owner-text', {}, body),
        h('div.owner-actions', {}, ...buttons.map((b) => h(`button.btn.small${b.primary ? '.primary' : ''}`, { onclick: () => answer(b.value) }, b.label))),
      ),
    );
    host.append(el);
    dismissOpen = dismiss;
  });
}

export function ownerAsk(ask: OwnerAsk, host: HTMLElement = document.body): Promise<boolean> {
  return bubble(
    ask.text,
    [
      { label: ask.yes, value: true },
      { label: ask.no, value: false, primary: true },
    ],
    host,
  );
}

/** 老闆說一句、只有一顆按鈕（例如解釋魚為什麼不舒服）。 */
export function ownerSay(text: string, label = '知道了', host: HTMLElement = document.body): Promise<void> {
  return bubble(text, [{ label, value: undefined, primary: true }], host);
}

/** 老闆帶玩家做一件事：照做是主要按鈕（例如送了育幼盒、帶你把母魚放進去）。回傳有沒有照做。 */
export function ownerGuide(text: string, yes: string, later = '等一下', host: HTMLElement = document.body): Promise<boolean> {
  return bubble(
    text,
    [
      { label: later, value: false },
      { label: yes, value: true, primary: true },
    ],
    host,
  );
}
