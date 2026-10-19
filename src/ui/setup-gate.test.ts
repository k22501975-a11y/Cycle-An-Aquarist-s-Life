import { describe, expect, it } from 'vitest';
import { blankGameState } from '../game/game';
import { applySetup, powerOn, RECOMMENDED_SETUP } from '../sim';
import { orderAlert } from './orders-panel';
import { householdTodos } from './status';

describe('開機前不出待辦和訂單提示（#204）', () => {
  it('挑設備、開缸演出中都是空的，開機後才有', () => {
    const s = blankGameState(1);
    expect(householdTodos([s], 0)).toEqual([]);
    expect(orderAlert([s], new Set())).toEqual({ ready: [], fresh: 0 });
    applySetup(s, RECOMMENDED_SETUP);
    expect(householdTodos([s], 0)).toEqual([]);
    expect(orderAlert([s], new Set())).toEqual({ ready: [], fresh: 0 });
    powerOn(s);
    expect(householdTodos([s], 0).length).toBeGreaterThan(0);
  });
});
