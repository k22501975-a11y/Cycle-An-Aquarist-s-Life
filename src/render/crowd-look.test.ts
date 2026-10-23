import { describe, expect, it } from 'vitest';
import { CROWD_WARN } from '../sim/split';
import { CROWD_SHOWS, crowdLook, gaspsAtSurface } from './crowd-look';

describe('缸太擠的畫面（midgame.md §7.1）', () => {
  it('80% 以下看不出來；80% 起分級，100% 以上水變混、一大半的魚到水面喘', () => {
    expect(crowdLook(0.5)).toEqual({ level: 0, murk: 0, gasp: 0 });
    expect(crowdLook(0.9).level).toBe(1);
    const full = crowdLook(1.05);
    expect(full.level).toBe(2);
    expect(full.gasp).toBeGreaterThanOrEqual(0.4);
    expect(full.murk).toBeGreaterThan(crowdLook(0.99).murk);
  });

  it('越擠越混、喘的越多，有上限', () => {
    const a = crowdLook(1.1);
    const b = crowdLook(2);
    expect(b.murk).toBeGreaterThan(a.murk);
    expect(b.gasp).toBeGreaterThan(a.gasp);
    expect(b.gasp).toBeLessThan(1);
    expect(b.murk).toBeLessThanOrEqual(0.22);
  });

  it('開始看得出來的門檻和 C14 出卡同一個', () => {
    expect(CROWD_SHOWS).toBe(CROWD_WARN);
  });

  it('喘的魚照編號固定挑，比例大致符合', () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    const share = ids.filter((id) => gaspsAtSurface(id, 0.5)).length / ids.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
    expect(ids.filter((id) => gaspsAtSurface(id, 0))).toEqual([]);
  });
});
