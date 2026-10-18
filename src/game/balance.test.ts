import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import {
  addFish,
  addPlant,
  buybackRefusal,
  canClaimStarterPack,
  claimStarterPack,
  createTank,
  economy,
  feed,
  FILTERS,
  FISH_SPECIES,
  HEATERS,
  LIGHTS,
  sellFish,
  simulate,
  TANKS,
  useTestKit,
  waterChange,
  type TankState,
} from '../sim';

/** 平衡測試：用「玩家會怎麼玩」的腳本跑模擬，確認難度合理（commercial-gap K1～K3）。 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 一天：早晚各餵一餐，晚上依測試結果決定要不要換水。 */
function day(s: TankState, careful: boolean): void {
  simulate(s, 2);
  feed(s, meal(s));
  simulate(s, 10);
  feed(s, meal(s));
  simulate(s, 12);
  if (careful) {
    // 細心的玩家看到加熱棒卡住或壞掉會馬上處理（待辦卡會提醒）
    const heater = s.equipment.heater;
    if (heater && (heater.stuckOn || heater.broken)) s.equipment.heater = { spec: heater.spec, targetC: heater.targetC, broken: false, heating: false };
    const r = useTestKit(s);
    if (r.ammonia >= 0.5 || r.nitrite >= 0.5 || r.kh <= 2) waterChange(s, 0.3);
  }
}

describe('新手前幾週（K1）', () => {
  it('照教學只放 3 條魚、每天測水、超標就換水：新缸期間魚都活著', () => {
    for (const seed of [1, 2, 3]) {
      const s = newGameState(seed);
      // 室溫固定，不跟著跑測試當天的現實日期變（否則結果每天不一樣）
      s.environment.roomTempC = 25;
      s.environment.roomSwingC = 2;
      s.water.tempC = s.water.tempAvgC = 25;
      addPlant(s, 'anubias');
      for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
      for (let d = 0; d < 21; d++) day(s, true);
      expect(s.events.filter((e) => e.type === 'fish_died')).toHaveLength(0);
    }
  }, 30_000);

  it('一開始就放 6 條、還餵太多：新缸症候群會死魚（學到教訓）', () => {
    let wiped = 0;
    for (const seed of [4, 5, 6]) {
      const s = newGameState(seed);
      s.environment.roomTempC = 25;
      s.environment.roomSwingC = 2;
      s.water.tempC = s.water.tempAvgC = 25;
      for (let i = 0; i < 6; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
      for (let d = 0; d < 21; d++) {
        simulate(s, 12);
        feed(s, meal(s) * 3);
        simulate(s, 12);
      }
      if (s.events.some((e) => e.type === 'fish_died' && e.cause === 'ammonia')) wiped++;
    }
    expect(wiped).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe('長期經營（K2、K3）', () => {
  it('成熟的缸、每週換水、魚多了就賣：兩個月後魚還在，而且賺得到錢', () => {
    for (const seed of [1, 3]) {
      const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 22, seed, matureMedia: true });
      addPlant(s, 'anubias');
      addPlant(s, 'rotala');
      for (let i = 0; i < 4; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: i === 0 ? 'male' : 'female' });
      const start = economy(s).coins;
      for (let d = 0; d < 60; d++) {
        day(s, true);
        if (d % 7 === 6) waterChange(s, 0.3);
        let extra = alive(s).length - 14;
        for (const f of alive(s).filter((x) => !buybackRefusal(x))) if (extra-- > 0) sellFish(s, f.id);
      }
      expect(alive(s).length).toBeGreaterThanOrEqual(4);
      expect(economy(s).coins).toBeGreaterThan(start);
    }
  }, 60_000);
});

describe('保底起步包', () => {
  it('整缸死光又沒錢時可以領 3 條孔雀魚，送的魚不能賣，一週只能領一次', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, seed: 9 });
    const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    expect(canClaimStarterPack(s)).toBe(false);
    f.alive = false;
    s.fish = [];
    s.events.push({ hours: s.hours, type: 'fish_died', cause: 'ammonia' });
    expect(canClaimStarterPack(s)).toBe(false); // 還有錢
    economy(s).coins = 50;
    expect(canClaimStarterPack(s)).toBe(true);
    expect(claimStarterPack(s, (st, sex) => addFish(st, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }))).toBe(true);
    expect(alive(s)).toHaveLength(3);
    expect(buybackRefusal(s.fish[0])).toContain('送');
    s.fish.forEach((x) => (x.alive = false));
    expect(canClaimStarterPack(s)).toBe(false);
    s.hours += 7 * 24;
    expect(canClaimStarterPack(s)).toBe(true);
  });
});
