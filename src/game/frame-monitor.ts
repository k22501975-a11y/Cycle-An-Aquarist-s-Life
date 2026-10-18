import type { Quality } from '../render/quality';

/**
 * 自動降畫質：連續一段時間掉到不夠流暢，就降一級（高 → 中 → 低）。
 * 玩家自己在設定裡選過畫質就不再自動調；切到背景、卡一下（例如離線補算）的單一長幀不算。
 */

/** 低於這個幀率算卡。 */
export const LOW_FPS = 40;
/** 看多久的平均（毫秒）。 */
export const WINDOW_MS = 8000;
/** 降一級之後，至少等這麼久才會再降。 */
export const COOLDOWN_MS = 20000;
/** 比這更長的幀當作暫停（切到背景、跳出對話框），不列入計算。 */
const PAUSE_MS = 500;

export function lowerQuality(q: Quality): Quality | null {
  return q === 'high' ? 'medium' : q === 'medium' ? 'low' : null;
}

export class FrameMonitor {
  private frames: number[] = [];
  private span = 0;
  private quietUntil = 0;

  /** elapsedMs：遊戲開始到現在；回傳該不該降一級。 */
  sample(frameMs: number, elapsedMs: number): boolean {
    if (frameMs <= 0 || frameMs > PAUSE_MS) {
      this.reset();
      return false;
    }
    this.frames.push(frameMs);
    this.span += frameMs;
    while (this.span - this.frames[0] >= WINDOW_MS) this.span -= this.frames.shift()!;
    if (elapsedMs < this.quietUntil || this.span < WINDOW_MS * 0.95) return false;
    const fps = (1000 * this.frames.length) / this.span;
    if (fps >= LOW_FPS) return false;
    this.reset();
    this.quietUntil = elapsedMs + COOLDOWN_MS;
    return true;
  }

  reset(): void {
    this.frames = [];
    this.span = 0;
  }
}
