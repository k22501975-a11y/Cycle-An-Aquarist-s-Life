import { describe, expect, it } from 'vitest';
import { pickDone, toggleKeeper, traitIcon, type PickFish } from './breeding-cards';

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
