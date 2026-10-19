import { describe, expect, it } from 'vitest';
import { addFish, createTank, feed, FILTERS, forecast, HEATERS, LIGHTS, simulate, TANKS } from '.';

const tank = (mature: boolean, seed = 4) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: mature, seed, roomTempC: 24 });

describe('推播預測', () => {
  it('養好水、魚不多的缸：接下來沒有危機', () => {
    const t = tank(true);
    for (let i = 0; i < 4; i++) addFish(t, 'zebrafish', { carriesIch: false, carries: [] });
    const alerts = forecast([t], 24);
    expect(alerts.filter((a) => a.category === 'crisis' && a.key !== 'hungry')).toEqual([]);
  });

  it('新缸放一堆魚：預測到氨升高，而且比真的死魚早', () => {
    const t = tank(false);
    for (let i = 0; i < 30; i++) addFish(t, 'guppy', { carriesIch: false, carries: [] });
    // 出門前倒了一大把飼料
    feed(t, 6000);
    const alerts = forecast([t], 72);
    const ammonia = alerts.find((a) => a.key === 'ammonia');
    expect(ammonia).toBeDefined();
    const died = alerts.find((a) => a.key === 'died');
    if (died) expect(ammonia!.hours).toBeLessThan(died.hours);
  });

  it('預測不會改到真的缸，而且和實際模擬的結果一致', () => {
    const t = tank(false, 9);
    for (let i = 0; i < 30; i++) addFish(t, 'guppy', { carriesIch: false, carries: [] });
    feed(t, 6000);
    const snapshot = JSON.stringify(t);
    const alerts = forecast([t], 72);
    expect(JSON.stringify(t)).toBe(snapshot);
    const ammonia = alerts.find((a) => a.key === 'ammonia')!;
    simulate(t, ammonia.hours - 1);
    const early = forecast([t], 1);
    expect(early.some((a) => a.key === 'ammonia')).toBe(true);
  });

  it('加熱棒壞了的冬天：預測到水溫太冷', () => {
    const t = tank(true);
    t.environment.roomTempC = 14;
    t.water.tempC = 25;
    for (let i = 0; i < 4; i++) addFish(t, 'guppy', { carriesIch: false, carries: [] });
    // 加熱棒拔掉了
    t.equipment.heater = null;
    const cold = forecast([t], 48).find((a) => a.key === 'cold');
    expect(cold?.body).toMatch(/太冷/);
  });

  it('多缸時訊息前面加上缸名', () => {
    const a = tank(true, 5);
    const b = tank(false, 6);
    b.label = '繁殖缸';
    for (let i = 0; i < 30; i++) addFish(b, 'guppy', { carriesIch: false, carries: [] });
    feed(b, 6000);
    const alert = forecast([a, b], 72).find((x) => x.key === 'ammonia')!;
    expect(alert.tank).toBe(1);
    expect(alert.body.startsWith('繁殖缸：')).toBe(true);
  });
});
