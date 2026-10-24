import { describe, expect, it } from 'vitest';
import { numberParts } from './morning-card';

describe('數字用粗體', () => {
  it('數字和百分比切出來，魚的編號不算', () => {
    expect(numberParts('母魚 #8 再 5 天會生，穩定度 61%')).toEqual([
      { text: '母魚 #8 再 ', num: false },
      { text: '5', num: true },
      { text: ' 天會生，穩定度 ', num: false },
      { text: '61%', num: true },
    ]);
    expect(numberParts('賣了 1,200 元')).toEqual([
      { text: '賣了 ', num: false },
      { text: '1,200', num: true },
      { text: ' 元', num: false },
    ]);
    expect(numberParts('沒有數字')).toEqual([{ text: '沒有數字', num: false }]);
  });
});
