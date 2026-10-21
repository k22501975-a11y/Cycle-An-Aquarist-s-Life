import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, addPlant, addSnail, FISH_SPECIES, GUPPY_STRAINS, HARDSCAPE, lookVariant, PLANT_SPECIES, type FishSpeciesId, type GrowthStage, type PlantSpeciesId } from '../sim';
import { ART_FILES, PAINTED, paintedKey, paintedTexture, SCENERY, sceneryImage, startupArt } from './painted';
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
    expect(paintedKey('guppy', 'male', variant('藍草尾'), false)).toBe('guppy-male-bluegrass');
    expect(paintedKey('guppy', 'male', variant('黃金蛇王'), false)).toBe('guppy-male-cobra');
    expect(paintedKey('guppy', 'male', variant('紅蛇王'), false)).toBe('guppy-male-redcobra');
  });

  it('店裡每個品系的中文名都對得到外觀和精繪圖（改名時兩邊漏改會被擋下來）', () => {
    for (const strain of GUPPY_STRAINS) {
      const i = GUPPY_LOOKS.findIndex((l) => l.strain === strain);
      expect(i, strain).toBeGreaterThanOrEqual(0);
      expect(paintedKey('guppy', 'male', i, false), strain).not.toBeNull();
    }
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

describe('開機只先載當前缸用到的圖（Issue #81）', () => {
  it('新遊戲只要缸背景、設備和石英砂，不用等全部素材', () => {
    const need = startupArt([newGameState(1)]);
    expect([...need].sort()).toEqual(['bg-back', 'gear-heater', 'gear-heater-scene', 'gear-intake', 'gear-sponge', 'sub-sand-side', 'sub-sand-tile']);
    expect(ART_FILES.length).toBeGreaterThan(70);
  });

  it('缸裡有的魚、蝦、螺、水草、造景，各種外觀的圖都在開機清單裡', () => {
    const species = Object.keys(FISH_SPECIES) as FishSpeciesId[];
    for (const sp of species) {
      const s = newGameState(1);
      addFish(s, sp);
      const need = startupArt([s]);
      const stages: (GrowthStage | undefined)[] = [undefined, 'fry', 'juvenile', 'subadult', 'coloring', 'adult', 'old'];
      for (const form of ['male', 'female', 'juvenile'] as const)
        for (const gravid of [false, true])
          for (const stage of stages)
            for (const variant of [0, 1, 2, 3, 4]) {
              // 公孔雀魚只先載缸裡有的花紋（下面另外驗）
              if (sp === 'guppy' && form === 'male') continue;
              const key = paintedKey(sp, form, variant, gravid, stage);
              if (key) expect(need, `${sp} ${form} ${stage}`).toContain(key);
            }
    }
    const s = newGameState(1);
    for (const p of Object.keys(PLANT_SPECIES) as PlantSpeciesId[]) addPlant(s, p);
    addSnail(s, 'nerite');
    s.equipment.hardscape = [HARDSCAPE.seiryu, HARDSCAPE.driftwood];
    const need = startupArt([s]);
    for (const p of Object.keys(PLANT_SPECIES)) if (SCENERY[`plant-${p}`]) expect(need).toContain(`plant-${p}`);
    expect(need).toContain('snail-nerite-zebra');
    expect(need).toContain('rock-1');
    expect(need).toContain('wood-1');
  });

  it('公孔雀魚只先載缸裡有的花紋和它的鰭型圖（G6）', () => {
    const s = newGameState(1);
    const male = addFish(s, 'guppy', { sex: 'male', strain: 0 });
    const need = startupArt([s]);
    const key = paintedKey('guppy', 'male', lookVariant(male), false)!;
    for (const k of [key, `${key}-ribbon`, `${key}-swallow`, `${key}-halfmoon`]) expect(need).toContain(k);
    const males = [...need].filter((k) => k.startsWith('guppy-male-'));
    expect(males.every((k) => k.startsWith(key)), males.join()).toBe(true);
    // 母魚、仔魚、幼魚的圖照樣都在（公魚之後生的小魚也看得到）
    for (const k of ['guppy-female-base', 'guppy-female-pregnant', 'guppy-fry', 'guppy-juvenile']) expect(need).toContain(k);
  });

  it('其他缸（多缸）用到的圖也算進去', () => {
    const a = newGameState(1);
    const b = newGameState(2);
    addFish(b, 'betta');
    expect(startupArt([a, b])).toContain('betta-female');
  });
});
