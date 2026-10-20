import { artImg, sheetArt } from './art-icons';
import { h } from './dom';
import { NotifyGate } from './notify-gate';

/** 全螢幕的面板（YenWel：「選單最好做全螢幕？」）：商店、設定、選單內容多，蓋滿畫面、藏起後面的缸；其他面板照舊靠邊，看得到缸。 */
const FULLSCREEN = new Set(['商店', '設定', '選單']);

/**
 * 從底部滑出的面板（手機單手操作）。同時只開一個。
 * render 會在遊戲狀態變化時重新呼叫，讓數值保持最新。
 */
export class Sheet {
  private readonly backdrop = h('div.sheet-backdrop', { onclick: () => this.close() });
  private readonly panel = h('div.sheet');
  private readonly title = h('h2.sheet-title');
  private readonly icon = h('span.sheet-icon');
  private readonly body = h('div.sheet-body');
  private render: (() => Node) | null = null;
  /** 會隨遊戲時間變化的面板（測試劑、觀察魚）才定時重繪；有輸入框的面板不重繪，以免打斷操作。 */
  private live = false;
  onClose: (() => void) | null = null;
  /** 開了一個面板（main 用來收掉餵食模式）。 */
  onOpen: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const closeBtn = h('button.sheet-close', { onclick: () => this.close(), 'aria-label': '關閉' }, '✕');
    this.panel.append(h('div.sheet-head', {}, this.icon, this.title, closeBtn), this.body);
    host.append(this.backdrop, this.panel);
  }

  get isOpen(): boolean {
    return this.render !== null;
  }

  get isLive(): boolean {
    return this.render !== null && this.live;
  }

  open(title: string, render: () => Node, options: { live?: boolean } = {}): void {
    // 換成別的面板從最上面開始看，不沿用上一個面板捲到的位置（#172）；同一個面板重畫（例如商店換分頁後買東西）保留位置
    const fresh = !this.isOpen || this.title.textContent !== title;
    this.title.textContent = title;
    const art = sheetArt(title);
    this.icon.replaceChildren(...(art ? [artImg(art, 'sheet-art')] : []));
    this.icon.hidden = !art;
    this.render = render;
    this.live = options.live ?? false;
    const full = FULLSCREEN.has(title);
    this.panel.classList.toggle('full', full);
    this.backdrop.classList.toggle('full', full);
    this.refresh();
    if (fresh) this.panel.scrollTop = this.body.scrollTop = 0;
    this.backdrop.classList.add('open');
    this.panel.classList.add('open');
    if (fresh) this.onOpen?.();
  }

  /** 重畫；內容跟畫面上的一模一樣就不換，免得按鈕在按下和放開之間被換掉而點不到（#144）。 */
  refresh(): void {
    if (!this.render) return;
    const next = this.render();
    const current = this.body.firstChild;
    if (current && this.body.childNodes.length === 1 && next.isEqualNode(current)) return;
    this.body.replaceChildren(next);
  }

  close(): void {
    this.render = null;
    this.backdrop.classList.remove('open');
    this.panel.classList.remove('open');
    this.onClose?.();
  }
}

type Tone = 'bad' | 'warn' | 'info';
type ToastAction = { label: string; run: () => void };
type ToastArgs = [text: string, tone?: Tone, action?: ToastAction];

/** 通知匣的一則：同樣的字合成一則、記次數。 */
export interface Note {
  text: string;
  tone: Tone;
  action?: ToastAction;
  count: number;
  /** 最後一次發生的時間（Date.now()）。 */
  at: number;
}

/** 玩家剛按過東西（這段時間內的通知是對那一下的回應）。 */
const DIRECT_MS = 1500;
const INBOX_MAX = 40;

/**
 * 通知（YenWel：「通知太亂，文字一直跳出來」）：
 * - 畫面上同一時間最多一則，一行、前面一個圖示；新的換掉舊的，同樣的字合成「×2」。
 * - 玩家剛按的東西的回應、壞消息、要處理的（有按鈕）才跳；其他（今天的小事、畫質調整、自己發生的好事）
 *   只進通知匣，鈴鐺上的數字加一，想看再點開。
 * - 有「去處理」按鈕的要等玩家點掉或處理掉才收（U3）。
 */
export class Toasts {
  private readonly host = h('div.toasts');
  /** hold() 期間的通知先排隊，release() 再一起跳（開缸演出時只留演出的說明，#199）。 */
  private held: ToastArgs[] | null = null;
  /** 通知匣：新的在前面。 */
  readonly inbox: Note[] = [];
  /** 還沒看過的則數（鈴鐺上的數字）。 */
  unread = 0;
  /** 通知匣有變（main 更新鈴鐺）。 */
  onInbox: (() => void) | null = null;
  private lastInput = -Infinity;
  /** 擋重複、純告知限頻（#212）：被擋下的不跳，只進通知匣。 */
  private readonly gate = new NotifyGate();
  private current: { el: HTMLElement; text: string; count: number; sticky: boolean } | null = null;
  private fadeTimer = 0;
  private removeTimer = 0;

  constructor(parent: HTMLElement) {
    parent.append(this.host);
    const mark = () => (this.lastInput = performance.now());
    for (const type of ['pointerdown', 'click', 'keydown']) window.addEventListener(type, mark, { capture: true });
  }

  /** action：通知上的按鈕（例如「去處理」），要等玩家點掉或處理掉才收。 */
  show(...args: ToastArgs): void {
    if (this.held) this.held.push(args);
    else this.route(...args);
  }

  /** 先把通知排隊（例如演出時）。保險：演出萬一被中斷沒 release，safetyMs（預設 45 秒）後自己放出來；給 0 表示一定會 release，不設保險。 */
  hold(safetyMs = 45_000): void {
    if (this.held) return;
    this.held = [];
    const mine = this.held;
    if (safetyMs > 0) setTimeout(() => this.held === mine && this.release(), safetyMs);
  }

  /** 放出排隊的通知：都進通知匣，畫面上最多跳最後一則要緊的。 */
  release(): void {
    const queued = this.held ?? [];
    this.held = null;
    for (const [text, tone = 'info', action] of queued) this.record(text, tone, action, false);
    const urgent = [...queued].reverse().find(([, tone, action]) => action || tone === 'bad');
    if (urgent) this.pop(urgent[0], urgent[1] ?? 'info', urgent[2]);
  }

  /** 不管有沒有 hold，馬上跳出來（演出本身的說明），不進通知匣。 */
  showNow(text: string, tone: Tone = 'info', action?: ToastAction): void {
    this.pop(text, tone, action);
  }

  /** 只記進通知匣、不跳出來（老闆完整的話；任務卡上已經閃過短句）。 */
  log(text: string, tone: Tone = 'info'): void {
    this.record(text, tone, undefined, true);
  }

  /** 打開通知匣：都算看過了。 */
  markRead(): void {
    if (this.unread === 0) return;
    this.unread = 0;
    this.onInbox?.();
  }

  private route(text: string, tone: Tone = 'info', action?: ToastAction): void {
    const now = performance.now();
    const direct = now - this.lastInput < DIRECT_MS;
    const popNow = this.gate.accept(text, tone, !!action, now, direct) && (direct || !!action || tone === 'bad');
    this.record(text, tone, action, !popNow);
    if (popNow) this.pop(text, tone, action, direct);
  }

  private record(text: string, tone: Tone, action: ToastAction | undefined, unread: boolean): void {
    const i = this.inbox.findIndex((n) => n.text === text);
    const note = i >= 0 ? this.inbox.splice(i, 1)[0] : { text, tone, count: 0, at: 0 };
    note.count++;
    note.at = Date.now();
    note.action = action ?? note.action;
    this.inbox.unshift(note);
    this.inbox.length = Math.min(this.inbox.length, INBOX_MAX);
    if (unread) this.unread++;
    this.onInbox?.();
  }

  /** 畫面上那一格：同一句就加「×2」，不同的換掉（要處理的不會被一般通知蓋掉）。 */
  private pop(text: string, tone: Tone, action?: ToastAction, direct = false): void {
    const cur = this.current;
    if (cur && cur.el.isConnected) {
      if (cur.text === text) {
        cur.count++;
        cur.el.querySelector('.toast-count')!.textContent = `×${cur.count}`;
        cur.el.classList.remove('bump');
        void cur.el.offsetWidth;
        cur.el.classList.add('bump');
        if (!cur.sticky) this.arm(cur.el, tone);
        return;
      }
      // 正在等玩家處理的不讓自己冒出來的一般通知蓋掉（一般的已經在通知匣裡）；
      // 玩家剛按的東西的回應照樣換上來，不然會像按了沒反應（要處理的那則還在通知匣，按鈕也在）
      if (cur.sticky && !action && !direct) return;
      cur.el.remove();
    }
    const el = h(`div.toast.${tone}`, { role: 'status' }, h('i.toast-icon', { 'aria-hidden': 'true' }), h('span.toast-text', {}, text), h('b.toast-count'));
    const sticky = !!action;
    if (action) {
      el.append(
        h('button.toast-action', {
          onclick: () => {
            action.run();
            el.remove();
          },
        }, action.label),
        h('button.toast-close', { 'aria-label': '關閉', onclick: () => el.remove() }, '✕'),
      );
      el.classList.add('sticky');
    }
    this.host.replaceChildren(el);
    this.current = { el, text, count: 1, sticky };
    window.clearTimeout(this.fadeTimer);
    window.clearTimeout(this.removeTimer);
    if (!sticky) this.arm(el, tone);
  }

  /** 一般的停 4 秒；警告、壞消息要看清楚，停 6 秒。 */
  private arm(el: HTMLElement, tone: Tone): void {
    window.clearTimeout(this.fadeTimer);
    window.clearTimeout(this.removeTimer);
    el.classList.remove('fade');
    const stay = tone === 'info' ? 4000 : 6000;
    this.fadeTimer = window.setTimeout(() => el.classList.add('fade'), stay);
    this.removeTimer = window.setTimeout(() => el.remove(), stay + 600);
  }
}
