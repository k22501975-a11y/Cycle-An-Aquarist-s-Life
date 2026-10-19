import { describe, expect, it } from 'vitest';
import { addFish, addHardscape, addPlant, applySetup, buyQuarantine, economy, HARDSCAPE, createTank, feed, FILTERS, HEATERS, RECOMMENDED_SETUP, TANKS, useTestKit, waterChange } from '../sim';
import { advanceQuest, currentQuest, cycleProgress, loadProgress, newProgress, overloadWarning, pairProgress, pendingTip, questShopTab, QUESTS, saveProgress } from './tutorial';

function tank() {
  return createTank({ tank: TANKS.std40, filter: FILTERS.sponge, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 5 });
}

describe('新手引導任務', () => {
  it('照順序一步步完成，每次只前進一步', () => {
    const s = tank();
    economy(s).setupPending = true;
    const p = newProgress();
    expect(currentQuest(p)?.id).toBe('setup');
    expect(advanceQuest(p, s)).toBeNull();
    expect(applySetup(s, RECOMMENDED_SETUP)).toBeNull();
    expect(advanceQuest(p, s)?.id).toBe('setup');
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
    // 等養水的空檔：擺造景、取名字
    expect(currentQuest(p)?.id).toBe('scape');
    addHardscape(s, HARDSCAPE.lava);
    expect(advanceQuest(p, s)?.id).toBe('scape');
    s.label = '第一缸';
    expect(advanceQuest(p, s)?.id).toBe('name');
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

  it('新手獎勵加起來 800（第 21 天買第二缸靠它，mvp.md §4.3）', () => {
    expect(QUESTS.reduce((a, q) => a + q.reward, 0)).toBe(800);
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

  it('任務清單改了，舊進度照任務 id 對回來：做完教學的不會重跑、重領獎勵', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: () => {} };
    const idx = (id: string) => QUESTS.findIndex((q) => q.id === id);
    // 存的時候記任務 id
    saveProgress(store, { step: idx('cycled'), skipped: false, seenTips: [] });
    expect(JSON.parse(data.get('cycle.tutorial.v1')!).quest).toBe('cycled');
    // id 比數字優先（例如前面又插了新任務，數字已經對不上）
    data.set('cycle.tutorial.v1', '{"step":2,"quest":"babies","seenTips":[]}');
    expect(loadProgress(store).step).toBe(idx('babies'));
    data.set('cycle.tutorial.v1', '{"step":2,"quest":"done","seenTips":[]}');
    expect(loadProgress(store).step).toBe(QUESTS.length);
    // 只有數字的舊存檔照舊的 7 個任務換算：做完（7）還是做完；第 5 個（養水）對到現在的養水
    data.set('cycle.tutorial.v1', '{"step":7,"seenTips":[]}');
    expect(loadProgress(store).step).toBe(QUESTS.length);
    data.set('cycle.tutorial.v1', '{"step":5,"seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('cycled');
    data.set('cycle.tutorial.v1', '{"step":1,"seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('test');
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

describe('新手卡關（玩家體驗評測第 1 輪）', () => {
  it('換水任務：不用等測到氨，先換一次就過', () => {
    const q = QUESTS.find((x) => x.id === 'water')!;
    expect(q.lines[0]).toContain('先試一次換水');
    const s = tank();
    addFish(s, 'guppy');
    s.hours = 10;
    expect(q.check(s)).toBe(false);
    waterChange(s, 0.3);
    expect(q.check(s)).toBe(true);
  });

  it('養水任務和任務卡都不看硝酸鹽', () => {
    const q = QUESTS.find((x) => x.id === 'cycled')!;
    expect([q.title, ...q.lines].join('')).not.toMatch(/(?<!亞)硝酸鹽/);
  });

  it('新缸一次放太多魚，買之前老闆提醒；有檢疫盒或缸養好了就不提醒', () => {
    const s = tank();
    expect(overloadWarning(s, 3)).toBeNull();
    expect(overloadWarning(s, 18)).toMatch(/18 條.*容易生病/);
    for (let i = 0; i < 3; i++) addFish(s, 'guppy');
    expect(overloadWarning(s, 1)).not.toBeNull();
    const boxed = tank();
    buyQuarantine(boxed);
    expect(overloadWarning(boxed, 18)).toBeNull();
    const cycled = tank();
    cycled.bacteria.aob = cycled.bacteria.nob = 1;
    cycled.water.tan = cycled.water.no2 = 0;
    expect(overloadWarning(cycled, 18)).toBeNull();
  });

  it('新缸 pH 8 左右會解釋這是正常的', () => {
    const s = tank();
    s.lastTest = { hours: s.hours, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 8.2, kh: 6 } };
    expect(pendingTip(newProgress(), s)?.id).toBe('alkaline');
  });

  it('養好水了但孔雀魚都同一種性別：老闆提醒要一公一母', () => {
    const s = tank();
    s.bacteria.aob = s.bacteria.nob = 1;
    s.water.tan = s.water.no2 = 0;
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { sex: 'male', carriesIch: false });
    expect(pendingTip(newProgress(), s)?.id).toBe('pair');
    addFish(s, 'guppy', { sex: 'female', carriesIch: false });
    expect(pendingTip(newProgress(), s)).toBeNull();
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

  it('養水任務的老闆說明有講要等多久、怎麼加快', () => {
    const lines = QUESTS.find((q) => q.id === 'cycled')!.lines.join('');
    expect(lines).toContain('4～7 天');
    expect(lines).toContain('硝化菌液');
  });
});

describe('任務直接帶到商店對應的分頁', () => {
  it('種水草的任務開水草頁、放魚開魚頁、養水開設備頁', () => {
    const p = newProgress();
    p.step = QUESTS.findIndex((q) => q.id === 'plant');
    expect(questShopTab(p)).toBe('plants');
    p.step = QUESTS.findIndex((q) => q.id === 'fish');
    expect(questShopTab(p)).toBe('fish');
    p.step = QUESTS.findIndex((q) => q.id === 'cycled');
    expect(questShopTab(p)).toBe('gear');
  });

  it('不用買東西的任務、跳過教學都照原本的頁', () => {
    const p = newProgress();
    p.step = QUESTS.findIndex((q) => q.id === 'test');
    expect(questShopTab(p)).toBeNull();
    p.step = 0;
    p.skipped = true;
    expect(questShopTab(p)).toBeNull();
  });
});

describe('等母魚懷孕的任務卡', () => {
  it('進度是自己的（公母幾尾），不是上一個任務的硝化菌', () => {
    const s = tank();
    expect(pairProgress(s)).toContain('要有公有母');
    addFish(s, 'guppy', { sex: 'male' });
    addFish(s, 'guppy', { sex: 'female' });
    expect(pairProgress(s)).toBe('公 1・母 1');
    expect(QUESTS.find((q) => q.id === 'babies')?.progress).toBe(pairProgress);
  });
});
