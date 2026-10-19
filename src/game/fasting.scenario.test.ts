import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addHolidayTablet, simulate, starvation, type TankState } from '../sim';

/**
 * 寫實的斷食（design/mvp.md §4.7，#115）：離線時間照常跑、最多補算 14 天。
 * 好好餵過的成魚停餵兩週不會死，只是變瘦；25 天才開始餓死；放一顆假期飼料錠出門兩週沒事。
 */
function adults(seed: number): TankState {
  const s = newGameState(seed);
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  s.bacteria.aob = s.bacteria.nob = 1;
  for (let i = 0; i < 6; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
  for (const f of s.fish) f.hunger = 0.3;
  return s;
}

const deaths = (s: TankState) => s.events.filter((e) => e.type === 'fish_died');

describe('斷食劇本（#115）', () => {
  it('成魚 6 尾停餵 14 天：0 死亡；停餵 25 天：有魚餓死', () => {
    for (const seed of [1, 2, 3]) {
      const s = adults(seed);
      simulate(s, 14 * 24);
      expect(deaths(s)).toHaveLength(0);
      simulate(s, 11 * 24);
      expect(deaths(s).length).toBeGreaterThan(0);
      expect(deaths(s).every((e) => e.cause === 'starvation')).toBe(true);
    }
  }, 60_000);

  it('放一顆假期飼料錠、離線 14 天：沒有魚死，也還沒開始餓壞', () => {
    for (const seed of [1, 2, 3]) {
      const s = adults(seed);
      addHolidayTablet(s);
      simulate(s, 14 * 24);
      expect(deaths(s)).toHaveLength(0);
      for (const f of s.fish.filter((x) => x.alive && x.generation === 0)) {
        expect(starvation(s, f)).toBeLessThan(0.5);
        expect(f.health).toBeGreaterThan(0.8);
      }
    }
  }, 60_000);
});
