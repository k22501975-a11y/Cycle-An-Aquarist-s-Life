import { describe, expect, it } from 'vitest';
import { freeAmmoniaFraction, oxygenSaturation, phFromCo2 } from './chemistry';

describe('水化學', () => {
  it('pH 與水溫越高，游離氨（有毒）比例越高', () => {
    expect(freeAmmoniaFraction(8, 25)).toBeGreaterThan(freeAmmoniaFraction(7, 25) * 5);
    expect(freeAmmoniaFraction(7.5, 30)).toBeGreaterThan(freeAmmoniaFraction(7.5, 20));
    expect(freeAmmoniaFraction(7, 25)).toBeCloseTo(0.0056, 3);
  });

  it('25°C 淡水飽和溶氧約 8.3 mg/L，水溫越高越低', () => {
    expect(oxygenSaturation(25)).toBeCloseTo(8.3, 1);
    expect(oxygenSaturation(30)).toBeLessThan(oxygenSaturation(20));
  });

  it('CO₂ 越多 pH 越低；KH 越低，同樣 CO₂ 讓 pH 掉更多', () => {
    expect(phFromCo2(4, 30)).toBeCloseTo(6.6, 1);
    expect(phFromCo2(4, 30)).toBeLessThan(phFromCo2(4, 3));
    expect(phFromCo2(1, 30)).toBeLessThan(phFromCo2(4, 30));
  });
});
