import { describe, expect, it } from 'vitest';
import { createTank, FILTERS, LIGHTS, TANKS } from '../sim';
import { dayLight, flowNear } from './daylight';

function at(hour: number) {
  const s = createTank({ tank: TANKS.nano20, filter: FILTERS.hangOn, light: { spec: LIGHTS.basic, startHour: 9, photoperiodHours: 8 } });
  s.hours = 24 * 3 + hour;
  return s;
}

describe('燈的時間表（V2）', () => {
  it('剛開燈慢慢亮、中午最亮、關燈前漸暗偏橘、關燈後是 0', () => {
    const early = dayLight(at(9.3));
    const noon = dayLight(at(13));
    const dusk = dayLight(at(16.5));
    expect(early.level).toBeLessThan(0.5);
    expect(early.warm).toBeLessThan(0);
    expect(noon.level).toBeGreaterThan(0.95);
    expect(dusk.level).toBeLessThan(noon.level);
    expect(dusk.warm).toBeGreaterThan(0);
    expect(dayLight(at(18)).level).toBe(0);
  });

  it('靠近出水口的水草擺得比較大', () => {
    const s = at(12);
    expect(flowNear(s, 0.86)).toBeGreaterThan(flowNear(s, 0.1) * 1.5);
    s.equipment.filter!.on = false;
    expect(flowNear(s, 0.86)).toBeLessThan(0.5);
  });
});
