import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { dripAdviceSeconds, dripGrade, dripOutcome, dripReady, farmHabit, FISH_SPECIES, safeRate, startDrip, stepDrip, type FishSpeciesId, type WaterHabit } from '../sim';
import { nextValve } from './drip-game';

/** 魚場的水跟缸差很多（pH 差 1.2、水溫差 2 度）。 */
const HARD: WaterHabit = { ph: 7.8, gh: 12, tempC: 26 };

describe('對水小遊戲的滴管（#197）', () => {
  it('從頭按住到底：滴管停在綠線上，魚不緊張，對得剛剛好', () => {
    const s = newGameState(1);
    s.water.ph = s.water.phAvg = 6.6;
    s.water.tempC = s.water.tempAvgC = 24;
    const session = startDrip(s, HARD);
    let rate = 0;
    while (!dripReady(session) && session.seconds < 120) {
      rate = nextValve(rate, true, safeRate(session), 0.05);
      expect(rate).toBeLessThanOrEqual(safeRate(session) + 1e-9);
      stepDrip(session, rate, 0.05);
    }
    expect(dripReady(session)).toBe(true);
    expect(session.peakNervous).toBe(0);
    expect(dripGrade(dripOutcome(session))).toBe('perfect');
    // 小遊戲不會拖太久
    expect(session.seconds).toBeLessThan(60);
  });

  it('放開就慢慢關小，按住會從現在的開度往綠線走', () => {
    expect(nextValve(0.5, false, 0.3, 0.1)).toBeCloseTo(0.36);
    expect(nextValve(0, true, 0.3, 0.1)).toBeCloseTo(0.07);
    expect(nextValve(0.29, true, 0.3, 0.1)).toBeCloseTo(0.3);
    expect(nextValve(0.6, true, 0.3, 0.1)).toBeCloseTo(0.46);
  });
});

describe('對水的時長（mvp.md §4.4.3）', () => {
  it('每一種魚照建議按住，壓縮後 45 秒內可以放魚，魚不緊張', () => {
    const s = newGameState(1);
    for (const species of Object.keys(FISH_SPECIES) as FishSpeciesId[]) {
      const session = startDrip(s, farmHabit(species));
      const speed = Math.max(1, dripAdviceSeconds(session.from, session.to) / 40);
      let rate = 0;
      let real = 0;
      while (!dripReady(session) && real < 120) {
        rate = nextValve(rate, true, safeRate(session), 0.05);
        stepDrip(session, rate, 0.05 * speed);
        real += 0.05;
      }
      expect(real, species).toBeLessThanOrEqual(45);
      expect(session.peakNervous, species).toBe(0);
    }
  });
});
