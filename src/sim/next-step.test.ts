import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, buyTank, economy, GENERIC_STEP, GOALS, goalState, LIGHTS, nextStep, PURPOSE_GOAL_COUNT, setTankPurpose } from '.';

describe('主畫面的下一步（U1）', () => {
  it('每個目標都說得出下一步，句子短', () => {
    const s = newGameState(1);
    const g = goalState([s]);
    for (const goal of GOALS) {
      // 第二缸的用途目標要選了用途才出（下面另外測）
      if (goal.hidden?.([s])) continue;
      const step = nextStep([s]);
      expect(step?.goal).toBe(goal.id);
      expect(step!.text.length).toBeLessThanOrEqual(24);
      // 每個目標都有自己的一句，沒有掉到保底
      expect(step!.text).not.toBe(GENERIC_STEP);
      g.done.push(goal.id);
    }
    expect(nextStep([s])).toBeNull();
  });

  it('跟著缸裡的狀況變：母魚快生了、錢夠不夠買第二缸', () => {
    const s = newGameState(1);
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', target: 'test' });
    goalState([s]).done.push('cycled');
    expect(nextStep([s])).toMatchObject({ goal: 'protect_fry', target: 'feed' });
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.95;
    expect(nextStep([s])).toMatchObject({ text: '母魚快生了，買個育幼盒', target: 'nursery' });
    s.nurseryBox = true;
    expect(nextStep([s])?.text).toBe('母魚快生了，放進育幼盒');

    goalState([s]).done.push('protect_fry', 'raise5', 'sale');
    economy(s).coins = 0;
    expect(nextStep([s])?.text).toMatch(/^再存 \d+ 魚幣/);
    economy(s).coins = 99999;
    expect(nextStep([s])).toMatchObject({ target: 'shop_tank' });
  });

  it('第二缸的用途目標（G4）：繁殖缸叫你把小魚搬過去；展示缸先換水草燈再種陽性草', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 99_999;
    buyTank(tanks, 'std40');
    const g = goalState(tanks);
    g.done.push(...GOALS.map((x) => x.id).filter((id) => id !== 'breeding_tank' && id !== 'display_tank'));
    expect(nextStep(tanks)).toBeNull();
    setTankPurpose(tanks[1], 'breeding');
    expect(nextStep(tanks)).toMatchObject({ goal: 'breeding_tank', target: 'shop_tank', text: `小魚搬去繁殖缸養大（0/${PURPOSE_GOAL_COUNT.breeding}）` });
    setTankPurpose(tanks[1], 'display');
    expect(nextStep(tanks)).toMatchObject({ goal: 'display_tank', target: 'shop_gear' });
    tanks[1].equipment.light = { spec: LIGHTS.planted, startHour: 10, photoperiodHours: 8 };
    expect(nextStep(tanks)).toMatchObject({ goal: 'display_tank', target: 'shop_plants', text: `展示缸種陽性草（0/${PURPOSE_GOAL_COUNT.display}）` });
  });
});
