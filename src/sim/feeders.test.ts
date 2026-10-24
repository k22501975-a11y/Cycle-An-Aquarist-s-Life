import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, addHolidayTablet, addPlant, buyFeeder, economy, feederInstalledText, forecast, hasSteadyFood, HOLIDAY_TABLET_DAYS, hoursUntilStarving, installFeeder, maxLengthCm, pinchMg, simulate, type TankState } from './index';

const calm = { carriesIch: false, carries: [] };

function tank(): TankState {
  const s = newGameState(4);
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  s.bacteria.aob = s.bacteria.nob = 1;
  return s;
}

describe('出遠門用品與寫實斷食（#115）', () => {
  it(`假期飼料錠約 ${HOLIDAY_TABLET_DAYS} 天溶完，溶的時候缸裡一直有飼料`, () => {
    const s = tank();
    addHolidayTablet(s);
    expect(hasSteadyFood(s)).toBe(true);
    simulate(s, 3 * 24);
    expect(s.water.foodMg).toBeGreaterThan(0);
    simulate(s, (HOLIDAY_TABLET_DAYS - 3) * 24 + 1);
    expect(s.holidayTablets).toEqual([]);
    expect(hasSteadyFood(s)).toBe(false);
  });

  it('自動餵食器每天定時投，魚一直不會餓', () => {
    const s = tank();
    for (let i = 0; i < 4; i++) addFish(s, 'guppy', { ...calm, pregnant: false });
    installFeeder(s, 1);
    simulate(s, 20 * 24);
    for (const f of s.fish.filter((x) => x.alive)) expect(f.hunger).toBeLessThan(0.7);
    expect(s.events.filter((e) => e.type === 'fish_died')).toHaveLength(0);
  });

  it('仔魚只撐 3～5 天；有水草的缸成魚多撐約三成', () => {
    const s = tank();
    const fry = addFish(s, 'guppy', calm);
    fry.lengthCm = maxLengthCm(fry) * 0.2;
    fry.hunger = 0.3;
    const days = hoursUntilStarving(s, fry) / 24;
    expect(days).toBeGreaterThan(1.5);
    expect(days).toBeLessThan(4);
    const adult = addFish(s, 'guppy', calm);
    adult.hunger = 0.3;
    s.algae = 0;
    const bare = hoursUntilStarving(s, adult);
    addPlant(s, 'anubias');
    expect(hoursUntilStarving(s, adult) / bare).toBeGreaterThan(1.15);
  });

  it('有仔魚又沒有持續餵食：推播提前一天提醒會餓壞；只有成魚撐得過兩週就不提醒；放了飼料錠也不提醒', () => {
    const s = tank();
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', { ...calm, pregnant: false });
    expect(forecast([s], 1).find((a) => a.key === 'starve')).toBeUndefined();
    const fry = addFish(s, 'guppy', calm);
    fry.lengthCm = maxLengthCm(fry) * 0.2;
    fry.generation = 1;
    const alert = forecast([s], 1).find((a) => a.key === 'starve');
    expect(alert).toBeDefined();
    expect(alert!.hours).toBeLessThan(24 * 4);
    addHolidayTablet(s);
    expect(forecast([s], 1).find((a) => a.key === 'starve')).toBeUndefined();
  });

  it('早上報告的提示直接買（daily-loop.md §4）：花 600 元裝上一天餵兩次的自動餵食器；已經有、錢不夠都不買', () => {
    const s = tank();
    const tanks = [s];
    economy(s).coins = 700;
    expect(buyFeeder(tanks, 0)).toBeNull();
    expect(economy(s).coins).toBe(100);
    expect(s.equipment.feeder).toEqual({ timesPerDay: 2 });
    expect(buyFeeder(tanks, 0)).toBe('這缸已經有自動餵食器了');
    delete s.equipment.feeder;
    expect(buyFeeder(tanks, 0)).toBe('錢不夠：要 600 元');
    expect(economy(s).coins).toBe(100);
  });

  it('新裝的餵食器先試餵一次（daily-loop.md §7 第 3 點）；已經有的改次數不會多餵', () => {
    const s = tank();
    for (let i = 0; i < 3; i++) addFish(s, 'guppy', calm);
    s.water.food = [];
    s.water.foodMg = 0;
    expect(pinchMg(s)).toBeGreaterThan(0);
    installFeeder(s, 2);
    expect(s.water.foodMg).toBeCloseTo(pinchMg(s));
    installFeeder(s, 1);
    expect(s.water.foodMg).toBeCloseTo(pinchMg(s));
    expect(feederInstalledText(2)).toBe('裝好了，先試餵一次。之後每天 9 點、19 點自動餵。');
    expect(feederInstalledText(1)).toBe('裝好了，先試餵一次。之後每天 9 點自動餵。');
  });
});
