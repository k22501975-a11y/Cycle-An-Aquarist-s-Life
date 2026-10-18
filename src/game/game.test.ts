import { describe, expect, it } from 'vitest';
import { addFish, feed, TICK_GAME_SECONDS } from '../sim';
import { Game, newGameState } from './game';

describe('Game', () => {
  it('依時間倍率把現實時間換算成模擬 tick', () => {
    const game = new Game(newGameState(1), 3600);
    // 現實 1 秒 = 遊戲 1 小時 = 60 個 tick。
    expect(game.advance(1000)).toBe(3600 / TICK_GAME_SECONDS);
    expect(game.state.hours).toBeCloseTo(9);
  });

  it('暫停時不推進', () => {
    const game = new Game(newGameState(1), 0);
    expect(game.advance(10_000)).toBe(0);
  });

  it('模擬中產生的新事件會通知一次', () => {
    const game = new Game(newGameState(1), 21600);
    const fish = game.act((s) => addFish(s, 'guppy', { carriesIch: false }));
    fish.health = 0.001;
    game.state.water.tan = 20;
    const seen: string[] = [];
    game.onEvent((e) => seen.push(e.type));
    game.advance(1000);
    game.advance(1000);
    expect(seen.filter((t) => t === 'fish_died')).toHaveLength(1);
  });

  it('玩家操作會通知畫面更新', () => {
    const game = new Game(newGameState(1));
    let changes = 0;
    game.onChange(() => changes++);
    game.act((s) => feed(s, 10));
    expect(changes).toBe(1);
    expect(game.state.water.foodMg).toBe(10);
  });
});
