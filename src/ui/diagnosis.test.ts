import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, HEATERS, infect, LIGHTS, TANKS, type DiseaseKind, type TankState } from '../sim';
import { causeAdvice } from './owner-advice';
import { newProgress, pendingTip } from './tutorial';

/** 養好水、水質正常的缸。 */
function cycled(): TankState {
  return createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 7, matureMedia: true });
}

function sick(s: TankState, kind: DiseaseKind) {
  const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
  infect(f, kind);
  f.infections![0].stage = 'visible';
  f.infections![0].progress = 1;
  return f;
}

describe('老闆依實際病因診斷（#118）', () => {
  it('水質正常、魚帶鰓吸蟲在喘：老闆說是鰓吸蟲、要下驅蟲藥，不是說缺氧', () => {
    const s = cycled();
    sick(s, 'flukes');
    const tip = pendingTip(newProgress(), s)!;
    expect(tip.id).toBe('flukes');
    expect(tip.text).toContain('鰓吸蟲');
    expect(tip.text).toContain('驅蟲藥');
    expect(tip.text).not.toContain('打氣機');
  });

  it('柱狀病：老闆說是柱狀病、要下抗生素、隔離', () => {
    const s = cycled();
    sick(s, 'columnaris');
    const tip = pendingTip(newProgress(), s)!;
    expect(tip.id).toBe('columnaris');
    expect(tip.text).toContain('抗生素');
  });

  it('真的缺氧才說缺氧', () => {
    const s = cycled();
    addFish(s, 'guppy', { carriesIch: false, carries: [] });
    s.water.o2 = 2;
    expect(pendingTip(newProgress(), s)?.id).toBe('gasping');
    const t = cycled();
    sick(t, 'flukes');
    expect(pendingTip({ ...newProgress(), seenTips: ['flukes'] }, t)?.id).not.toBe('gasping');
  });

  it('點魚問「為什麼」：生病的魚先講病名和藥', () => {
    const s = cycled();
    const f = sick(s, 'flukes');
    const text = causeAdvice('孔雀魚 #1', [{ key: 'oxygen', label: '缺氧' }], f);
    expect(text).toContain('鰓吸蟲');
    expect(text).toContain('驅蟲藥');
  });
});
