import { describe, expect, it } from 'vitest';
import { mergeEventToasts, NOTIFY_DEDUPE_MS, NOTIFY_INFO_GAP_MS, NotifyGate } from './notify-gate';
import { pluralEventText } from './labels';

describe('通知閘門（通知太亂）', () => {
  it('同一句話一分鐘內不重複跳', () => {
    const g = new NotifyGate();
    expect(g.accept('加熱棒卡住了，快拔插頭', 'bad', false, 0)).toBe(true);
    expect(g.accept('加熱棒卡住了，快拔插頭', 'bad', false, 10_000)).toBe(false);
    expect(g.accept('加熱棒卡住了，快拔插頭', 'bad', false, NOTIFY_DEDUPE_MS + 1)).toBe(true);
  });

  it('純告知一次一則；要處理的、有按鈕的照樣跳', () => {
    const g = new NotifyGate();
    expect(g.accept('電費 30 元', 'info', false, 0)).toBe(true);
    expect(g.accept('圖鑑新增了「米蝦」', 'info', false, 1000)).toBe(false);
    expect(g.accept('有魚生病了', 'warn', false, 1000)).toBe(true);
    expect(g.accept('匯入了存檔', 'info', true, 1000)).toBe(true);
    expect(g.accept('圖鑑新增了「斑馬魚」', 'info', false, NOTIFY_INFO_GAP_MS + 1)).toBe(true);
  });

  it('玩家剛按的回應不擋，也不算重複', () => {
    const g = new NotifyGate();
    expect(g.accept('缸裡沒有死魚', 'info', false, 0, true)).toBe(true);
    expect(g.accept('缸裡沒有死魚', 'info', false, 500, true)).toBe(true);
  });

  it('同一幀同一缸同一種事件合併成一則，語氣取最嚴重的', () => {
    const merged = mergeEventToasts(
      [
        { key: '0:fish_died', text: '小紅 死了（缺氧）', tone: 'bad' },
        { key: '0:fish_died', text: '小藍 死了（缺氧）', tone: 'bad' },
        { key: '0:fish_died', text: '小綠 死了（缺氧）', tone: 'bad' },
        { key: '1:ich_visible', text: '第 2 缸：小白 身上出現白點', tone: 'warn' },
        { key: '0:power_bill', text: '電費 30 元', tone: 'info' },
        { key: '0:power_bill', text: '電費 30 元', tone: 'info' },
      ],
      (key, n) => pluralEventText(key.split(':')[1], n),
    );
    expect(merged.map((m) => m.text)).toEqual(['3 尾魚死了，打開紀錄看原因', '第 2 缸：小白 身上出現白點', '電費 30 元']);
    expect(merged[0].tone).toBe('bad');
  });
});
