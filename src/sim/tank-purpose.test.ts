import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, addPlant, buyTank, economy, maxLengthCm } from './index';
import { checkGoals, goalState, nextGoals, PURPOSE_GOAL_COUNT } from './goals';
import { purposeCost, TANK_PURPOSES } from './tank-purpose';
import { setTankPurpose, suggestPurpose } from './tank-purpose-actions';
import type { TankState } from './state';

const calmFish = { carriesIch: false, carries: [] };

/** 主缸加上買好的第二缸（錢先補夠），前面的目標都算做完了。 */
function twoTanks(): TankState[] {
  const tanks = [newGameState(1)];
  economy(tanks[0]).coins = 99_999;
  buyTank(tanks, 'std40');
  goalState(tanks).done.push('cycled', 'protect_fry', 'raise5', 'sale', 'second_tank');
  return tanks;
}

describe('第二缸的用途（polish-to-9.md G4）', () => {
  it('沒選用途就不出用途目標；選了繁殖缸只出繁殖缸那個', () => {
    const tanks = twoTanks();
    expect(nextGoals(tanks, 9).map((g) => g.id)).not.toContain('breeding_tank');
    expect(nextGoals(tanks, 9).map((g) => g.id)).not.toContain('display_tank');
    setTankPurpose(tanks[1], 'breeding');
    expect(nextGoals(tanks, 1).map((g) => g.id)).toEqual(['breeding_tank']);
    expect(nextGoals(tanks, 9).map((g) => g.id)).not.toContain('display_tank');
  });

  it('繁殖缸裡養大的自家小魚數到了就完成；在主缸養大的不算', () => {
    const tanks = twoTanks();
    setTankPurpose(tanks[1], 'breeding');
    const raise = (t: TankState, n: number) => {
      for (let i = 0; i < n; i++) {
        const f = addFish(t, 'guppy', calmFish);
        f.generation = 1;
        f.lengthCm = maxLengthCm(f) * 0.65; // 轉色期
      }
    };
    raise(tanks[0], PURPOSE_GOAL_COUNT.breeding);
    expect(checkGoals(tanks).map((g) => g.id)).not.toContain('breeding_tank');
    raise(tanks[1], PURPOSE_GOAL_COUNT.breeding);
    expect(checkGoals(tanks).map((g) => g.id)).toContain('breeding_tank');
  });

  it('展示缸種活 3 株陽性草就完成：陰性草、正在溶的草不算', () => {
    const tanks = twoTanks();
    setTankPurpose(tanks[1], 'display');
    addPlant(tanks[1], 'anubias').growthRate = 0.01;
    addPlant(tanks[1], 'glosso').growthRate = 0.01;
    addPlant(tanks[1], 'rotala').growthRate = -0.01;
    addPlant(tanks[1], 'eleocharis').growthRate = 0.01;
    expect(checkGoals(tanks).map((g) => g.id)).not.toContain('display_tank');
    addPlant(tanks[1], 'rotala').growthRate = 0.01;
    expect(checkGoals(tanks).map((g) => g.id)).toContain('display_tank');
  });

  it('沒取名的缸用用途當名字，換用途跟著換；玩家自己取的名字不動', () => {
    const tanks = twoTanks();
    setTankPurpose(tanks[1], 'breeding');
    expect(tanks[1].label).toBe('繁殖缸');
    setTankPurpose(tanks[1], 'display');
    expect(tanks[1].label).toBe('展示缸');
    tanks[1].label = '小烏龜的家';
    setTankPurpose(tanks[1], 'breeding');
    expect(tanks[1].label).toBe('小烏龜的家');
  });

  it('推薦：有快生的母魚先開繁殖缸；沒有就看錢夠不夠買水草燈那套', () => {
    const tanks = [newGameState(1)];
    expect(purposeCost('display')).toBe(TANK_PURPOSES.display.items.filter((i) => i.required).reduce((a, i) => a + i.price, 0));
    expect(suggestPurpose(tanks, purposeCost('display'))).toBe('display');
    expect(suggestPurpose(tanks, purposeCost('display') - 1)).toBe('breeding');
    addFish(tanks[0], 'guppy', { ...calmFish, sex: 'female', pregnant: true }).pregnancy = 0.8;
    expect(suggestPurpose(tanks, 99_999)).toBe('breeding');
  });
});
