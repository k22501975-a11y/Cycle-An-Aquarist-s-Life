import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHOICE_ART } from './breeding-cards';

describe('選項卡的圖', () => {
  it('每個選項的圖都在 public/art 裡（含 C14 收納箱暫養，polish-to-9.md §13.7）', () => {
    expect(CHOICE_ART.bin).toBe('gear/storage-bin.webp');
    for (const file of Object.values(CHOICE_ART)) expect(existsSync(resolve(__dirname, '../../public/art', file)), file).toBe(true);
  });
});
