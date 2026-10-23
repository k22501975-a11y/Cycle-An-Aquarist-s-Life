import { describe, expect, it } from 'vitest';
import { BELLY_SHOWS } from '../sim/nursery';
import { PREGNANCY_STAGE_AT, pregnancyStage, pregnancySvg } from './pregnancy-badge';

describe('商店母魚卡的懷孕程度（midgame.md §6.6）', () => {
  it('分三級：剛懷上、肚子圓了、快生了；沒懷孕不標', () => {
    expect(pregnancyStage(0)).toBeNull();
    expect(pregnancyStage(0.3)).toBe('early');
    expect(pregnancyStage(0.6)).toBe('round');
    expect(pregnancyStage(0.86)).toBe('due');
  });

  it('「肚子圓了」和早上報告說肚子圓起來是同一個門檻', () => {
    expect(PREGNANCY_STAGE_AT.round).toBe(BELLY_SHOWS);
  });

  it('越後面肚子越鼓、胎斑越黑', () => {
    const spot = (svg: string) => Number(/opacity="([\d.]+)"\/><\/svg>/.exec(svg)?.[1]);
    const [a, b, c] = (['early', 'round', 'due'] as const).map(pregnancySvg);
    expect(spot(a)).toBeLessThan(spot(b));
    expect(spot(b)).toBeLessThan(spot(c));
  });
});
