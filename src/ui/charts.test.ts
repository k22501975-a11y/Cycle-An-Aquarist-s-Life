import { describe, expect, it } from 'vitest';
import { createTank, FILTERS, simulate, TANKS, TEMP_LOG_HOURS, TEST_LOG_MAX, useTestKit } from '../sim';
import { niceCeil, yDomain } from './charts';

describe('趨勢圖刻度', () => {
  it('最大值進位成好讀的數字', () => {
    expect(niceCeil(0.3)).toBe(0.5);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(37)).toBe(50);
    expect(niceCeil(0)).toBe(1);
  });

  it('濃度從 0 開始、至少顯示到指定範圍；溫度貼著資料但不會把小波動放大', () => {
    expect(yDomain([{ x: 0, y: 0 }, { x: 1, y: 0.25 }], 1, true)).toEqual([0, 1]);
    const [lo, hi] = yDomain([{ x: 0, y: 24.9 }, { x: 1, y: 25.1 }], 3, false);
    expect(hi - lo).toBeGreaterThanOrEqual(3);
    expect(lo).toBeLessThan(24.9);
    expect(hi).toBeGreaterThan(25.1);
  });
});

describe('紀錄', () => {
  it('溫度每個整點記一筆，只留兩週', () => {
    const s = createTank({ tank: TANKS.nano20, filter: FILTERS.sponge });
    simulate(s, 5);
    expect(s.tempLog?.map((p) => p.hours)).toEqual([1, 2, 3, 4, 5]);
    simulate(s, TEMP_LOG_HOURS + 10);
    expect(s.tempLog).toHaveLength(TEMP_LOG_HOURS);
  });

  it('測試劑每測一次記一筆，有上限', () => {
    const s = createTank({ tank: TANKS.nano20, filter: FILTERS.sponge });
    for (let i = 0; i < TEST_LOG_MAX + 5; i++) {
      s.hours = i;
      useTestKit(s);
    }
    expect(s.testLog).toHaveLength(TEST_LOG_MAX);
    expect(s.testLog![0].hours).toBe(5);
  });
});
