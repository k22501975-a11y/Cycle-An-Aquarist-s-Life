import { describe, expect, it } from 'vitest';
import { addPlant, buyPlant, COVER_DAY_MAX, MAX_PLANT_COVER, rawPlantCover, createTank, FILTERS, HEATERS, LIGHTS, MATURE_DAYS, OVERGROWN_COVER, overgrown, PLANT_SHIELD_FLOOR, plantCover, plantShield, simulate, TANKS, trimToCover, TRIM_TO_COVER, type TankState } from '.';
import { updatePlants, OVERGROWN_MELT_HOURS, OVERGROWN_MELT_TAN, OVERGROWN_NIGHT_O2 } from './processes/plants';

/** 養好水的 40L 缸，沒有魚。plantLight：有沒有水草燈。 */
function tank(plantLight = true): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: plantLight ? LIGHTS.planted : LIGHTS.basic }, roomTempC: 24, seed: 7, matureMedia: true });
  s.hours = 8;
  return s;
}

/** 推時間（只推鐘、每天換日記一次早上的覆蓋率），不跑整個模擬。 */
function days(s: TankState, n: number) {
  for (let i = 0; i < n * 24; i++) {
    s.hours += 1;
    updatePlants(s, 0);
  }
}

describe('水草覆蓋要慢慢長（polish-to-9.md §13.1）', () => {
  it('店裡買的是小苗：莫絲在 40L 缸約 +10%、香菇草約 +8%，有水草燈 17 天長到成株', () => {
    const s = tank();
    buyPlant(s, 'moss');
    expect(plantCover(s)).toBeCloseTo(0.1, 2);
    const h = tank();
    buyPlant(h, 'hydrocotyle');
    expect(plantCover(h)).toBeCloseTo(0.08, 2);
    days(s, MATURE_DAYS);
    expect(plantCover(s)).toBeCloseTo(0.25, 2);
    days(s, 10);
    expect(plantCover(s)).toBeCloseTo(0.25, 2);
  });

  it('沒有水草燈長得慢一倍', () => {
    const s = tank(false);
    buyPlant(s, 'moss');
    days(s, MATURE_DAYS);
    expect(plantCover(s)).toBeCloseTo(0.1 + 0.15 / 2, 2);
    days(s, MATURE_DAYS);
    expect(plantCover(s)).toBeCloseTo(0.25, 2);
  });

  it('一次種很多株：一天最多 +15%，隔天再多 15%', () => {
    const s = tank();
    days(s, 1);
    for (let i = 0; i < 8; i++) buyPlant(s, 'moss');
    expect(plantCover(s)).toBeCloseTo(COVER_DAY_MAX, 5);
    days(s, 1);
    expect(plantCover(s)).toBeCloseTo(2 * COVER_DAY_MAX, 5);
  });

  it('缸越小一株蓋得越多，但一株成株最多 35%（§13.5：20L 莫絲不是 50%）', () => {
    const s = createTank({ tank: TANKS.nano20, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.planted }, roomTempC: 24, seed: 7, matureMedia: true });
    addPlant(s, 'moss', 20);
    expect(plantCover(s)).toBeCloseTo(MAX_PLANT_COVER, 5);
    // 香菇草在 20L 是 40%，也封頂
    const h = createTank({ tank: TANKS.nano20, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.planted }, roomTempC: 24, seed: 7, matureMedia: true });
    addPlant(h, 'rotala', 20);
    expect(plantCover(h)).toBeCloseTo(0.2, 5);
  });
});

describe('保護有上限（§13.2）', () => {
  it('覆蓋越高越不容易被吃，夠密（≥ 60%）再減半，但最多只減 70%', () => {
    const s = tank();
    expect(plantShield(s)).toBe(1);
    addPlant(s, 'moss', 20);
    const some = plantShield(s);
    expect(some).toBeLessThan(1);
    for (let i = 0; i < 3; i++) addPlant(s, 'moss', 20);
    expect(plantCover(s)).toBe(1);
    expect(plantShield(s)).toBe(PLANT_SHIELD_FLOOR);
  });
});

describe('太密的代價和修剪（§13.3）', () => {
  /** 四株成株莫絲：100%。 */
  function dense(): TankState {
    const s = tank();
    for (let i = 0; i < 4; i++) addPlant(s, 'moss', 20);
    expect(overgrown(s)).toBe(true);
    return s;
  }

  it('長太密：關燈時多耗氧，每 7 天老葉化掉、氨 +0.1', () => {
    const s = dense();
    s.hours = 23; // 關燈
    const o2 = s.water.o2;
    const tan = s.water.tan;
    updatePlants(s, 1);
    expect(s.water.o2).toBeLessThan(o2 - OVERGROWN_NIGHT_O2 * 0.5);
    const lit = dense();
    lit.hours = 14; // 開燈
    const before = lit.water.o2;
    updatePlants(lit, 1);
    expect(lit.water.o2).toBeGreaterThan(before - OVERGROWN_NIGHT_O2 * 0.5);
    s.overgrownHours = OVERGROWN_MELT_HOURS - 0.5;
    updatePlants(s, 1);
    expect(s.water.tan - tan).toBeGreaterThanOrEqual(OVERGROWN_MELT_TAN * 0.9);
  });

  it('不太密不扣', () => {
    const s = tank();
    for (let i = 0; i < 2; i++) addPlant(s, 'moss', 20);
    expect(plantCover(s)).toBeLessThanOrEqual(OVERGROWN_COVER);
    s.overgrownHours = OVERGROWN_MELT_HOURS - 0.5;
    const tan = s.water.tan;
    updatePlants(s, 1);
    expect(s.water.tan).toBeLessThanOrEqual(tan + 1e-9);
  });

  it('修剪剪回約 65%，剪下的變插枝；之後慢慢長回來，一天不超過 15%', () => {
    const s = dense();
    const r = trimToCover(s)!;
    expect(r.from).toBe(1);
    expect(r.to).toBeCloseTo(TRIM_TO_COVER, 2);
    expect(plantCover(s)).toBeCloseTo(TRIM_TO_COVER, 2);
    expect(r.cuttings).toBeGreaterThan(0);
    expect(overgrown(s)).toBe(false);
    let last = plantCover(s);
    for (let d = 0; d < 20; d++) {
      days(s, 1);
      expect(plantCover(s) - last).toBeLessThanOrEqual(COVER_DAY_MAX + 1e-9);
      last = plantCover(s);
    }
    expect(last).toBeGreaterThan(TRIM_TO_COVER);
    // 不太密不剪
    expect(trimToCover(tank())).toBeNull();
  });

  it('真的跑模擬也照樣長（小苗長大、換日記覆蓋率）', () => {
    const s = tank();
    buyPlant(s, 'moss');
    const start = plantCover(s);
    simulate(s, 24 * 5);
    expect(plantCover(s)).toBeGreaterThan(start);
    expect(s.coverDay).toBeDefined();
  });
});

describe('舊存檔（架構審查）', () => {
  it('沒有 plantedHours、沒有 coverDay 的舊存檔：載入當下的覆蓋率就是算出來的值，不被一天 +15% 擋住', () => {
    const s = tank();
    for (let i = 0; i < 3; i++) addPlant(s, 'moss', 20);
    expect(s.coverDay).toBeUndefined();
    expect(s.plants.every((p) => p.plantedHours === undefined)).toBe(true);
    const raw = rawPlantCover(s);
    expect(plantCover(s)).toBe(raw);
    // 第一次跑模擬才記基準（有效值），之後照樣：沒有突然掉下來
    updatePlants(s, 0);
    expect(s.coverDay).toEqual({ day: Math.floor(s.hours / 24), cover: raw });
    expect(plantCover(s)).toBe(raw);
  });

  it('plantCover 不寫 state（畫面每格都會叫）', () => {
    const s = tank();
    buyPlant(s, 'moss');
    const before = JSON.stringify(s);
    plantCover(s);
    overgrown(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('往下掉（修剪、溶葉）立刻算，上限只擋往上', () => {
    const s = tank();
    for (let i = 0; i < 3; i++) addPlant(s, 'moss', 20);
    updatePlants(s, 0);
    s.plants.pop();
    expect(plantCover(s)).toBeCloseTo(0.5, 5);
  });
});
