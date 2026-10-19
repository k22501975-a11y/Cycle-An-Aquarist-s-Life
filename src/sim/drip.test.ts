import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import {
  addFish,
  bagWater,
  dripGrade,
  dripOutcome,
  dripReady,
  dripShock,
  dripTutorialLeft,
  PATIENT_DRIP,
  recordDrip,
  releaseShock,
  safeRate,
  startDrip,
  stepDrip,
  type DripSession,
  type WaterHabit,
} from '.';

const HARD: WaterHabit = { ph: 7.8, gh: 12, tempC: 26 };

function tank() {
  const s = newGameState(1);
  s.water.ph = s.water.phAvg = 6.6;
  s.water.tempC = s.water.tempAvgC = 24;
  return s;
}

/** 玩到可以放魚為止，每 0.1 秒照 rate(session) 開滴管；回傳花了幾秒。 */
function play(session: DripSession, rate: (s: DripSession) => number): number {
  while (!dripReady(session) && session.seconds < 300) stepDrip(session, rate(session), 0.1);
  return session.seconds;
}

describe('對水小遊戲（F5）', () => {
  it('照安全滴速慢慢滴：魚不緊張、拿到完美，時間在小遊戲長度內', () => {
    const s = tank();
    const session = startDrip(s, HARD);
    const secs = play(session, (x) => safeRate(x) * 0.95);
    expect(dripGrade(dripOutcome(session))).toBe('perfect');
    expect(secs).toBeGreaterThan(10);
    expect(secs).toBeLessThan(60);
    // 袋子裡的水已經接近缸水
    expect(Math.abs(bagWater(session).ph - s.water.ph)).toBeLessThan(0.35);
  });

  it('水差很多還開到最大：魚嚇到，算「太急」', () => {
    const session = startDrip(tank(), HARD);
    play(session, () => 1);
    expect(session.peakNervous).toBeGreaterThan(0.6);
    expect(dripGrade(dripOutcome(session))).toBe('rushed');
  });

  it('水本來就差不多：開到最大也不會嚇到', () => {
    const s = tank();
    const session = startDrip(s, { ph: s.water.ph, gh: 4, tempC: s.water.tempC });
    expect(safeRate(session)).toBeGreaterThan(0.5);
    play(session, () => 1);
    expect(session.peakNervous).toBeLessThan(0.3);
  });

  it('越滴越安全：袋子水變多以後可以開快一點', () => {
    const session = startDrip(tank(), HARD);
    const early = safeRate(session);
    play(session, (x) => safeRate(x) * 0.9);
    expect(safeRate(session)).toBeGreaterThan(early);
  });

  it('休克：沒滴等於直接倒、滴好等於傳統滴水對水，中間照比例', () => {
    const s = tank();
    const dumped = releaseShock(s, HARD, false);
    expect(dripShock(s, HARD, { gap: 1, rush: 0 })).toEqual(dumped);
    expect(dripShock(s, HARD, PATIENT_DRIP)).toEqual({ stress: 0, harm: 0 });
    const half = dripShock(s, HARD, { gap: 0.6, rush: 0 });
    expect(half.stress).toBeGreaterThan(0);
    expect(half.stress).toBeLessThan(dumped.stress);
    // 滴好了但過程嚇到，還是有一點緊迫
    expect(dripShock(s, HARD, { gap: 0.25, rush: 1 }).stress).toBeCloseTo(0.3);
  });

  it('買魚時傳對水結果：照結果算休克', () => {
    const s = tank();
    const calm = addFish(s, 'guppy', { carriesIch: false, carries: [], drip: PATIENT_DRIP });
    const rushed = addFish(s, 'guppy', { carriesIch: false, carries: [], drip: { gap: 0.9, rush: 1 } });
    expect(rushed.stress).toBeGreaterThan(calm.stress);
  });

  it('第一次一定要玩，之後預設一鍵慢慢過水（mvp.md §4.4.3）', () => {
    const s = tank();
    expect(dripTutorialLeft(s)).toBe(1);
    recordDrip(s);
    expect(dripTutorialLeft(s)).toBe(0);
  });
});
