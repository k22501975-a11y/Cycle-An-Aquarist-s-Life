import { describe, expect, it } from 'vitest';
import { defaultQuality, isQuality, qualitySpec } from './quality';

describe('畫質設定', () => {
  it('低畫質關掉模糊、解析度 1.5、粒子變少', () => {
    const low = qualitySpec('low', 3);
    expect(low.resolution).toBe(1.5);
    expect(low.depthBlur).toBe(false);
    expect(low.softGlow).toBe(false);
    expect(low.motes).toBeLessThan(qualitySpec('medium', 3).motes);
  });

  it('解析度不超過裝置像素比，高畫質最多 2 倍', () => {
    expect(qualitySpec('high', 3).resolution).toBe(2);
    expect(qualitySpec('high', 1).resolution).toBe(1);
    expect(qualitySpec('medium', 3).resolution).toBe(2);
  });

  it('手機預設中畫質，電腦預設高畫質', () => {
    expect(defaultQuality(390, true)).toBe('medium');
    expect(defaultQuality(1600, false)).toBe('high');
    expect(defaultQuality(1200, true)).toBe('high');
  });

  it('只接受三種畫質字串（讀存檔用）', () => {
    expect(isQuality('low')).toBe(true);
    expect(isQuality('ultra')).toBe(false);
    expect(isQuality(undefined)).toBe(false);
  });
});
