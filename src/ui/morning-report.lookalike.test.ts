import { describe, expect, it } from 'vitest';
import { addFish, createTank, economy, FILTERS, HEATERS, LIGHTS, LOOKALIKE_DAYS, simulate, TANKS } from '../sim';
import { morningReport, snapshot } from './morning-report';

describe('早上報告：長得像誰（polish-to-9.md G2）', () => {
  it('第一窩滿 12 天的那個早上出一條 lookalike，帶比較卡資料，點了看那尾小魚', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, seed: 21, matureMedia: true });
    s.fish = [];
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true, strain: 3 });
    mom.pregnancy = 0.99;
    simulate(s, 12);
    s.hours = economy(s).broodLog![0].hours + LOOKALIKE_DAYS * 24;
    const r = morningReport(snapshot([s]), [s], 12, null);
    const item = r.items.find((i) => i.kind === 'lookalike');
    expect(item).toMatchObject({ tone: 'good', action: 'fish', subjectId: item?.lookalike?.childId });
    expect(item!.lookalike!.motherId).toBe(mom.id);
    expect(item!.text).toMatch(/^小魚看得出像誰了！/);
    expect(morningReport(snapshot([s]), [s], 12, null).items.some((i) => i.kind === 'lookalike')).toBe(false);
  });
});
