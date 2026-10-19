import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, feed, FILTERS, HEATERS, TANKS, useTestKit, waterChange } from '../sim';
import { advanceQuest, currentQuest, cycleProgress, loadProgress, newProgress, pendingTip, QUESTS, saveProgress } from './tutorial';

function tank() {
  return createTank({ tank: TANKS.std40, filter: FILTERS.sponge, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 5 });
}

describe('新手引導任務', () => {
  it('照順序一步步完成，每次只前進一步', () => {
    const s = tank();
    const p = newProgress();
    expect(currentQuest(p)?.id).toBe('plant');
    expect(advanceQuest(p, s)).toBeNull();
    addPlant(s, 'anubias');
    useTestKit(s);
    expect(advanceQuest(p, s)?.id).toBe('plant');
    expect(advanceQuest(p, s)?.id).toBe('test');
    expect(advanceQuest(p, s)).toBeNull();
    addFish(s, 'guppy');
    expect(advanceQuest(p, s)?.id).toBe('fish');
    feed(s, 5);
    expect(advanceQuest(p, s)?.id).toBe('feed');
    s.hours = 30;
    waterChange(s, 0.3);
    expect(advanceQuest(p, s)?.id).toBe('water');
    expect(currentQuest(p)?.id).toBe('cycled');
  });

  it('養水完成要硝化菌長好、氨 0、亞硝 0，而且是一天內測的；不用等到測得到硝酸鹽', () => {
    const s = tank();
    addFish(s, 'guppy');
    const p = { ...newProgress(), step: QUESTS.findIndex((q) => q.id === 'cycled') };
    // 剛放魚：測到 0 但硝化菌還沒長起來
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(advanceQuest(p, s)).toBeNull();
    s.bacteria.aob = s.bacteria.nob = 0.5;
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0.25, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(advanceQuest(p, s)).toBeNull();
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    s.hours = 30;
    expect(advanceQuest(p, s)).toBeNull();
    s.hours = 5;
    expect(advanceQuest(p, s)?.id).toBe('cycled');
  });

  it('跳過後就沒有任務', () => {
    const p = { ...newProgress(), skipped: true };
    expect(currentQuest(p)).toBeNull();
  });

  it('進度存得起來，壞掉的存檔回到開頭', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: () => {} };
    saveProgress(store, { step: 3, skipped: false, seenTips: ['ich'] });
    expect(loadProgress(store)).toEqual({ step: 3, skipped: false, seenTips: ['ich'] });
    data.set('cycle.tutorial.v1', '{"step":99,"seenTips":[1,"x"]}');
    expect(loadProgress(store)).toEqual({ step: QUESTS.length, skipped: false, seenTips: ['x'] });
  });
});

describe('情境提示', () => {
  it('剛測到氨會提醒，同一個提示只說一次', () => {
    const s = tank();
    const p = newProgress();
    expect(pendingTip(p, s)).toBeNull();
    s.lastTest = { hours: s.hours, reading: { ammonia: 1, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    const tip = pendingTip(p, s);
    expect(tip?.id).toBe('ammonia');
    p.seenTips.push(tip!.id);
    expect(pendingTip(p, s)).toBeNull();
  });

  it('有死魚、加熱棒卡住時提醒', () => {
    const s = tank();
    addFish(s, 'guppy').alive = false;
    expect(pendingTip(newProgress(), s)?.id).toBe('dead');
    const s2 = tank();
    s2.equipment.heater!.stuckOn = true;
    expect(pendingTip(newProgress(), s2)?.id).toBe('heater');
  });
});

describe('養水任務進度', () => {
  it('照上次測水顯示氨、亞硝和硝化菌長到幾成', () => {
    const s = tank();
    expect(cycleProgress(s)).toBe('還沒測過水');
    s.hours = 10;
    s.lastTest = { hours: 10, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    s.bacteria.aob = 0.15;
    s.bacteria.nob = 0.06;
    expect(cycleProgress(s)).toBe('硝化菌 20%（上次測水）');
    s.lastTest = { hours: 10, reading: { ammonia: 0.5, nitrite: 0.25, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(cycleProgress(s)).toBe('亞硝 0.25・氨 0.5・硝化菌 20%（上次測水）');
    s.hours = 40;
    expect(cycleProgress(s)).toContain('再測一次');
  });

  it('養水任務有等待提示，其他任務沒有', () => {
    expect(QUESTS.find((q) => q.id === 'cycled')?.hint).toContain('3～7 天');
    expect(QUESTS.find((q) => q.id === 'plant')?.hint).toBeUndefined();
  });
});
