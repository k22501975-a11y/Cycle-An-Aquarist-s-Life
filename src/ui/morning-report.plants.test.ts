import { describe, expect, it } from 'vitest';
import { addFish, addPlant, BOX_DUE, buyNurseryBox, createTank, daysToBirth, DENSE_COVER, FILTERS, HEATERS, LIGHTS, plantCover, recordEvent, simulate, TANKS, type Fish, type TankState } from '../sim';
import { choiceState } from '../sim/choices';
import { morningReport, slimReport, snapshot } from './morning-report';

/** 養好水、一公一母孔雀魚、外面有 6 尾小魚的缸。 */
function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  for (const sex of ['male', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }).ageDays = 120;
  for (let i = 0; i < 6; i++) Object.assign(addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false }), { lengthCm: 0.8, ageDays: 3, generation: 1 });
  return s;
}

/** 過一晚：before 是睡前的快照，night 在快照之後動手腳。 */
function night(s: TankState, nightFn: () => void = () => {}) {
  const before = snapshot([s]);
  s.hours += 12;
  nightFn();
  return morningReport(before, [s], 12, null);
}

describe('主缸小魚被吃：讓水草成為解法（polish-to-9.md §12.2）', () => {
  it('草不夠密（< 60%）：被吃那行寫覆蓋率、教玩家種密一點，按鈕打開水草', () => {
    const s = tank();
    addPlant(s, 'moss', 4);
    const pct = Math.round(plantCover(s) * 100);
    expect(pct).toBeLessThan(DENSE_COVER * 100);
    const eaten = night(s, () => recordEvent(s, { type: 'fry_eaten', cause: 'guppy', count: 2 })).items.find((i) => i.kind === 'eaten')!;
    expect(eaten.text).toMatch(new RegExp(`^昨晚有 2 尾小魚.+。.+水草覆蓋 ${pct}%，再種密一點，小魚比較躲得住（莫絲、香菇草最好躲）$`));
    expect(eaten).toMatchObject({ action: 'shop_plants', goLabel: '種水草', tank: 0 });
  });

  it('建議的順序：快生的母魚、育幼盒空著就先叫玩家放盒子；盒子有小魚佔著才輪到種水草（§12.2 補充）', () => {
    const s = tank();
    addPlant(s, 'moss', 4);
    buyNurseryBox(s);
    const mom = s.fish.find((f) => f.sex === 'female')!;
    mom.pregnancy = BOX_DUE + 0.02;
    const eaten = () => night(s, () => recordEvent(s, { type: 'fry_eaten', cause: 'guppy', count: 2 })).items.find((i) => i.kind === 'eaten')!;
    const first = eaten();
    expect(first.text).toMatch(/快生了，育幼盒空著，先把她放進去，這一窩就一尾都不會被吃$/);
    expect(first).toMatchObject({ action: 'nursery_soon', goLabel: '放進盒子', tank: 0 });
    // 還沒到 0.88：太早放母魚會緊迫，照舊教種水草
    mom.pregnancy = BOX_DUE - 0.1;
    expect(eaten()).toMatchObject({ action: 'shop_plants' });
    // 盒子裡有小魚佔著：放不進去，也是種水草
    mom.pregnancy = BOX_DUE + 0.02;
    s.fish.find((f) => f.generation === 1)!.nursery = true;
    expect(eaten()).toMatchObject({ action: 'shop_plants' });
  });

  it('第一次種到夠密、昨晚小魚一尾都沒被吃：說一行，之後不再說', () => {
    const s = tank();
    addPlant(s, 'moss', 20);
    expect(plantCover(s)).toBeGreaterThanOrEqual(DENSE_COVER);
    const echo = () => night(s).items.filter((i) => i.kind === 'echo').map((i) => i.text);
    expect(echo()).toEqual(['水草夠密了，昨晚沒有小魚被吃']);
    expect(choiceState([s]).denseNoted).toBe(true);
    expect(echo()).toEqual([]);
  });
});

describe('開獎倒數（polish-to-9.md §12.1）', () => {
  /** 讓留種那對的母魚懷著那尾公魚的（夢想窩），剩 days 天左右生。 */
  function due(s: TankState, mom: Fish, days: number) {
    const dad = s.fish.find((f) => f.sex === 'male' && f.ageDays === 120)!;
    choiceState([s]).pair = [mom.id, dad.id];
    mom.sire = { id: dad.id, lineage: dad.id, inbreeding: 0, genome: dad.genome! };
    mom.pregnancy = 0.5;
    const total = daysToBirth(s, mom)! * 2;
    mom.pregnancy = 1 - days / total;
  }

  it('剩 3 天內，報告第一行寫「開獎倒數 n 天」，帶母魚的 id，點了看她', () => {
    const s = tank();
    const mom = s.fish.find((f) => f.sex === 'female')!;
    due(s, mom, 2.5);
    const r = night(s);
    expect(mom.dreamBrood).toBe(true);
    const first = slimReport(r).lines[0];
    expect(first).toMatchObject({ kind: 'countdown', text: '開獎倒數 3 天', action: 'fish', subjectId: mom.id, countdown: { days: 3, momId: mom.id } });
  });

  it('還早（超過 3 天）或不是夢想窩：不倒數', () => {
    const s = tank();
    const mom = s.fish.find((f) => f.sex === 'female')!;
    due(s, mom, 6);
    expect(night(s).items.some((i) => i.kind === 'countdown')).toBe(false);
    // 懷的是別尾公魚的：不是夢想窩
    due(s, mom, 2);
    mom.sire!.id = -1;
    expect(night(s).items.some((i) => i.kind === 'countdown')).toBe(false);
    expect(mom.dreamBrood).toBeUndefined();
    // 開獎過了：之後的窩不再標夢想窩
    due(s, mom, 2);
    choiceState([s]).reveal = { momId: mom.id, hours: s.hours, done: true };
    expect(night(s).items.some((i) => i.kind === 'countdown')).toBe(false);
    expect(mom.dreamBrood).toBeUndefined();
  });

  it('夢想窩的母魚生了就清掉標記', () => {
    const s = tank();
    const mom = s.fish.find((f) => f.sex === 'female')!;
    due(s, mom, 2);
    night(s);
    expect(mom.dreamBrood).toBe(true);
    mom.pregnancy = 0.9999;
    simulate(s, 2);
    expect(mom.pregnancy).toBeLessThan(0.5);
    expect(mom.dreamBrood).toBeUndefined();
  });
});
