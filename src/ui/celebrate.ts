import { ownerImg } from './art-icons';
import { h } from './dom';

/**
 * 好事發生時的慶祝卡（生小魚、養水完成、第一次賣魚）：畫面中間跳出一張有插圖的卡，彩帶往下灑，幾秒後自己收起來。
 * 原本只有一行通知，生了 23 尾小魚都沒人發現。
 */
export interface CelebrateSpec {
  /** public/art 底下的圖。 */
  art: string;
  title: string;
  sub: string;
  /** 阿德老闆的一句話（有頭像）。 */
  owner?: string;
}

const ART = `${import.meta.env.BASE_URL}art/`;
const CONFETTI = ['#ffd36e', '#7ee0c3', '#ff8fa3', '#9ec9ff', '#ffffff'];

export class Celebration {
  private el: HTMLElement | null = null;
  private timer = 0;
  private dockTimer = 0;

  constructor(private readonly host: HTMLElement) {}

  show(spec: CelebrateSpec): void {
    this.close();
    const img = h('img.celebrate-art', { src: ART + spec.art, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    const confetti = h(
      'div.confetti',
      { 'aria-hidden': 'true' },
      ...Array.from({ length: 18 }, (_, i) => {
        const c = h('i');
        c.style.setProperty('--x', `${(i * 37) % 100}%`);
        c.style.setProperty('--d', `${(i % 6) * 0.12}s`);
        c.style.setProperty('--c', CONFETTI[i % CONFETTI.length]);
        c.style.setProperty('--r', `${(i * 53) % 360}deg`);
        return c;
      }),
    );
    const card = h(
      'div.celebrate.glass',
      { role: 'status', onclick: () => this.close() },
      confetti,
      h('div.celebrate-pic', {}, h('span.celebrate-glow'), img),
      h('b.celebrate-title', {}, spec.title),
      h('span.celebrate-sub', {}, spec.sub),
      spec.owner ? h('div.celebrate-owner', {}, ownerImg('celebrate-avatar'), h('span', {}, spec.owner)) : null,
    );
    this.host.append(card);
    this.el = card;
    requestAnimationFrame(() => card.classList.add('in'));
    // 先在中間大大的跳出來，接著縮到上方讓出畫面，看得到缸裡的特寫
    // 有老闆說話的卡多留一下，讓人讀得完
    this.dockTimer = window.setTimeout(() => card.classList.add('docked'), spec.owner ? 3800 : 1800);
    this.timer = window.setTimeout(() => this.close(), spec.owner ? 8000 : 7000);
  }

  close(): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.dockTimer);
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('in');
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 400);
  }
}
