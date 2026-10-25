import { describe, expect, it } from 'vitest';
import { addFish, createTank, economy, FILTERS, HEATER_FAILURE_GAP_DAYS, HEATERS, heaterCreditRefusal, insulateRefusal, insulateTank, LIGHTS, linkTanks, needsInsulation, noteEarned, sellFish, simulate, takeHeaterCredit, TANKS, type TankState } from '.';
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
  it('錢不夠、水溫低於適溫才賒得到；同時只能賒一支；收入扣一半來還', () => {
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
    // 賣一尾魚：一半拿去還
    const f = t.fish[0];
    const before = economy(t).coins;
    const got = sellFish(t, f.id);
    expect(got).toBeGreaterThan(0);
    expect(economy(t).coins - before).toBe(got - Math.ceil(got / 2));
    expect(economy(t).heaterLoan).toBe(350 - Math.ceil(got / 2));
    // 還清了就拿掉
    economy(t).coins += 1000;
    noteEarned(t, 1000);
    expect(economy(t).heaterLoan).toBeUndefined();
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
