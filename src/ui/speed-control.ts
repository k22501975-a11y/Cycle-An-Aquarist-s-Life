import { SPEED_OPTIONS } from '../game/game';
import { DEFAULT_TIME_SCALE } from '../sim';
import { h } from './dom';

/**
 * 主畫面的時間速度按鈕（時鐘旁邊）：顯示目前速度，點開選暫停、正常、快轉。
 * 登入雲端時遊戲時鐘由伺服器統一（L2），只能暫停或正常速度。
 */
export type SpeedOption = (typeof SPEED_OPTIONS)[number];

/** 可以選的速度：雲端模式只留暫停和正常速度。 */
export function speedChoices(cloud: boolean): SpeedOption[] {
  return SPEED_OPTIONS.filter((opt) => !cloud || opt.scale <= DEFAULT_TIME_SCALE);
}

/**
 * 雲端模式的時間倍率最多 ×7（#112）：登入前開著的快轉、讀進來或從雲端下載的存檔裡記著的倍率，都不能帶進來。
 */
export function cloudTimeScale(scale: number, cloud: boolean): number {
  return cloud && scale > DEFAULT_TIME_SCALE ? DEFAULT_TIME_SCALE : scale;
}

export type SpeedGlyph = 'pause' | 'play' | 'fast' | 'faster';

/** 按鈕上的圖示：暫停、播放、快轉（雙箭頭）、更快（三箭頭）。 */
export function speedGlyph(scale: number): SpeedGlyph {
  if (scale <= 0) return 'pause';
  if (scale <= DEFAULT_TIME_SCALE) return 'play';
  return scale < 3600 ? 'fast' : 'faster';
}

export function speedShort(scale: number): string {
  return SPEED_OPTIONS.find((o) => o.scale === scale)?.short ?? `×${scale}`;
}

const GLYPHS: Record<SpeedGlyph, string> = {
  pause: '<rect x="-7" y="-8" width="5" height="16" rx="1.5"/><rect x="2" y="-8" width="5" height="16" rx="1.5"/>',
  play: '<path d="M-5,-9 L8,0 L-5,9 Z"/>',
  fast: '<path d="M-10,-8 L0,0 L-10,8 Z M0,-8 L10,0 L0,8 Z"/>',
  faster: '<path d="M-13,-8 L-5,0 L-13,8 Z M-5,-8 L3,0 L-5,8 Z M3,-8 L11,0 L3,8 Z"/>',
};

export function glyphSvg(glyph: SpeedGlyph): string {
  return `<svg viewBox="-14 -12 28 24" width="100%" height="100%" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round">${GLYPHS[glyph]}</svg>`;
}

export interface SpeedControlDeps {
  get: () => number;
  set: (scale: number) => void;
  /** 有沒有登入雲端存檔。 */
  cloud: () => boolean;
}

export class SpeedControl {
  readonly el: HTMLElement;
  private readonly btn: HTMLButtonElement;
  private readonly ico = h('span.speed-ico');
  private readonly lbl = h('span.speed-lbl');
  private readonly pop = h('div.speed-pop.glass');
  private shown = '';

  constructor(private readonly deps: SpeedControlDeps) {
    this.btn = h('button.speed-btn', { 'aria-label': '時間速度', title: '時間速度：暫停、正常、快轉', 'aria-haspopup': 'true', onclick: (e: Event) => (e.stopPropagation(), this.toggle()) }, this.ico, this.lbl);
    this.el = h('div.speed', {}, this.btn, this.pop);
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.el.contains(e.target as Node)) this.close();
    });
    this.render();
  }

  get isOpen(): boolean {
    return this.pop.classList.contains('open');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    const cloud = this.deps.cloud();
    const now = this.deps.get();
    this.pop.replaceChildren(
      ...speedChoices(cloud).map((opt) => {
        const b = h(`button.speed-opt${opt.scale === now ? '.active' : ''}`, {
          onclick: () => {
            this.deps.set(opt.scale);
            this.close();
            this.render();
          },
        });
        b.innerHTML = `<span class="speed-ico">${glyphSvg(speedGlyph(opt.scale))}</span>`;
        b.append(h('span', {}, opt.name));
        return b;
      }),
      cloud ? h('p.hint.speed-note', {}, '雲端模式時間由伺服器統一，不能加快') : '',
    );
    this.pop.classList.add('open');
    // 老闆對話框掛在 body、疊在整個遊戲畫面上面；選單打開時先把它藏起來，選單才不會被蓋住（#114）
    document.body.classList.add('speed-open');
    this.pop.closest('#hud')?.classList.add('menu-open');
    this.btn.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    this.pop.classList.remove('open');
    document.body.classList.remove('speed-open');
    this.pop.closest('#hud')?.classList.remove('menu-open');
    this.btn.setAttribute('aria-expanded', 'false');
  }

  /** 每幀呼叫也沒關係：速度沒變就不動 DOM。 */
  render(): void {
    const scale = this.deps.get();
    const key = String(scale);
    if (key === this.shown) return;
    this.shown = key;
    const glyph = speedGlyph(scale);
    this.ico.innerHTML = glyphSvg(glyph);
    this.lbl.textContent = speedShort(scale);
    this.btn.classList.toggle('paused', glyph === 'pause');
    this.btn.classList.toggle('fast', glyph === 'fast' || glyph === 'faster');
  }
}
