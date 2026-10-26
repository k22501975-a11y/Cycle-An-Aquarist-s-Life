import { describe, expect, it } from 'vitest';
import { addFish, createTank, economy, FILTERS, HEATER_FAILURE_GAP_DAYS, HEATERS, creditSale, heaterCreditRefusal, insulateRefusal, insulateTank, LIGHTS, linkTanks, needsInsulation, noteEarned, sellFish, simulate, takeHeaterCredit, TANKS, type TankState } from '.';
import { breakHeater } from './processes/thermal';

function cold(roomTempC = 16): TankState {
  const t = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC, seed: 7, matureMedia: true });
  t.hours = 30 * 24;
  addFish(t, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
  t.equipment.heater!.broken = true;
  t.water.tempC = 20;
  return t;
}

describe('臨時保溫（mvp.md §4.4.6）', () => {
  it('回升 1°C、半天內降得比較慢；每天一次', () => {
    const a = cold();
    const b = cold();
    expect(needsInsulation(a)).toBe(true);
    expect(insulateTank(a)).toBe(true);
    expect(a.water.tempC).toBeCloseTo(21, 5);
    b.water.tempC = 21;
    simulate(a, 6);
    simulate(b, 6);
    expect(a.water.tempC - 16).toBeGreaterThan((b.water.tempC - 16) * 1.3);
    expect(insulateRefusal(a)).toBe('毛巾和溫水瓶還在保溫');
    simulate(a, 8);
    expect(insulateRefusal(a)).toContain('今天已經保溫過了');
    expect(needsInsulation(a)).toBe(false);
  });

  it('加熱棒好的缸不用保溫', () => {
    const t = cold();
    t.equipment.heater!.broken = false;
    expect(needsInsulation(t)).toBe(false);
  });
});

describe('跟阿德賒加熱棒（mvp.md §4.4.6）', () => {
  it('錢不夠、水溫低於適溫才賒得到；同時只能賒一支', () => {
    const t = cold();
    economy(t).coins = 500;
    expect(heaterCreditRefusal(t)).toBe('錢夠了，直接買一支就好');
    economy(t).coins = 50;
    t.water.tempC = 23;
    expect(heaterCreditRefusal(t)).toContain('水溫還撐得住');
    t.water.tempC = 20;
    expect(takeHeaterCredit(t)).toBe(350);
    expect(t.equipment.heater).toMatchObject({ broken: false, spec: HEATERS.h50 });
    expect(economy(t).coins).toBe(50);
    expect(economy(t).heaterLoan).toBe(350);
    t.equipment.heater!.broken = true;
    expect(heaterCreditRefusal(t)).toBe('還欠阿德 350 元，還清之前不能再賒');
  });

  it('還款：缸穩了、手上有 250 元以上才扣，每筆扣 3 成；手上少或有危機時先不扣（mvp.md §4.4.6 g33）', () => {
    const t = cold();
    t.equipment.heater!.broken = false;
    t.water.tempC = 25;
    economy(t).heaterLoan = 350;
    // 手上少：先不扣，記一筆「阿德說不急」
    economy(t).coins = 50 + 100;
    expect(noteEarned(t, 100)).toBe(0);
    expect(economy(t).heaterLoan).toBe(350);
    expect(economy(t).loanWaived).toBe(1);
    // 缸穩了、手上夠：扣 3 成
    economy(t).coins = 300 + 101;
    expect(noteEarned(t, 101)).toBe(31);
    expect(economy(t).coins).toBe(370);
    expect(economy(t).heaterLoan).toBe(319);
    // 有危機（加熱棒壞了）：先不扣
    t.equipment.heater!.broken = true;
    economy(t).coins += 100;
    expect(noteEarned(t, 100)).toBe(0);
    // 有魚看得到病：先不扣
    t.equipment.heater!.broken = false;
    t.fish[0].ich = { stage: 'visible', progress: 0.2 };
    expect(noteEarned(t, 100)).toBe(0);
    t.fish[0].ich = { stage: 'none', progress: 0 };
    // 還清了就拿掉
    economy(t).coins += 2000;
    noteEarned(t, 2000);
    expect(economy(t).heaterLoan).toBeUndefined();
    // 賣魚也照同樣的規則扣
    economy(t).heaterLoan = 100;
    economy(t).coins = 500;
    const f = addFish(t, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
    const before = economy(t).coins;
    const got = sellFish(t, f.id);
    expect(got).toBeGreaterThan(0);
    expect(economy(t).coins - before).toBe(got - Math.ceil(got * 0.3));
  });
});

describe('加熱棒不會接連壞（mvp.md §4.4.6）', () => {
  it(`一支壞了就記在共用的錢包上（${HEATER_FAILURE_GAP_DAYS} 天內不會再壞第二支）`, () => {
    const a = cold(24);
    const b = cold(24);
    b.equipment.heater!.broken = false;
    linkTanks([a, b]);
    a.equipment.heater!.broken = false;
    breakHeater(a);
    expect(economy(b).heaterBrokeHours).toBe(a.hours);
  });
});

describe('賒帳按鈕跟任務卡同一個條件（#398 架構）', () => {
  it('今天賣魚湊得到就不能賒', () => {
    const t = cold();
    economy(t).coins = 50;
    for (let i = 0; i < 10; i++) addFish(t, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
    expect(heaterCreditRefusal(t)).toBe('今天賣幾尾魚給水族店就湊得到，先賣魚');
  });
});

describe('賒帳的水溫條件（mvp.md §4.4.6 收緊）', () => {
  it('水溫還在適溫內但室溫低、水溫正在往下掉：可以賒；水溫穩著就不行', () => {
    const t = cold();
    economy(t).coins = 50;
    t.water.tempC = 23;
    t.water.tempAvgC = 23;
    expect(heaterCreditRefusal(t)).toContain('水溫還撐得住');
    t.water.tempAvgC = 24;
    expect(heaterCreditRefusal(t)).toBeNull();
    expect(creditSale(t)).toBe(0);
  });
});
