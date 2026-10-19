import { describe, expect, it } from 'vitest';
import { CODEX } from './codex';
import { entryPic } from './codex-panel';

describe('圖鑑圖卡', () => {
  it('每個條目都有圖，圖檔都在 public/art 裡', () => {
    const files = Object.keys(import.meta.glob('/public/art/**/*.webp'));
    for (const e of CODEX) {
      const p = entryPic(e);
      expect(p.art ?? p.icon, e.id).toBeTruthy();
      if (p.art) expect(files, e.id).toContain(`/public/art/${p.art}`);
    }
  });

  it('魚蝦、水草和買得到的設備用商品圖，不是通用圖示', () => {
    for (const e of CODEX.filter((x) => x.category === 'fish' || x.category === 'plant')) expect(entryPic(e).art, e.id).toBeTruthy();
    for (const id of ['gear:sponge', 'gear:h50', 'gear:planted', 'gear:substrate_soil', 'gear:hardscape_lava', 'gear:quarantine']) {
      const e = CODEX.find((x) => x.id === id)!;
      expect(entryPic(e).art, id).toBeTruthy();
    }
  });
});
