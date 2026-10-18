import { describe, expect, it } from 'vitest';
import { GAME_SECONDS_PER_DAY, GameClock, TICK_GAME_SECONDS } from './clock';

describe('GameClock', () => {
  it('7 倍速下，現實 1 天等於遊戲 1 週', () => {
    const clock = new GameClock(7);
    clock.advance(GAME_SECONDS_PER_DAY * 1000);
    expect(clock.gameTime).toBe(7 * GAME_SECONDS_PER_DAY);
  });

  it('不足一個 tick 的時間會累積到下次', () => {
    const clock = new GameClock(1);
    const halfTickMs = (TICK_GAME_SECONDS / 2) * 1000;
    expect(clock.advance(halfTickMs)).toBe(0);
    expect(clock.advance(halfTickMs)).toBe(1);
    expect(clock.gameTime).toBe(TICK_GAME_SECONDS);
  });

  it('倍率可在執行中調整（開發用加速）', () => {
    const clock = new GameClock(1);
    clock.timeScale = 600;
    expect(clock.advance(1000)).toBe(600 / TICK_GAME_SECONDS);
  });

  it('倍率為 0 時暫停', () => {
    const clock = new GameClock(0);
    expect(clock.advance(10_000)).toBe(0);
  });

  it('拒絕負數或非數字倍率', () => {
    expect(() => new GameClock(-1)).toThrow(RangeError);
    expect(() => {
      new GameClock().timeScale = Number.NaN;
    }).toThrow(RangeError);
  });
});
