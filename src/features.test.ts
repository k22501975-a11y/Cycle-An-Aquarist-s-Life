import { describe, expect, it } from 'vitest';
import { parseFeatures } from './features';

describe('MVP 功能開關', () => {
  it('預設雲端、市場、好友、商城、短鯛都關著；可以用清單打開', () => {
    expect(Object.values(parseFeatures(undefined)).some(Boolean)).toBe(false);
    const f = parseFeatures('market, cloudSave');
    expect(f.market && f.cloudSave).toBe(true);
    expect(f.friends).toBe(false);
  });
});
