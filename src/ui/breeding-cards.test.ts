import { describe, expect, it } from 'vitest';
import { pickDone, toggleKeeper, traitIcon, type KeeperKid, type KeeperPick } from './breeding-cards';

const kid = (id: number, sex: 'male' | 'female', keeper = false): KeeperKid => ({ id, sex, pheno: { albino: false, gold: false, tuxedo: false, red: true, snake: false, grass: false }, traits: [], missing: [], keeper });

describe('選種卡（midgame.md C2）', () => {
  it('還有名額：直接標上；再點一次取消', () => {
    const pick: KeeperPick = { tank: 0, kids: [kid(1, 'male'), kid(2, 'female')], need: { male: 1, female: 2 } };
    expect(toggleKeeper(pick, pick.kids[0])).toEqual([[1, true]]);
    pick.kids[0].keeper = true;
    expect(toggleKeeper(pick, pick.kids[0])).toEqual([[1, false]]);
  });

  it('名額滿了：換掉最早標的同性別那尾，不用先取消', () => {
    const pick: KeeperPick = { tank: 0, kids: [kid(1, 'male', true), kid(2, 'male'), kid(3, 'female', true), kid(4, 'female', true), kid(5, 'female')], need: { male: 1, female: 2 } };
    expect(toggleKeeper(pick, pick.kids[1])).toEqual([[1, false], [2, true]]);
    expect(toggleKeeper(pick, pick.kids[4])).toEqual([[3, false], [5, true]]);
  });

  it('公母都標滿才算選好', () => {
    const pick: KeeperPick = { tank: 0, kids: [kid(1, 'male', true), kid(3, 'female', true), kid(4, 'female')], need: { male: 1, female: 2 } };
    expect(pickDone(pick)).toBe(false);
    pick.kids[2].keeper = true;
    expect(pickDone(pick)).toBe(true);
  });

  it('每個特徵都有圖示：顏色是寶石、鰭和尾是剪影', () => {
    for (const key of ['albino', 'gold', 'tuxedo', 'red', 'snake', 'grass', 'wild']) expect(traitIcon(key)).toContain('radialGradient');
    for (const key of ['swallow', 'ribbon', 'dumbo', 'bigC', 'sword', 'tail:halfmoon', 'tail:delta', 'tail:round']) expect(traitIcon(key)).toContain('<path');
  });
});
