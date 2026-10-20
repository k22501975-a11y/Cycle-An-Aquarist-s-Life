import { ownerImg } from './art-icons';
import { h } from './dom';
import { ownerMood } from './owner-mood';
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

/**
 * 老闆一次只說一件事（polish-to-9.md G9）：對話框排隊，前一個按掉才出下一個；
 * 新手引導的對話框（guide.ts）或慶祝卡開著時也先等（blocker），收起來後 kickOwnerQueue() 再接著出。
 */
const queue: Array<{ text: string; show: () => void; urgent: boolean }> = [];
let openText: string | null = null;
let blocker: () => boolean = () => false;
const closedListeners: Array<() => void> = [];
const openedListeners: Array<() => void> = [];

/** 別的對話框開著時不要出（main.ts 接上新手引導和慶祝卡）。 */
export function setOwnerBlocker(fn: () => boolean): void {
  blocker = fn;
}

/** 老闆的問句或提醒正開著。 */
export function ownerAskOpen(): boolean {
  return openText !== null;
}

/** 問句收起來時通知（新手引導排在後面的話這時再出）。 */
export function onOwnerAskClosed(fn: () => void): void {
  closedListeners.push(fn);
}

/** 問句跳出來時通知（新手引導的對話框先收起來讓位）。 */
export function onOwnerAskOpened(fn: () => void): void {
  openedListeners.push(fn);
}

/** 輪到下一個：沒有對話框開著、也沒被擋住才出。 */
export function kickOwnerQueue(): void {
  if (openText !== null) return;
  // 玩家自己按出來的（買東西前的確認、「為什麼？」）不用等別的對話框
  const next = queue[0]?.urgent || !blocker() ? queue.shift() : undefined;
  next?.show();
}

/**
 * 疊一個老闆對話框；按任何一顆按鈕就收起來並回傳那顆的值。同一句話已經在排或正開著就不重複。
 * urgent：玩家剛按的（確認、問原因），排到最前面、不等新手引導或慶祝卡。
 */
function bubble<T>(text: string, buttons: Array<{ label: string; value: T; primary?: boolean }>, host: HTMLElement, urgent = false): Promise<T> {
  // 老闆的話可能帶著「阿德老闆：」開頭（模擬那邊寫的），對話框已經有名字了就去掉
  const body = text.replace(new RegExp(`^${OWNER_NAME}[：:]\\s*`), '');
  return new Promise((resolve) => {
    const fallback = buttons.find((b) => b.primary) ?? buttons[buttons.length - 1];
    if (openText === body || queue.some((q) => q.text === body)) {
      resolve(fallback.value);
      return;
    }
    const show = () => {
      const el = h('div.owner.glass.open.owner-ask', { role: 'dialog', 'aria-label': OWNER_NAME });
      const answer = (value: T) => {
        el.remove();
        openText = null;
        resolve(value);
        closedListeners.forEach((fn) => fn());
        kickOwnerQueue();
      };
      el.append(
        h('div.owner-avatar.has-art', {}, ownerImg('owner-art', ownerMood(body))),
        h(
          'div.owner-body',
          {},
          h('div.owner-name', {}, OWNER_NAME),
          h('p.owner-text', {}, body),
          h('div.owner-actions', {}, ...buttons.map((b) => h(`button.btn.small${b.primary ? '.primary' : ''}`, { onclick: () => answer(b.value) }, b.label))),
        ),
      );
      host.append(el);
      openText = body;
      openedListeners.forEach((fn) => fn());
    };
    if (urgent) queue.unshift({ text: body, show, urgent });
    else queue.push({ text: body, show, urgent });
    kickOwnerQueue();
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
    true,
  );
}

/** 老闆說一句、只有一顆按鈕（例如解釋魚為什麼不舒服）。urgent：玩家按「為什麼？」問的，馬上回答。 */
export function ownerSay(text: string, label = '知道了', host: HTMLElement = document.body, urgent = false): Promise<void> {
  return bubble(text, [{ label, value: undefined, primary: true }], host, urgent);
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
