import { describe, expect, it } from 'vitest';
import { addFish, addHardscape, addPlant, applySetup, buyQuarantine, checkGoals, goalState, GOALS, isCycled, powerOn, moveToQuarantine, recordEvent, economy, HARDSCAPE, createTank, feed, FILTERS, HEATERS, RECOMMENDED_SETUP, TANKS, useTestKit, waterChange } from '../sim';
import { advanceQuest, currentQuest, cycleProgress, FIRST_PESTS_TIP, loadProgress, newProgress, overloadWarning, pairProgress, pendingTip, questShopTab, QUESTS, saveProgress, TEST_AMMONIA_LINE, TIPS } from './tutorial';

function tank() {
  return createTank({ tank: TANKS.std40, filter: FILTERS.sponge, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 5 });
}

describe('新手引導任務', () => {
  it('照順序一步步完成，每次只前進一步：開缸、挑魚對水、餵食排最前面（polish-to-9.md G7）', () => {
    const s = tank();
    economy(s).setupPending = true;
    const p = newProgress();
    expect(QUESTS.map((q) => q.id)).toEqual(['setup', 'fish', 'feed', 'plant', 'test', 'water', 'scape', 'name', 'babies']);
    expect(currentQuest(p)?.id).toBe('setup');
    expect(advanceQuest(p, s)).toBeNull();
    expect(applySetup(s, RECOMMENDED_SETUP)).toBeNull();
    // 付錢裝好設備還不算，按下開機才算開好缸（#204）
    expect(advanceQuest(p, s)).toBeNull();
    expect(powerOn(s)).toBe(true);
    expect(advanceQuest(p, s)?.id).toBe('setup');
    // 開完缸馬上挑魚：第一條魚不用等種草、測水
    expect(currentQuest(p)?.id).toBe('fish');
    expect(advanceQuest(p, s)).toBeNull();
    addFish(s, 'guppy', { sex: 'female', carriesIch: false, carries: [] });
    addPlant(s, 'anubias');
    expect(advanceQuest(p, s)?.id).toBe('fish');
    expect(advanceQuest(p, s)).toBeNull();
    feed(s, 5);
    expect(advanceQuest(p, s)?.id).toBe('feed');
    expect(advanceQuest(p, s)?.id).toBe('plant');
    expect(advanceQuest(p, s)).toBeNull();
    useTestKit(s);
    expect(advanceQuest(p, s)?.id).toBe('test');
    s.hours = 30;
    waterChange(s, 0.3);
    expect(advanceQuest(p, s)?.id).toBe('water');
    // 等養水的空檔：擺造景、取名字
    expect(currentQuest(p)?.id).toBe('scape');
    addHardscape(s, HARDSCAPE.lava);
    expect(advanceQuest(p, s)?.id).toBe('scape');
    s.label = '第一缸';
    expect(advanceQuest(p, s)?.id).toBe('name');
    // 等養水不是任務了：硝化菌還沒長好，教學也能結束
    expect(currentQuest(p)?.id).toBe('babies');
    expect(isCycled(s)).toBe(false);
    recordEvent(s, { type: 'fry_born', count: 3 });
    expect(advanceQuest(p, s)?.id).toBe('babies');
    expect(currentQuest(p)).toBeNull();
  });

  it('新手任務獎勵 550，加上目標串的「等養水」250 還是 800（第 21 天買第二缸靠它，mvp.md §4.3）', () => {
    expect(QUESTS.reduce((a, q) => a + q.reward, 0)).toBe(550);
    expect(QUESTS.reduce((a, q) => a + q.reward, 0) + GOALS.find((g) => g.id === 'cycled')!.coins).toBe(800);
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
    saveProgress(store, { step: idx('scape'), skipped: false, seenTips: [] });
    expect(JSON.parse(data.get('cycle.tutorial.v1')!).quest).toBe('scape');
    // id 比數字優先（例如前面又插了新任務，數字已經對不上）
    data.set('cycle.tutorial.v1', '{"step":2,"quest":"babies","seenTips":[]}');
    expect(loadProgress(store).step).toBe(idx('babies'));
    data.set('cycle.tutorial.v1', '{"step":2,"quest":"done","seenTips":[]}');
    expect(loadProgress(store).step).toBe(QUESTS.length);
    // 只有數字的舊存檔照舊的 7 個任務換算：做完（7）還是做完；第 5 個（養水，搬去目標串了）接母魚懷孕
    data.set('cycle.tutorial.v1', '{"step":7,"seenTips":[]}');
    expect(loadProgress(store).step).toBe(QUESTS.length);
    data.set('cycle.tutorial.v1', '{"step":5,"seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('babies');
    // 第 1 個（測水）：種草做過了，還沒放魚，從挑魚接著做
    data.set('cycle.tutorial.v1', '{"step":1,"seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('fish');
    // 調順序以前（沒記 order）停在「擺石頭」：放魚、餵食、種草、測水、換水都做過了
    data.set('cycle.tutorial.v1', '{"step":6,"quest":"scape","seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('scape');
    data.set('cycle.tutorial.v1', '{"step":8,"quest":"cycled","seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('babies');
    data.set('cycle.tutorial.v1', '{"step":2,"quest":"test","seenTips":[]}');
    expect(QUESTS[loadProgress(store).step].id).toBe('fish');
    // 新順序存的照 id 直接對回來
    saveProgress(store, { step: idx('plant'), skipped: false, seenTips: [] });
    expect(QUESTS[loadProgress(store).step].id).toBe('plant');
  });
});

describe('等養水是目標串的背景目標（polish-to-9.md U2）', () => {
  it('等養水要硝化菌長好、氨 0、亞硝 0，而且是一天內測的；不用等到測得到硝酸鹽', () => {
    const s = tank();
    addFish(s, 'guppy');
    const cycled = GOALS.find((g) => g.id === 'cycled')!;
    const done = () => cycled.check([s], goalState([s]));
    // 剛放魚：測到 0 但硝化菌還沒長起來
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(done()).toBe(false);
    s.bacteria.aob = s.bacteria.nob = 0.5;
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0.25, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(done()).toBe(false);
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    s.hours = 30;
    expect(done()).toBe(false);
    s.hours = 5;
    expect(done()).toBe(true);
  });

  it('教學做完才發等養水的獎勵；舊存檔養水任務領過獎勵的不再發', () => {
    const mature = () => {
      const s = tank();
      addFish(s, 'guppy', { carriesIch: false, carries: [] });
      s.bacteria.aob = s.bacteria.nob = 1;
      s.water.tan = s.water.no2 = 0;
      useTestKit(s);
      return s;
    };
    const s = mature();
    expect(checkGoals([s], false)).toEqual([]);
    expect(checkGoals([s], true).map((g) => g.id)).toEqual(['cycled']);
    const old = mature();
    economy(old).questRewards = ['cycled'];
    expect(checkGoals([old], true).map((g) => g.id)).not.toContain('cycled');
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

  it('小魚撈進檢疫盒救下來了，老闆不會說小魚都被吃掉（#184）', () => {
    const s = tank();
    economy(s).coins = 10_000;
    addFish(s, 'guppy', { carriesIch: false, carries: [] });
    recordEvent(s, { type: 'fry_born', count: 3 });
    const fry = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    fry.generation = 1;
    fry.lengthCm = 0.8;
    buyQuarantine(s);
    expect(moveToQuarantine(s, fry.id)).toBe(true);
    s.hours += 49;
    expect(pendingTip(newProgress(), s)?.id).not.toBe('fry_eaten');
    s.quarantine!.fish = [];
    expect(pendingTip(newProgress(), s)?.id).toBe('fry_eaten');
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

  it('等養水的目標和說明都不看硝酸鹽', () => {
    const g = GOALS.find((x) => x.id === 'cycled')!;
    expect([g.title, ...(g.intro ?? [])].join('')).not.toMatch(/(?<!亞)硝酸鹽/);
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

  it('等養水的老闆說明有講要等多久、怎麼加快', () => {
    const lines = GOALS.find((g) => g.id === 'cycled')!.intro!.join('');
    expect(lines).toContain('4～7 天');
    expect(lines).toContain('硝化菌液');
  });
});

describe('任務直接帶到商店對應的分頁', () => {
  it('種水草的任務開水草頁、放魚開魚頁、擺石頭開設備頁', () => {
    const p = newProgress();
    p.step = QUESTS.findIndex((q) => q.id === 'plant');
    expect(questShopTab(p)).toBe('plants');
    p.step = QUESTS.findIndex((q) => q.id === 'fish');
    expect(questShopTab(p)).toBe('fish');
    p.step = QUESTS.findIndex((q) => q.id === 'scape');
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

describe('教學台詞（design/tutorial-lines.md）', () => {
  const len = (t: string) => [...t].length;

  it('任務卡和情境提醒都只放一行：每句 ≤ 24 個字，完整的話留在通知匣和「為什麼？」', () => {
    for (const q of QUESTS) expect(len(q.hint), q.id).toBeLessThanOrEqual(24);
    for (const t of TIPS.filter((t) => t.short)) expect(len(t.short!), t.id).toBeLessThanOrEqual(24);
    expect(len(FIRST_PESTS_TIP)).toBeLessThanOrEqual(24);
    expect(TIPS.filter((t) => t.short).map((t) => t.id).sort()).toEqual(['alkaline', 'ammonia', 'cycling_fish', 'nitrite', 'pair']);
  });

  it('前 5 分鐘要按掉的對話框只有歡迎和第一次放魚：任務做完只有挑魚會跳對話框，教學做完也不跳', () => {
    expect(QUESTS.filter((q) => q.doneDialog).map((q) => q.id)).toEqual(['fish']);
  });

  it('測水任務測到氨（新缸症候群第 1 天）就叫玩家先換水，下一個任務接著就是換水', () => {
    const s = tank();
    const test = QUESTS.find((q) => q.id === 'test')!;
    s.lastTest = { hours: 0, reading: { ammonia: 0, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(test.doneShortFor?.(s)).toBeNull();
    s.lastTest = { hours: 0, reading: { ammonia: 0.25, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(test.doneShortFor?.(s)).toBe(TEST_AMMONIA_LINE);
    expect(QUESTS[QUESTS.indexOf(test) + 1].id).toBe('water');
  });

  it('新缸症候群第一次讀到的氨 0.25、亞硝 0.25 就會提醒', () => {
    const s = tank();
    s.lastTest = { hours: s.hours, reading: { ammonia: 0.25, nitrite: 0, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(pendingTip(newProgress(), s)?.id).toBe('ammonia');
    s.lastTest = { hours: s.hours, reading: { ammonia: 0, nitrite: 0.25, nitrate: 0, ph: 7.2, kh: 4 } };
    expect(pendingTip(newProgress(), s)?.id).toBe('nitrite');
  });
});
