/**
 * 開發用幀率顯示（效能與安全第 1 份報告）：實機試玩時看幀率、幀時間，
 * 和每幀遊戲邏輯＋畫面更新花的時間（不含 GPU 繪製）。只在設定裡打開或網址加 ?fps 時顯示。
 */

export interface FpsStats {
  fps: number;
  avgMs: number;
  worstMs: number;
  /** 每幀遊戲邏輯＋場景更新的平均時間。 */
  jsMs: number;
}

/** 看最近多久（毫秒）。 */
const WINDOW_MS = 1000;

export class FpsMeter {
  private frames: { at: number; ms: number; js: number }[] = [];

  /** frameMs：這一幀和上一幀的間隔；jsMs：這一幀更新花的時間；now：現在的時間（毫秒）。 */
  add(frameMs: number, jsMs: number, now: number): void {
    this.frames.push({ at: now, ms: frameMs, js: jsMs });
    while (this.frames.length > 0 && now - this.frames[0].at > WINDOW_MS) this.frames.shift();
  }

  stats(): FpsStats {
    const n = this.frames.length;
    if (n === 0) return { fps: 0, avgMs: 0, worstMs: 0, jsMs: 0 };
    let total = 0;
    let worst = 0;
    let js = 0;
    for (const f of this.frames) {
      total += f.ms;
      worst = Math.max(worst, f.ms);
      js += f.js;
    }
    return { fps: (1000 * n) / total, avgMs: total / n, worstMs: worst, jsMs: js / n };
  }
}

export function formatFps(s: FpsStats): string {
  return `${Math.round(s.fps)} fps · ${s.avgMs.toFixed(1)} ms（最差 ${Math.round(s.worstMs)}）· 更新 ${s.jsMs.toFixed(1)} ms`;
}
