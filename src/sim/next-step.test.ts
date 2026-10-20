import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, economy, GOALS, goalState, nextStep } from '.';

describe('主畫面的下一步（U1）', () => {
  it('每個目標都說得出下一步，句子短', () => {
    const s = newGameState(1);
    const g = goalState([s]);
    for (const goal of GOALS) {
      const step = nextStep([s]);
      expect(step?.goal).toBe(goal.id);
      expect(step!.text.length).toBeLessThanOrEqual(24);
      g.done.push(goal.id);
    }
    expect(nextStep([s])).toBeNull();
  });

  it('跟著缸裡的狀況變：母魚快生了、錢夠不夠買第二缸', () => {
    const s = newGameState(1);
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
});
