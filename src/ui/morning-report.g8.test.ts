import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, economy, takeStoreFemales, FILTERS, HEATERS, LIGHTS, PLANT_SPECIES, recordEvent, TANKS, testWater, type TankState } from '../sim';
import { choiceState } from '../sim/choices';
import { morningReport, snapshot } from './morning-report';

/** 養好水、一株小榕、一公兩母孔雀魚（都沒懷孕）的缸。 */
function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false });
  return s;
}

function reportAfter(change: (s: TankState) => void, s = tank()) {
  const before = snapshot([s]);
  change(s);
  return morningReport(before, [s], 12, null);
}

const item = (r: ReturnType<typeof reportAfter>, kind: string) => r.items.find((i) => i.kind === kind);
const mom = (s: TankState) => s.fish.find((f) => f.sex === 'female')!;

describe('早上報告寫缸裡真的發生的事（polish-to-9.md G8）', () => {
  it('母魚肚子：過 0.5 圓起來、過快生的程度出現胎斑，沒變階段不寫', () => {
    const s = tank();
    mom(s).pregnancy = 0.4;
    expect(item(reportAfter((x) => (mom(x).pregnancy = 0.55), s), 'belly')).toMatchObject({ tone: 'good', text: '母魚的肚子圓起來了，看得出懷孕', subjectId: mom(s).id });
    expect(item(reportAfter((x) => (mom(x).pregnancy = 0.7), s), 'belly')).toBeUndefined();
    expect(item(reportAfter((x) => (mom(x).pregnancy = 0.96), s), 'belly')?.text).toBe('母魚肚子後面出現黑色胎斑，快生了');
  });

  it('開局第一次買的快生母魚（polish-to-9.md §7.1）：隔天說胎斑變大，快生時說看得到眼睛，不寫一般的胎斑那行', () => {
    const s = tank();
    s.fish = s.fish.filter((f) => f.sex === 'male');
    const [due] = takeStoreFemales(s, 3, 1);
    expect(due).toBeGreaterThanOrEqual(0.88);
    const first = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', strain: 3, pregnancy: due });
    expect(economy(s).firstMomId).toBe(first.id);
    const belly = (r: ReturnType<typeof reportAfter>) => r.items.filter((i) => i.kind === 'belly').map((i) => i.text);
    expect(belly(reportAfter(() => {}, s))).toEqual([expect.stringMatching(/的胎斑變大、變黑了，再兩三天就生$/)]);
    expect(belly(reportAfter(() => {}, s))).toEqual([]);
    expect(belly(reportAfter((x) => (x.fish.find((f) => f.id === first.id)!.pregnancy = 0.95), s))).toEqual(['胎斑裡看得到小魚的眼睛了！快生了']);
    // 之後再買的母魚照一般規則
    expect(takeStoreFemales(s, 3, 1)[0]).toBeLessThan(0.8);
  });

  it('夢想魚那窩的母魚：開獎前由里程碑說，開獎後之後每一胎照常寫肚子圓起來（#326）', () => {
    const s = tank();
    mom(s).pregnancy = 0.4;
    choiceState([s]).reveal = { momId: mom(s).id, hours: 0 };
    const round = (r: ReturnType<typeof reportAfter>) => r.items.find((i) => i.kind === 'belly' && i.text === '母魚的肚子圓起來了，看得出懷孕');
    expect(round(reportAfter((x) => (mom(x).pregnancy = 0.55), s))).toBeUndefined();
    choiceState([s]).reveal!.done = true;
    mom(s).pregnancy = 0.4;
    expect(round(reportAfter((x) => (mom(x).pregnancy = 0.55), s))).toMatchObject({ subjectId: mom(s).id });
  });

  it('公魚追母魚：昨晚配對成功就寫一條，配圖用公魚', () => {
    const s = tank();
    const male = s.fish.find((f) => f.sex === 'male')!;
    const r = reportAfter((x) => recordEvent(x, { type: 'mated', subjectId: mom(x).id, cause: String(male.id) }), s);
    expect(item(r, 'courtship')).toMatchObject({ tone: 'good', action: 'fish', subjectId: male.id });
    expect(item(reportAfter(() => {}), 'courtship')).toBeUndefined();
  });

  it('自己繁殖的小魚長過 1 公分：游出水草搶飼料', () => {
    const s = tank();
    const fry = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    fry.lengthCm = 0.95;
    fry.generation = 1;
    const r = reportAfter(() => (fry.lengthCm = 1.02), s);
    expect(item(r, 'fry_grew')).toMatchObject({ subjectId: fry.id, count: 1, text: '1 尾小魚長到 1 公分，開始游出水草搶飼料了' });
    expect(item(reportAfter(() => (fry.lengthCm = 1.1), s), 'fry_grew')).toBeUndefined();
  });

  it('水草多長一片葉子寫「長出新葉」，這晚不另外寫長了幾 %', () => {
    const s = tank();
    const plant = s.plants[0];
    const leafG = PLANT_SPECIES.anubias.cuttingMassG / 4;
    plant.biomassG = leafG * 3 - 0.05;
    const r = reportAfter(() => (plant.biomassG = leafG * 3 + 0.05), s);
    expect(item(r, 'new_leaf')).toMatchObject({ tone: 'info', text: '小榕長出新葉了', plantId: plant.id });
    expect(item(r, 'plant_grew')).toBeUndefined();
    // 還在同一片葉子裡長：照舊寫長了幾 %
    plant.biomassG = leafG * 3 + 0.05;
    const grew = reportAfter(() => (plant.biomassG *= 1.02), s);
    expect(item(grew, 'new_leaf')).toBeUndefined();
    expect(item(grew, 'plant_grew')).toBeDefined();
  });

  it('測到氨、測完換了水、讀數降下來：你救回來了，每缸只說一次', () => {
    const s = tank();
    s.water.tan = 0.6;
    s.lastTest = { hours: s.hours, reading: testWater(s) };
    s.lastWaterChangeHours = s.hours + 0.5;
    s.water.tan = 0.3;
    const r = reportAfter(() => {}, s);
    expect(item(r, 'rescued')).toMatchObject({ tone: 'good', text: '換完水，氨讀數降下來了：你救回來了', action: 'test_water' });
    expect(s.rescueNoted).toBe(true);
    expect(item(reportAfter(() => {}, s), 'rescued')).toBeUndefined();
    // 沒換水不算
    const lazy = tank();
    lazy.water.tan = 0.6;
    lazy.lastTest = { hours: lazy.hours, reading: testWater(lazy) };
    expect(item(reportAfter((x) => (x.water.tan = 0.3), lazy), 'rescued')).toBeUndefined();
  });
});
