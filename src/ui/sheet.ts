import { artImg, sheetArt } from './art-icons';
import { h } from './dom';

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
    this.title.textContent = title;
    const art = sheetArt(title);
    this.icon.replaceChildren(...(art ? [artImg(art, 'sheet-art')] : []));
    this.icon.hidden = !art;
    this.render = render;
    this.live = options.live ?? false;
    this.refresh();
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

export class Toasts {
  private readonly host = h('div.toasts');

  constructor(parent: HTMLElement) {
    parent.append(this.host);
  }

  /** action：通知上的按鈕（例如「復原」），有按鈕的通知停留久一點。 */
  show(text: string, tone: 'bad' | 'warn' | 'info' = 'info', action?: { label: string; run: () => void }): void {
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
    const stay = action ? 8000 : 4500;
    setTimeout(() => el.classList.add('fade'), stay);
    setTimeout(() => el.remove(), stay + 700);
    while (this.host.children.length > 4) this.host.firstElementChild?.remove();
  }
}
