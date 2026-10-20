import type { SoundId } from './sounds';

/**
 * 震動回饋（polish-to-9.md G1）：每個有音效的動作，手機上同時給一下短震動。
 * 用網頁的 Vibration API（Android App 的 WebView 也支援，manifest 要有 VIBRATE 權限），不另裝外掛；
 * 不支援的瀏覽器（iOS Safari、桌機）就什麼都不做。設定裡可以關掉，和靜音分開（靜音時照樣震）。
 */

/** 各動作的震動長度（毫秒）；陣列是「震、停、震…」。輕的動作短、好事有節奏、警報最重。 */
export const HAPTIC_PATTERNS: Partial<Record<SoundId, number | number[]>> = {
  tap: 8,
  open: 8,
  feed: 12,
  water: 15,
  test: 10,
  trim: 10,
  buy: 18,
  net: 18,
  restore: 20,
  warn: 30,
  death: 40,
  birth: [15, 40, 15],
  quest: [15, 40, 25],
  fanfare: [20, 50, 20, 50, 60],
  alarm: [80, 60, 80],
};

/** 同一下點擊常常同時觸發兩個音效（按鈕聲＋動作聲）：間隔太短的只震第一下，免得手機一直嗡嗡響。 */
export const HAPTIC_GAP_MS = 60;

type Vibrate = (pattern: number | number[]) => boolean;

export class Haptics {
  private last = -Infinity;

  constructor(
    public enabled: boolean,
    private readonly vibrate: Vibrate | null = defaultVibrate(),
  ) {}

  /** 動作 id 對應的震動；回傳有沒有真的震。 */
  buzz(id: SoundId, now = performance.now()): boolean {
    const pattern = HAPTIC_PATTERNS[id];
    if (!this.enabled || !this.vibrate || pattern === undefined) return false;
    if (now - this.last < HAPTIC_GAP_MS) return false;
    this.last = now;
    try {
      return this.vibrate(pattern);
    } catch {
      return false;
    }
  }
}

function defaultVibrate(): Vibrate | null {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null;
  return (pattern) => navigator.vibrate(pattern);
}
