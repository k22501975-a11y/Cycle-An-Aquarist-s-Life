import { describe, expect, it } from 'vitest';
import { applySeason, newGameState } from './game/game';

// test-setup.ts 把測試的「今天」固定在 2026-10-15：室溫不跟著跑測試的那天變（#410 架構）
describe('測試日期固定', () => {
  it('new Date() 是 2026-10-15，新遊戲的室溫照十月中算', () => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-15');
    const today = newGameState(1);
    const octMid = newGameState(1);
    applySeason(octMid, new Date('2026-10-15T12:00:00+08:00'));
    expect(today.environment.roomTempC).toBe(octMid.environment.roomTempC);
  });
});
