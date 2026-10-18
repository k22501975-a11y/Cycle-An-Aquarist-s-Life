import { describe, expect, it } from 'vitest';
import { PAINTED, paintedKey, paintedTexture } from './painted';
import { GUPPY_LOOKS } from './strains';

describe('精繪素材對應', () => {
  it('每個素材檔都在 public/art 裡', () => {
    const files = Object.keys(import.meta.glob('/public/art/**/*.webp'));
    for (const spec of Object.values(PAINTED)) expect(files, spec.file).toContain(`/public/art/${spec.file}`);
  });

  it('公孔雀魚依品系挑圖，沒畫的品系退回程式繪製', () => {
    const variant = (strain: string) => GUPPY_LOOKS.findIndex((l) => l.strain === strain);
    expect(paintedKey('guppy', 'male', variant('藍草'), false)).toBe('guppy-male-bluegrass');
    expect(paintedKey('guppy', 'male', variant('黃金蛇王'), false)).toBe('guppy-male-cobra');
    expect(paintedKey('guppy', 'male', variant('紅蛇王'), false)).toBeNull();
  });

  it('母魚懷孕換成大肚子的圖，母蝦抱卵換成抱蛋的圖', () => {
    expect(paintedKey('guppy', 'female', 0, false)).toBe('guppy-female-base');
    expect(paintedKey('guppy', 'female', 0, true)).toBe('guppy-female-pregnant');
    expect(paintedKey('cherry_shrimp', 'female', 0, true)).toBe('shrimp-cherry-berried');
    expect(paintedKey('cherry_shrimp', 'male', 0, false)).toBe('shrimp-cherry-male');
  });

  it('仔魚和還沒有素材的魚種用程式繪製', () => {
    expect(paintedKey('guppy', 'juvenile', 0, false)).toBeNull();
    expect(paintedKey('zebrafish', 'male', 0, false)).toBeNull();
  });

  it('素材沒載入時拿不到貼圖（畫面會退回程式繪製版）', () => {
    expect(paintedTexture('guppy-male-bluegrass')).toBeNull();
    expect(paintedTexture(null)).toBeNull();
  });
});
