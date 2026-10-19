import { describe, expect, it } from 'vitest';
import type { DailyState } from '../sim';
import { dailyDoneText } from './daily-card';

const state = (done: boolean[]): DailyState => ({
  day: 3,
  issuedHours: 80,
  tasks: (['test', 'feed', 'observe'] as const).map((id, i) => ({ id, done: done[i] })),
  scapeCount: 0,
  before: {},
  marked: [],
  claimed: false,
});

describe('每日小事的完成通知寫清楚還差哪件（#185）', () => {
  it('還沒做完：列出剩下的', () => {
    expect(dailyDoneText(state([true, false, false]), 'test')).toBe('✓ 測一次水（今天的小事 1/3），還差「餵一次飼料」、「點一尾魚看看」');
  });
  it('三件都做完：叫玩家去開寶箱', () => {
    expect(dailyDoneText(state([true, true, true]), 'observe')).toContain('寶箱');
  });
});
