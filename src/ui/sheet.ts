import { h } from './dom';

/**
 * 從底部滑出的面板（手機單手操作）。同時只開一個。
 * render 會在遊戲狀態變化時重新呼叫，讓數值保持最新。
 */
export class Sheet {
  private readonly backdrop = h('div.sheet-backdrop', { onclick: () => this.close() });
  private readonly panel = h('div.sheet');
  private readonly title = h('h2.sheet-title');
  private readonly body = h('div.sheet-body');
  private render: (() => Node) | null = null;
  /** 會隨遊戲時間變化的面板（測試劑、觀察魚）才定時重繪；有輸入框的面板不重繪，以免打斷操作。 */
  private live = false;
  onClose: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const closeBtn = h('button.sheet-close', { onclick: () => this.close(), 'aria-label': '關閉' }, '✕');
    this.panel.append(h('div.sheet-head', {}, this.title, closeBtn), this.body);
    host.append(this.backdrop, this.panel);
  }

  get isLive(): boolean {
    return this.render !== null && this.live;
  }

  open(title: string, render: () => Node, options: { live?: boolean } = {}): void {
    this.title.textContent = title;
    this.render = render;
    this.live = options.live ?? false;
    this.refresh();
    this.backdrop.classList.add('open');
    this.panel.classList.add('open');
  }

  refresh(): void {
    if (!this.render) return;
    this.body.replaceChildren(this.render());
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

  show(text: string, tone: 'bad' | 'warn' | 'info' = 'info'): void {
    const el = h(`div.toast.${tone}`, {}, text);
    this.host.append(el);
    setTimeout(() => el.classList.add('fade'), 4500);
    setTimeout(() => el.remove(), 5200);
    while (this.host.children.length > 4) this.host.firstElementChild?.remove();
  }
}
