import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, feed, FILTERS, HEATERS, TANKS, useTestKit, waterChange } from '../sim';
import { advanceQuest, currentQuest, loadProgress, newProgress, pendingTip, QUESTS, saveProgress } from './tutorial';

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

  it('養水完成要氨 0、亞硝 0 且測得到硝酸鹽，而且是一天內測的', () => {
    const s = tank();
    addFish(s, 'guppy');
    const p = { ...newProgress(), step: QUESTS.findIndex((q) => q.id === 'cycled') };
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0.25, nitrate: 10, ph: 7.2, kh: 4 } };
    expect(advanceQuest(p, s)).toBeNull();
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 10, ph: 7.2, kh: 4 } };
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
