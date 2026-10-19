import { describe, expect, it } from 'vitest';
import { addFish, createTank, DEFAULT_TIME_SCALE, FILTERS, HEATERS, LIGHTS, TANKS, type TankState } from '../sim';
import { Game } from './game';

/** 養好水的 40L 缸＋4 條孔雀魚（評測第 4 輪的情境，#142）。 */
function cycledTank(): TankState {
  const s = createTank({
    tank: TANKS.std40,
    filter: FILTERS.hangOn,
    heater: { spec: HEATERS.h50, targetC: 25 },
    light: { spec: LIGHTS.basic },
    roomTempC: 24,
    seed: 21,
    matureMedia: true,
  });
  for (let i = 0; i < 4; i++) addFish(s, 'guppy', { carriesIch: false });
  return s;
}

describe('快轉遇到危機自動切回正常速度（#142）', () => {
  it('快轉中加熱棒卡住：切回正常速度，不會在玩家反應前整缸燙死', () => {
    const game = new Game(cycledTank(), 3600);
    const crises: string[] = [];
    game.onCrisis((c) => crises.push(c.reason));
    game.advance(1000);
    game.act((s) => {
      s.equipment.heater!.broken = true;
      s.equipment.heater!.stuckOn = true;
    });
    // 沒有自動減速時，快轉（每秒 1 小時）約 40 秒全缸燙死；這裡跑 60 秒
    for (let i = 0; i < 60; i++) game.advance(1000);
    expect(game.clock.timeScale).toBe(DEFAULT_TIME_SCALE);
    expect(crises).toContain('too_hot');
    expect(game.state.fish.every((f) => f.alive)).toBe(true);
  });

  it('快轉中發生危機事件（加熱棒故障、停電、生病、死魚）會在那一刻停下，不把這一幀剩下的時間跑完', () => {
    const game = new Game(cycledTank(), 21600);
    let at = -1;
    game.onCrisis((c) => {
      if (c.reason === 'fish_died') at = game.state.hours;
    });
    const start = game.state.hours;
    game.state.fish[0].health = -1; // 下一個 tick 就死
    game.advance(1000); // 本來會跑 6 個遊戲小時
    expect(at).toBeGreaterThan(start);
    expect(game.state.hours).toBeCloseTo(at);
    expect(game.state.hours - start).toBeLessThan(0.1);
    expect(game.clock.timeScale).toBe(DEFAULT_TIME_SCALE);
  });

  it('老死不算危機，快轉不會被打斷', () => {
    const game = new Game(cycledTank(), 3600);
    const crises: string[] = [];
    game.onCrisis((c) => crises.push(c.reason));
    const died: (string | undefined)[] = [];
    game.onEvent((e) => e.type === 'fish_died' && died.push(e.cause));
    const old = game.state.fish[0];
    old.ageDays = 3650;
    old.health = 0.001;
    for (let i = 0; i < 5 && died.length === 0; i++) game.advance(1000);
    expect(died).toEqual(['old_age']);
    expect(crises).toEqual([]);
    expect(game.clock.timeScale).toBe(3600);
  });

  it('正常速度或暫停時不會改速度；同一個狀況不會一直重複觸發', () => {
    const game = new Game(cycledTank(), DEFAULT_TIME_SCALE);
    const crises: string[] = [];
    game.onCrisis((c) => crises.push(c.reason));
    game.state.water.tan = 3;
    game.advance(60_000);
    expect(game.clock.timeScale).toBe(DEFAULT_TIME_SCALE);
    expect(crises).toEqual([]);
    // 已經知道氨很高，切快轉不會馬上又被拉回來
    game.clock.timeScale = 3600;
    game.advance(1000);
    expect(game.clock.timeScale).toBe(3600);
  });
});
