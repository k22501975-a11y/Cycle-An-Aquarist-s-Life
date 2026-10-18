import { describe, expect, it } from 'vitest';
import { PAINTED, paintedKey, paintedTexture, SCENERY, sceneryImage } from './painted';
import { GUPPY_LOOKS } from './strains';

describe('精繪素材對應', () => {
  it('每個素材檔都在 public/art 裡', () => {
    const files = Object.keys(import.meta.glob('/public/art/**/*.webp'));
    for (const spec of Object.values(PAINTED)) expect(files, spec.file).toContain(`/public/art/${spec.file}`);
    for (const file of Object.values(SCENERY)) expect(files, file).toContain(`/public/art/${file}`);
  });

  it('造景素材沒載入時回傳 null，場景改用程式繪製', () => {
    expect(sceneryImage('rock-1')).toBeNull();
  });

  it('公孔雀魚依品系挑圖，沒畫的品系退回程式繪製', () => {
    const variant = (strain: string) => GUPPY_LOOKS.findIndex((l) => l.strain === strain);
    expect(paintedKey('guppy', 'male', variant('藍草'), false)).toBe('guppy-male-bluegrass');
    expect(paintedKey('guppy', 'male', variant('黃金蛇王'), false)).toBe('guppy-male-cobra');
    expect(paintedKey('guppy', 'male', variant('紅蛇王'), false)).toBe('guppy-male-redcobra');
  });

  it('母魚懷孕換成大肚子的圖，母蝦抱卵換成抱蛋的圖', () => {
    expect(paintedKey('guppy', 'female', 0, false)).toBe('guppy-female-base');
    expect(paintedKey('guppy', 'female', 0, true)).toBe('guppy-female-pregnant');
    expect(paintedKey('cherry_shrimp', 'female', 0, true)).toBe('shrimp-cherry-berried');
    expect(paintedKey('cherry_shrimp', 'male', 0, false)).toBe('shrimp-cherry-male');
  });

  it('仔魚、仔蝦、斑馬魚都有自己的圖', () => {
    expect(paintedKey('guppy', 'juvenile', 0, false)).toBe('guppy-fry');
    expect(paintedKey('zebrafish', 'juvenile', 0, false)).toBe('guppy-fry');
    expect(paintedKey('cherry_shrimp', 'juvenile', 0, false)).toBe('shrimp-cherry-juvenile');
    expect(paintedKey('zebrafish', 'male', 0, false)).toBe('zebrafish-male');
    expect(paintedKey('zebrafish', 'female', 0, true)).toBe('zebrafish-female');
  });

  it('素材沒載入時拿不到貼圖（畫面會退回程式繪製版）', () => {
    expect(paintedTexture('guppy-male-bluegrass')).toBeNull();
    expect(paintedTexture(null)).toBeNull();
  });
});
