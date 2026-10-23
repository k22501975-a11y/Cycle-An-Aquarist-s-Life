import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, CROWD_DEATHS_PER_DAY, CROWD_NOTICES_BEFORE_DEATH, crowdingRatio, linkTanks, step } from './index';

/** 超過建議量的缸擠死魚是逐步的（midgame.md §7.1）：提醒過兩次才會死，一天最多 2 尾。 */
describe('擠缸死魚', () => {
  const crowded = (seed = 5) => {
    const s = newGameState(seed);
    while (crowdingRatio(s) < 1.3) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    // 快不行的魚：體力只剩一點點、水裡的氨很高
    const weak = s.fish.slice(0, 5);
    for (const f of weak) f.health = 1e-4;
    s.water.tan = 8;
    return { s, weak };
  };

  it(`還沒提醒過 ${CROWD_NOTICES_BEFORE_DEATH} 次：撐著不死（奄奄一息）`, () => {
    const { s, weak } = crowded();
    s.crowdNotices = CROWD_NOTICES_BEFORE_DEATH - 1;
    step(s);
    expect(weak.every((f) => f.alive)).toBe(true);
  });

  it(`提醒過了：一天最多擠死 ${CROWD_DEATHS_PER_DAY} 尾`, () => {
    const { s, weak } = crowded();
    s.crowdNotices = CROWD_NOTICES_BEFORE_DEATH;
    step(s);
    step(s);
    expect(weak.filter((f) => !f.alive)).toHaveLength(CROWD_DEATHS_PER_DAY);
  });

  it(`好幾缸一起擠：全家一天最多擠死 ${CROWD_DEATHS_PER_DAY} 尾`, () => {
    const a = crowded(5);
    const b = crowded(6);
    linkTanks([a.s, b.s]);
    a.s.crowdNotices = b.s.crowdNotices = CROWD_NOTICES_BEFORE_DEATH;
    b.s.hours = a.s.hours;
    for (let i = 0; i < 2; i++) for (const t of [a.s, b.s]) step(t);
    expect([...a.weak, ...b.weak].filter((f) => !f.alive)).toHaveLength(CROWD_DEATHS_PER_DAY);
  });
});
