import { artImg, sheetArt } from './art-icons';
import { h } from './dom';
import { NOTIFY_PLAYER_WINDOW_MS, NotifyGate } from './notify-gate';

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
    this.refresh();
    if (fresh) this.panel.scrollTop = this.body.scrollTop = 0;
    this.backdrop.classList.add('open');
    this.panel.classList.add('open');
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

type ToastArgs = [text: string, tone?: 'bad' | 'warn' | 'info', action?: { label: string; run: () => void }];

export class Toasts {
  private readonly host = h('div.toasts');
  /** hold() 期間的通知先排隊，release() 再一起跳（開缸演出時只留演出的說明，#199）。 */
  private held: ToastArgs[] | null = null;
  /** 擋重複、純告知限頻（YenWel：通知太亂）。 */
  private readonly gate = new NotifyGate();

  /** 玩家最近一次按東西的時間：之後馬上跳的通知是對那一下的回應。 */
  private lastInput = -Infinity;

  constructor(parent: HTMLElement) {
    parent.append(this.host);
    const note = () => (this.lastInput = performance.now());
    document.addEventListener('pointerdown', note, { capture: true });
    document.addEventListener('keydown', note, { capture: true });
  }

  /** action：通知上的按鈕（例如「復原」），有按鈕的通知停留久一點。 */
  show(...args: ToastArgs): void {
    if (this.held) this.held.push(args);
    else this.offer(args, performance.now() - this.lastInput < NOTIFY_PLAYER_WINDOW_MS);
  }

  private offer(args: ToastArgs, byPlayer: boolean): void {
    if (this.gate.accept(args[0], args[1] ?? 'info', !!args[2], performance.now(), byPlayer)) this.showNow(...args);
  }

  /** 先把通知排隊（例如演出時）。保險：演出萬一被中斷沒 release，safetyMs（預設 45 秒）後自己放出來；給 0 表示一定會 release，不設保險。 */
  hold(safetyMs = 45_000): void {
    if (this.held) return;
    this.held = [];
    const mine = this.held;
    if (safetyMs > 0) setTimeout(() => this.held === mine && this.release(), safetyMs);
  }

  /** 放出排隊的通知：同一則只跳一次，太多只留最後 3 則。 */
  release(): void {
    const queued = this.held ?? [];
    this.held = null;
    const seen = new Set<string>();
    const unique = queued.filter(([text]) => !seen.has(text) && seen.add(text));
    // 排隊的是演出期間自己冒出來的，照樣過閘門（關掉卡片那一下不算玩家要的回應）
    for (const args of unique.slice(-3)) this.offer(args, false);
  }

  /** 不管有沒有 hold，馬上跳出來（演出本身的說明）。 */
  showNow(text: string, tone: 'bad' | 'warn' | 'info' = 'info', action?: { label: string; run: () => void }): void {
    const el = h(`div.toast.${tone}`, {}, h('span', {}, text));
    if (action) {
      el.append(
        h('button.toast-action', {
          onclick: () => {
            action.run();
            el.remove();
          },
        }, action.label),
      );
    }
    this.host.append(el);
    if (action) {
      // 有「去處理」的提示要等玩家點掉或處理掉才收（U3，#166）：原本 8 秒就消失，看到時已經不見了
      el.classList.add('sticky');
      el.append(h('button.toast-close', { 'aria-label': '關閉', onclick: () => el.remove() }, '✕'));
    } else {
      setTimeout(() => el.classList.add('fade'), 4500);
      setTimeout(() => el.remove(), 5200);
    }
    // 太多就先收掉最舊的一般通知，要處理的留著
    while (this.host.children.length > 4) (this.host.querySelector('.toast:not(.sticky)') ?? this.host.firstElementChild)?.remove();
  }
}
