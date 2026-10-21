import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addBottledBacteria, addFish, createTank, economy, FILTERS, HEATERS, LIGHTS, newTankSyndrome, placeTankSet, simulate, SUBSTRATES, SYNDROME_MG_PER_FISH, TANKS, transferMedia, useTestKit, type TankState } from '.';

/** 新缸症候群（design/polish-to-9.md §6「P6 實作確認」）：第一次放魚、菌量還低時冒一波氨，照魚數算，菌夠就不出現。 */

const stock = (s: TankState, n: number) => {
  for (let i = 0; i < n; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: i === 0 ? 'male' : 'female' });
};
const total = (s: TankState) => s.newTankSyndrome?.totalMg ?? 0;
const fresh = () => {
  const s = newGameState(1);
  s.environment.roomTempC = 25;
  s.water.tempC = s.water.tempAvgC = 25;
  return s;
};

describe('新缸症候群', () => {
  it('還沒放魚不會有；第一次放魚開始，總量照魚數算', () => {
    const s = fresh();
    simulate(s, 24);
    expect(newTankSyndrome(s)).toBe('none');
    expect(s.water.tan).toBeLessThan(0.01);
    stock(s, 3);
    simulate(s, 1);
    expect(newTankSyndrome(s)).toBe('active');
    expect(total(s)).toBeCloseTo(3 * SYNDROME_MG_PER_FISH, 0);
    const six = fresh();
    stock(six, 6);
    simulate(six, 1);
    expect(total(six)).toBeCloseTo(2 * total(s), 0);
  });

  it('同一批陸續放進來的魚也算；之後再加魚不會再來一次', () => {
    const s = fresh();
    stock(s, 1);
    simulate(s, 2);
    stock(s, 2);
    simulate(s, 1);
    expect(total(s)).toBeCloseTo(3 * SYNDROME_MG_PER_FISH, 0);
    simulate(s, 24 * 3);
    stock(s, 3);
    simulate(s, 1);
    expect(total(s)).toBeCloseTo(3 * SYNDROME_MG_PER_FISH, 0);
  });

  it('放魚一週後算過了', () => {
    const s = fresh();
    stock(s, 3);
    simulate(s, 24 * 7);
    expect(newTankSyndrome(s)).toBe('none');
  });

  it('水草泥缸多一點', () => {
    const sand = fresh();
    const soil = fresh();
    soil.equipment.substrate = { spec: SUBSTRATES.soil, sinceHours: soil.hours, buffer: 1 };
    for (const s of [sand, soil]) {
      stock(s, 3);
      simulate(s, 1);
    }
    expect(total(soil)).toBeGreaterThan(total(sand) * 1.1);
  });

  it('倒了硝化菌液再放魚：不會出現，報告說得出是菌液的功勞', () => {
    const s = fresh();
    addBottledBacteria(s);
    stock(s, 3);
    simulate(s, 24);
    expect(newTankSyndrome(s)).toBe('prevented_by_bacteria');
    expect(useTestKit(s).ammonia).toBe(0);
  });

  it('第二缸也會；分舊缸濾材過去就變小或不出現', () => {
    const home = fresh();
    economy(home).coins = 100_000;
    const tanks = [home];
    const bare = placeTankSet(tanks, 'nano20');
    stock(bare, 3);
    simulate(bare, 24);
    expect(newTankSyndrome(bare)).toBe('active');
    expect(useTestKit(bare).ammonia).toBeGreaterThan(0);

    const old = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true, seed: 5 });
    const seeded = placeTankSet(tanks, 'nano20');
    expect(transferMedia(old, seeded)).not.toBeNull();
    stock(seeded, 3);
    simulate(seeded, 1);
    expect(total(seeded)).toBeLessThan(total(bare) * 0.5);

    // 商城的熟成套缸本來就有菌
    const mature = placeTankSet(tanks, 'nano20', true);
    stock(mature, 3);
    simulate(mature, 1);
    expect(newTankSyndrome(mature)).toBe('prevented_by_bacteria');
  });

  it('舊存檔（沒有這個欄位）的缸不會突然冒氨', () => {
    const s = fresh();
    delete s.newTankSyndrome;
    stock(s, 3);
    simulate(s, 24);
    expect(newTankSyndrome(s)).toBe('none');
    expect(s.water.tan).toBeLessThan(0.05);
  });
});
