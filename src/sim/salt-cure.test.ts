import { describe, expect, it } from 'vitest';
import { addFish, createTank, economy, FILTERS, HEATERS, LIGHTS, nextStep, price, SALT_DAYS, SALT_HEAT_C, saltDaysLeft, simulate, TANKS, waterChange, type TankState } from '.';
import { saltIchCure, saltRefusal } from './salt-treat';

/** 40L 一缸、8 尾孔雀魚，其中一尾已經長白點（太擠的誘因），水裡也有蟲。 */
function sick(): TankState {
  const t = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 31, matureMedia: true });
  t.hours = 30 * 24;
  for (let i = 0; i < 8; i++) addFish(t, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
  t.fish[0].ich = { stage: 'visible', progress: 0, cause: 'crowding' };
  t.water.ichPathogen = 2;
  economy(t).coins = 100;
  return t;
}

const spotted = (t: TankState) => t.fish.filter((f) => f.alive && f.ich.stage !== 'none').length;

describe('粗鹽＋30°C 治白點（mvp.md §4.4.6 g33）', () => {
  it('花 20 元、加熱棒調到 30°C；約一週治好，斷根後加熱棒調回原本的溫度', () => {
    const t = sick();
    expect(saltRefusal(t)).toBeNull();
    expect(saltIchCure(t)).toBe(true);
    expect(economy(t).coins).toBe(100 - price('med:salt'));
    expect(t.equipment.heater!.targetC).toBe(SALT_HEAT_C);
    expect(saltDaysLeft(t)).toBe(SALT_DAYS);
    expect(saltRefusal(t)).toBe('已經在用粗鹽治了');
    for (let d = 0; d < 14 && t.saltTreat; d++) simulate(t, 24);
    expect(t.saltTreat).toBeUndefined();
    expect(spotted(t)).toBe(0);
    expect(t.equipment.heater!.targetC).toBe(25);
    expect(t.fish.filter((f) => f.alive).length).toBe(8);
  });

  it('不治的缸白點越來越多', () => {
    const t = sick();
    simulate(t, 7 * 24);
    expect(spotted(t)).toBeGreaterThan(1);
  });

  it('療程中換水照換掉的量補鹽；療程結束後換水才沖淡', () => {
    const t = sick();
    saltIchCure(t);
    waterChange(t, 0.5);
    expect(t.water.salt).toBeCloseTo(1, 5);
    delete t.saltTreat;
    waterChange(t, 0.5);
    expect(t.water.salt).toBeCloseTo(0.5, 5);
  });

  it('不能用的時候說為什麼：有蝦、沒白點、加熱棒壞了、錢不夠', () => {
    const shrimp = sick();
    addFish(shrimp, 'cherry_shrimp');
    expect(saltRefusal(shrimp)).toContain('蝦怕鹽');
    const clean = sick();
    clean.fish[0].ich = { stage: 'none', progress: 0 };
    expect(saltRefusal(clean)).toBe('沒有魚身上有白點');
    const broken = sick();
    broken.equipment.heater!.broken = true;
    expect(saltRefusal(broken)).toContain('先把加熱棒弄好');
    const poor = sick();
    economy(poor).coins = 10;
    expect(saltRefusal(poor)).toBe(`粗鹽要 ${price('med:salt')} 元`);
    expect(saltIchCure(poor)).toBe(false);
  });

  it('任務卡：白點藥買不起就推粗鹽；還欠阿德錢、買了藥手上不到 250 元也推粗鹽；治療中說還要幾天', () => {
    const poor = sick();
    economy(poor).coins = 60;
    expect(nextStep([poor])?.text).toContain('先用便宜的治法：水溫調到 30°C、加一點粗鹽');
    const owing = sick();
    economy(owing).coins = 250;
    economy(owing).heaterLoan = 280;
    expect(nextStep([owing])?.text).toContain('白點藥（150 元）先省下來');
    const rich = sick();
    economy(rich).coins = 500;
    economy(rich).heaterLoan = 280;
    expect(nextStep([rich])?.text).not.toContain('粗鹽');
    saltIchCure(owing);
    expect(nextStep([owing])?.text).toBe(`粗鹽治白點中（水溫 30°C），約 ${SALT_DAYS} 天會好`);
  });
});
