/**
 * 通知的閘門（YenWel 2026-10-20「通知太亂，文字一直跳出來」）：決定一則通知要不要跳，畫面怎麼顯示另外處理。
 * - 同一句話一分鐘內不重複跳。
 * - 純告知（info、沒有按鈕）一段時間最多一則：前一則還在畫面上就不再疊新的。
 * - 要玩家處理的（warn、bad）和有按鈕的（復原、去處理）一定跳，只擋重複。
 * - 玩家剛按了東西的回應（「錢不夠」「撈出 2 條死魚」）不擋，不然會像按了沒反應。
 * 同一批模擬事件的合併（「3 尾魚死了」）在 mergeEventToasts 做，這裡只看一則一則的文字。
 */

export type NotifyTone = 'bad' | 'warn' | 'info';

/** 同一句話多久內不重複。 */
export const NOTIFY_DEDUPE_MS = 60_000;
/** 按下去多久內跳出的通知算是對那一下的回應。 */
export const NOTIFY_PLAYER_WINDOW_MS = 600;
/** 純告知的通知之間至少隔多久（一則在畫面上大約停 4.5 秒）。 */
export const NOTIFY_INFO_GAP_MS = 6_000;

export class NotifyGate {
  private readonly lastText = new Map<string, number>();
  private lastInfo = -Infinity;

  /** 這則要不要跳；要跳就記下來。byPlayer：玩家剛按了東西，這則是對那一下的回應。 */
  accept(text: string, tone: NotifyTone, hasAction: boolean, now: number, byPlayer = false): boolean {
    if (byPlayer) {
      this.lastText.set(text, now);
      return true;
    }
    const seen = this.lastText.get(text);
    // 有按鈕的（例如每次餵食後的「復原」）每次都是新的操作，不算重複
    if (!hasAction && seen !== undefined && now - seen < NOTIFY_DEDUPE_MS) return false;
    const quiet = tone === 'info' && !hasAction;
    if (quiet && now - this.lastInfo < NOTIFY_INFO_GAP_MS) return false;
    this.lastText.set(text, now);
    if (quiet) this.lastInfo = now;
    // 別讓記錄一直長
    if (this.lastText.size > 200) for (const [k, t] of this.lastText) if (now - t >= NOTIFY_DEDUPE_MS) this.lastText.delete(k);
    return true;
  }
}

export interface EventToast {
  /** 合併用的鍵：同一缸、同一種事件。 */
  key: string;
  text: string;
  tone: NotifyTone;
}

/**
 * 同一幀（快轉時一幀可以跑好幾個遊戲小時）冒出來的事件通知，同一缸同一種只留一則。
 * plural 給合併後的說法（例如「3 尾魚死了」）；沒給就只留第一則。
 */
export function mergeEventToasts(items: EventToast[], plural: (key: string, n: number, first: EventToast) => string | null): EventToast[] {
  const groups = new Map<string, EventToast[]>();
  for (const it of items) groups.set(it.key, [...(groups.get(it.key) ?? []), it]);
  const out: EventToast[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const text = list.length > 1 ? (plural(key, list.length, first) ?? first.text) : first.text;
    // 合併後的語氣取最嚴重的
    const tone = list.some((x) => x.tone === 'bad') ? 'bad' : list.some((x) => x.tone === 'warn') ? 'warn' : 'info';
    out.push({ key, text, tone });
  }
  return out;
}
