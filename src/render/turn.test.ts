import { describe, expect, it } from 'vitest';
import { stepTurn, turnScale, type TurnState } from './fish-motion';

describe('轉身壓扁回彈', () => {
  it('往右游會轉成朝右，途中經過窄窄的側面，轉完稍微衝過頭再彈回', () => {
    const s: TurnState = { f: 1, v: 0 };
    let min = Infinity, passedZero = false;
    for (let i = 0; i < 180; i++) {
      stepTurn(s, 10, 1 / 60);
      if (Math.abs(s.f) < 0.2) passedZero = true;
      min = Math.min(min, s.f);
    }
    expect(passedZero).toBe(true);
    expect(min).toBeLessThan(-1);
    expect(s.f).toBeCloseTo(-1, 1);
  });

  it('慢慢漂的魚不會左右亂轉', () => {
    const s: TurnState = { f: -1, v: 0 };
    for (let i = 0; i < 60; i++) stepTurn(s, 0.2 * (i % 2 ? 1 : -1), 1 / 60);
    expect(s.f).toBeCloseTo(-1);
  });

  it('轉到一半身體窄、稍微變高；衝過頭時變扁', () => {
    expect(Math.abs(turnScale(0).sx)).toBeCloseTo(0.15);
    expect(turnScale(0).sy).toBeGreaterThan(1);
    expect(turnScale(1).sy).toBeCloseTo(1);
    expect(turnScale(-1.1).sy).toBeLessThan(1);
    expect(turnScale(-1.1).sx).toBeLessThan(-1);
  });
});
