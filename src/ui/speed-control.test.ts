import { describe, expect, it } from 'vitest';
import { speedChoices, speedGlyph, speedShort } from './speed-control';

describe('speed control', () => {
  it('cloud mode only offers pause and normal speed', () => {
    expect(speedChoices(true).map((o) => o.scale)).toEqual([0, 7]);
    expect(speedChoices(false).length).toBe(6);
  });

  it('glyph follows the speed', () => {
    expect(speedGlyph(0)).toBe('pause');
    expect(speedGlyph(7)).toBe('play');
    expect(speedGlyph(600)).toBe('fast');
    expect(speedGlyph(21600)).toBe('faster');
  });

  it('short labels for the button', () => {
    expect(speedShort(7)).toBe('×7');
    expect(speedShort(3600)).toBe('1時/秒');
    expect(speedShort(42)).toBe('×42');
  });
});
