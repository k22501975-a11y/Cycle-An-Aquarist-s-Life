import { describe, expect, it } from 'vitest';
import { ownerMood } from './owner-mood';

describe('老闆的表情（V1）', () => {
  it('照說的話換表情', () => {
    expect(ownerMood('魚死了，我們來看看是什麼原因')).toBe('worried');
    expect(ownerMood('測到氨了，先換三成的水')).toBe('worried');
    expect(ownerMood('哇，孔雀魚母魚肚子很鼓，快生了！')).toBe('surprised');
    expect(ownerMood('養水完成！硝化菌長好了')).toBe('proud');
    expect(ownerMood('歡迎光臨，先挑一個缸吧')).toBe('happy');
    expect(ownerMood('每天記得測一次水')).toBe('calm');
  });

  it('壞消息優先：有「不錯」也有「死」時是擔心', () => {
    expect(ownerMood('水養得不錯，可是昨晚死了一條')).toBe('worried');
  });
});
