import { describe, expect, it } from 'vitest';
import { dirtSpots, floorY, frontLip, sandSurface, substrateLook } from './substrate';

describe('底沙這一層', () => {
  it('依底材換外觀，沒鋪就是裸缸', () => {
    expect(substrateLook('soil')).toBe('soil');
    expect(substrateLook('coral')).toBe('coral');
    expect(substrateLook('sand')).toBe('sand');
    expect(substrateLook(undefined)).toBe('bare');
  });

  it('前低後高：前玻璃那條邊比沙面低，東西停在兩者之間', () => {
    for (const x of [0, 200, 545, 800, 1000]) {
      const top = sandSurface('soil', x, 1000, 500, 1);
      const lip = frontLip('soil', x, 1000, 500, 1);
      const floor = floorY('soil', x, 1000, 500, 1);
      expect(lip).toBeGreaterThan(top + 10);
      expect(floor).toBeGreaterThan(top);
      expect(floor).toBeLessThan(lip);
    }
  });

  it('沙面有起伏，而且連續（兩段接得起來）', () => {
    expect(sandSurface('sand', 270, 1000, 500, 1)).toBeLessThan(sandSurface('sand', 800, 1000, 500, 1));
    expect(Math.abs(sandSurface('sand', 544.9, 1000, 500, 1) - sandSurface('sand', 545.1, 1000, 500, 1))).toBeLessThan(0.5);
  });

  it('平常沙面幾乎乾淨，餵太多髒點越積越多，有上限', () => {
    expect(dirtSpots(1.5)).toBe(0);
    expect(dirtSpots(5)).toBeGreaterThan(dirtSpots(3));
    expect(dirtSpots(100)).toBe(48);
  });
});
