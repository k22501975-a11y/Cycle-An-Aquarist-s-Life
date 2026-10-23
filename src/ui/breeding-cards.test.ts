import { describe, expect, it } from 'vitest';
import { cleanStrainName, LENS_AT, LENS_ZOOM, lensPos, NAMING_MAX, nameLength, namingLineup, pickDone, revealOrder, revealTag, toggleKeeper, traitIcon, type PickFish } from './breeding-cards';

const kid = (fishId: number, sex: 'male' | 'female', keeper = false): PickFish => ({ fishId, tank: 0, sex, name: '全紅', look: 4, fins: [], traits: [], missing: [], keeper });
const limit = { male: 1, female: 2 };

describe('選種卡（midgame.md C2）', () => {
  it('還有名額：直接標上；再點一次取消', () => {
    const fish = [kid(1, 'male'), kid(2, 'female')];
    expect(toggleKeeper(fish, limit, fish[0])).toEqual([[1, true]]);
    fish[0].keeper = true;
    expect(toggleKeeper(fish, limit, fish[0])).toEqual([[1, false]]);
  });

  it('名額滿了：換掉最早標的同性別那尾，不用先取消', () => {
    const fish = [kid(1, 'male', true), kid(2, 'male'), kid(3, 'female', true), kid(4, 'female', true), kid(5, 'female')];
    expect(toggleKeeper(fish, limit, fish[1])).toEqual([[1, false], [2, true]]);
    expect(toggleKeeper(fish, limit, fish[4])).toEqual([[3, false], [5, true]]);
  });

  it('公母都標滿才算選好', () => {
    const fish = [kid(1, 'male', true), kid(3, 'female', true), kid(4, 'female')];
    expect(pickDone(fish, limit)).toBe(false);
    fish[2].keeper = true;
    expect(pickDone(fish, limit)).toBe(true);
  });

  it('每個特徵都有圖示：顏色是寶石、鰭和尾是剪影', () => {
    for (const key of ['albino', 'gold', 'tuxedo', 'red', 'snake', 'grass', 'wild']) expect(traitIcon(key)).toContain('radialGradient');
    for (const key of ['swallow', 'ribbon', 'dumbo', 'bigC', 'sword', 'tail:halfmoon', 'tail:delta', 'tail:round']) expect(traitIcon(key)).toContain('<path');
  });
});

describe('成長里程碑卡的放大鏡（midgame.md §5.3）', () => {
  it('肛鰭、胎斑剛好落在鏡片正中間（魚圖寬 512、高 213～234）', () => {
    for (const aspect of [213 / 512, 234 / 512]) {
      for (const at of Object.values(LENS_AT)) {
        const { left, top } = lensPos(at, aspect);
        // 鏡片是正方形，圖寬是鏡片的 LENS_ZOOM 倍：圖上的 at 換回鏡片座標要是 50%
        expect(left + at.x * LENS_ZOOM * 100).toBeCloseTo(50);
        expect(top + at.y * LENS_ZOOM * 100 * aspect).toBeCloseTo(50);
      }
    }
  });

  it('要看的地方都在魚身下半部（肛鰭、胎斑都在肚子那側）', () => {
    for (const at of Object.values(LENS_AT)) {
      expect(at.x).toBeGreaterThan(0.3);
      expect(at.x).toBeLessThan(0.8);
      expect(at.y).toBeGreaterThan(0.5);
    }
  });
});

describe('開獎卡（midgame.md §6.1）', () => {
  const f = (albino: boolean, snake: boolean, fishId: number) => ({ fishId, albino, snake });

  it('什麼都沒帶的先亮、帶一樣的接著、兩樣都有的留到最後；同一類照出生順序', () => {
    const fry = [f(true, true, 1), f(false, false, 2), f(false, true, 3), f(true, false, 4), f(false, false, 5)];
    expect(revealOrder(fry).map((x) => x.fishId)).toEqual([2, 5, 3, 4, 1]);
  });

  it('每尾的小標照 tutorial-lines.md §10', () => {
    expect(revealTag(f(true, false, 1))).toBe('帶白子');
    expect(revealTag(f(false, true, 1))).toBe('帶蛇紋');
    expect(revealTag(f(true, true, 1))).toBe('兩樣都有！');
    expect(revealTag(f(false, false, 1))).toBe('');
  });
});

describe('C18 為你的品系取名（strain-fixing.md §2.2）', () => {
  const n = { suggested: '阿德系', maxLen: 8 };

  it('名字去掉前後空白、連續空白縮成一個，截到 8 個字（中文、表情符號都算一個字）', () => {
    expect(cleanStrainName('  小  魚 系 ', n)).toBe('小 魚 系');
    expect(cleanStrainName('一二三四五六七八九十', n)).toBe('一二三四五六七八');
    expect(cleanStrainName('🐟🐟🐟🐟🐟🐟🐟🐟🐟', n)).toBe('🐟🐟🐟🐟🐟🐟🐟🐟');
    expect(nameLength(' 🐟紅 ')).toBe(2);
  });

  it('空的名字用預設的「{玩家名}系」', () => {
    expect(cleanStrainName('   ', n)).toBe('阿德系');
    expect(cleanStrainName('', n)).toBe('阿德系');
  });

  it('太多尾時先砍不是夢想魚的，順序不變', () => {
    const fish = Array.from({ length: 30 }, (_, i) => ({ ...kid(i, i % 2 ? 'male' : 'female'), missing: i % 3 === 0 ? [] : ['蛇紋'] }));
    const shown = namingLineup(fish);
    expect(shown).toHaveLength(NAMING_MAX);
    expect(shown.filter((f) => f.missing.length === 0)).toHaveLength(10);
    expect(shown.map((f) => f.fishId)).toEqual([...shown.map((f) => f.fishId)].sort((a, b) => a - b));
    expect(namingLineup(fish.slice(0, 5))).toHaveLength(5);
  });
});
