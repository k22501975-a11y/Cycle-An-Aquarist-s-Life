import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, FISH_SPECIES, HEATERS, LIGHTS, TANKS } from '../sim';
import { morningReport, snapshot } from './morning-report';

describe('收納箱的小魚長到能賣（polish-to-9.md §13.7）', () => {
  it('早上報告說幾尾、約多少錢，點了撈出來賣；還太小不說', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 3, matureMedia: true });
    s.hours = 20;
    const fish = Array.from({ length: 3 }, () => addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false }));
    s.fish = [];
    for (const f of fish) Object.assign(f, { generation: 1, lengthCm: 1, ageDays: 5 });
    s.tub = { fish };
    const night = () => {
      const before = snapshot([s]);
      s.hours += 12;
      return morningReport(before, [s], 12, null).items.find((i) => i.kind === 'tub_ready');
    };
    expect(night()).toBeUndefined();
    fish[0].lengthCm = fish[1].lengthCm = FISH_SPECIES.guppy.adultLengthCm * 0.6;
    const line = night()!;
    expect(line).toMatchObject({ action: 'sell_tub', tone: 'good', count: 2, tank: 0 });
    expect(line.text).toMatch(/^收納箱有 2 尾長到能賣了，賣給阿德約 \d+ 元$/);
  });
});
