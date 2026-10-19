import { describe, expect, it } from 'vitest';
import { causeAdvice, needsAdvice } from './owner-advice';

describe('老闆說明生病原因', () => {
  it('講最主要的兩個原因和怎麼做', () => {
    const t = causeAdvice('小藍', [
      { key: 'ammonia', label: '水裡有氨' },
      { key: 'crowding', label: '缸裡太擠' },
      { key: 'ph', label: 'pH 和牠習慣的差太多' },
    ]);
    expect(t).toContain('水裡有氨');
    expect(t).toContain('缸裡太擠');
    expect(t).not.toContain('pH');
    expect(t).toContain('換三成水');
    expect(t).toContain('分缸');
  });

  it('魚好好的不打擾；有壓力來源又不舒服才開口', () => {
    const causes = [{ key: 'hunger' as const, label: '這幾天沒吃飽' }];
    expect(needsAdvice({ health: 1, stress: 0.1, causes })).toBe(false);
    expect(needsAdvice({ health: 0.5, stress: 0.1, causes: [] })).toBe(false);
    expect(needsAdvice({ health: 0.9, stress: 0.5, causes })).toBe(true);
  });
});
