import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import {
  addFish,
  addPlant,
  fishCondition,
  buyTank,
  GUPPY_STRAIN_PRICES,
  isJuvenile,
  linkTanks,
  moveFish,
  newTankCost,
  transferMedia,
  isCycled,
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
import { QUESTS } from '../ui/tutorial';

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
  it('照教學一天兩次「一小撮」：兩週內魚都不會餓壞，也不會因為餓而緊迫', () => {
    for (const seed of [1, 2, 3]) {
      const s = newGameState(seed);
      for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
      const adults = s.fish.map((f) => f.id);
      let maxHunger = 0;
      for (let d = 0; d < 14; d++) {
        for (const h of [12, 12]) {
          // 跟遊戲裡的按鈕一樣：一小撮是「現在缸裡所有魚」一餐的 3/4，生了小魚就會跟著變多
          feed(s, meal(s) * 0.75);
          simulate(s, h);
          for (const f of alive(s)) maxHunger = Math.max(maxHunger, f.hunger);
        }
      }
      expect(maxHunger).toBeLessThan(0.8);
      // 買來的母魚常常已經懷孕，兩週內會生小魚；原本 3 條都要活著
      expect(alive(s).filter((f) => adults.includes(f.id))).toHaveLength(3);
      for (const f of alive(s)) expect(fishCondition(s, f).hunger).not.toBe('starving');
    }
  });

  it('照教學玩（一公兩母、一天兩次一小撮、每天測水、有氨亞硝就換水）：養水任務 3～8 天內過得了', () => {
    const cycled = QUESTS.find((q) => q.id === 'cycled')!;
    for (const seed of [1, 2, 3]) {
      const s = newGameState(seed);
      for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
      expect(alive(s).map((f) => f.sex)).toEqual(['male', 'female', 'female']);
      let doneDay = -1;
      for (let d = 1; d <= 10 && doneDay < 0; d++) {
        for (let k = 0; k < 2; k++) {
          feed(s, meal(s) * 0.75);
          simulate(s, 12);
        }
        const r = useTestKit(s);
        if (cycled.check(s)) doneDay = d;
        else if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
      }
      expect(doneDay).toBeGreaterThanOrEqual(3);
      expect(doneDay).toBeLessThanOrEqual(8);
    }
  });

  it('完全不餵：幾天後魚會餓，點魚看得到「餓了」，生病原因寫沒吃飽', () => {
    const s = newGameState(7);
    addFish(s, 'guppy', { carriesIch: false, carries: [] });
    simulate(s, 24 * 5);
    const f = alive(s)[0];
    const c = fishCondition(s, f);
    expect(c.hunger).toBe('hungry');
    expect(c.causes[0].key).toBe('hunger');
    expect(c.causes[0].label).toContain('沒吃飽');
  });

  it('3 條孔雀魚、每天正常餵、不用任何道具：約一週養好水（養水任務過得了）', () => {
    for (const seed of [1, 2, 3]) {
      const s = newGameState(seed);
      for (let i = 0; i < 3; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
      let cycledDay = -1;
      for (let d = 1; d <= 10 && cycledDay < 0; d++) {
        feed(s, meal(s) * 2);
        simulate(s, 24);
        if (isCycled(s)) cycledDay = d;
      }
      expect(cycledDay).toBeGreaterThanOrEqual(3);
      expect(cycledDay).toBeLessThanOrEqual(8);
    }
  });

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

  it('一開始就放 20 條、還餵太多：養水來不及，氨爆表、魚生病（學到教訓）', () => {
    for (const seed of [4, 5, 6]) {
      const s = newGameState(seed);
      s.environment.roomTempC = 25;
      s.environment.roomSwingC = 2;
      s.water.tempC = s.water.tempAvgC = 25;
      for (let i = 0; i < 20; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
      let peakTan = 0;
      let minHealth = 1;
      for (let d = 0; d < 10; d++) {
        for (let h = 0; h < 2; h++) {
          for (let k = 0; k < 12; k++) {
            simulate(s, 1);
            peakTan = Math.max(peakTan, s.water.tan);
            for (const f of alive(s)) minHealth = Math.min(minHealth, f.health);
          }
          feed(s, meal(s) * 3);
        }
      }
      expect(peakTan).toBeGreaterThan(1);
      expect(minHealth).toBeLessThan(0.8);
    }
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

/**
 * 認真玩家 120 天（design/mvp.md §4.3）：買一組品系 1 公 2 母，每天餵兩餐、測水、超標或每週換水，
 * 成魚（留種的 3 條除外）賣給店家，缸太擠才連中魚一起賣；錢夠又快滿了就加缸，分濾材過去、養好後移魚。
 * 新手目標獎勵（M19）還沒做，先在第 10 天直接給 800。
 */
function seriousPlayer(seed: number, strain: number): { income: Record<number, number>; tanks: number } {
  const home = newGameState(seed);
  const tanks: TankState[] = [home];
  linkTanks(tanks);
  home.environment.roomTempC = 25;
  home.environment.roomSwingC = 2;
  addPlant(home, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(home, 'guppy', { carriesIch: false, carries: [], sex, strain });
  economy(home).coins -= 150 + 3 * GUPPY_STRAIN_PRICES[strain];
  const breeders = new Set(home.fish.map((f) => f.id));
  const cap = (t: TankState) => Math.round(t.equipment.tank.volumeL / 2);
  const count = (t: TankState) => alive(t).length;
  const income: Record<number, number> = {};
  let total = 0;
  for (let d = 1; d <= 120; d++) {
    for (let k = 0; k < 2; k++) {
      for (const t of tanks) if (count(t) > 0) feed(t, meal(t));
      for (const t of tanks) simulate(t, 12);
    }
    for (const t of tanks) {
      const heater = t.equipment.heater;
      if (heater && (heater.stuckOn || heater.broken)) t.equipment.heater = { spec: heater.spec, targetC: heater.targetC, broken: false, heating: false };
      const r = useTestKit(t);
      if (r.ammonia >= 0.25 || r.nitrite >= 0.25 || r.nitrate >= 40 || d % 7 === 0) waterChange(t, 0.3);
      const crowded = count(t) > cap(t);
      for (const f of alive(t)) if (!breeders.has(f.id) && !buybackRefusal(f) && (crowded || !isJuvenile(f))) total += sellFish(t, f.id);
    }
    if (d === 10) economy(home).coins += 800;
    const size = tanks.length === 1 ? 'nano20' : 'std40';
    const fish = tanks.reduce((a, t) => a + count(t), 0);
    if (tanks.length < 6 && fish > tanks.reduce((a, t) => a + cap(t), 0) * 0.5 && economy(home).coins >= newTankCost(tanks, size) + 100) transferMedia(home, buyTank(tanks, size)!);
    for (const t of tanks.slice(1)) {
      if (!isCycled(t) || count(t) >= cap(t) * 0.5) continue;
      const from = tanks.reduce((a, b) => (count(b) > count(a) ? b : a));
      if (from !== t) for (const f of alive(from).filter((x) => !breeders.has(x.id)).slice(0, Math.floor(cap(t) * 0.5))) moveFish(from, t, f.id);
    }
    income[d] = total;
  }
  return { income, tanks: tanks.length };
}

describe('經濟（mvp.md §4.3）', () => {
  it('認真玩家 120 天：買得起第二缸，收入一路成長，養白子比禮服賺得多', () => {
    const tux = seriousPlayer(1, 3);
    const albino = seriousPlayer(1, 2);
    for (const run of [tux, albino]) {
      expect(run.tanks).toBeGreaterThanOrEqual(2);
      // 還沒到 §4.3 的目標（600／3,000／8,000），先當回歸底線；目標數字等企劃定案、M21 訂單板再補
      expect(run.income[60]).toBeGreaterThan(50);
      expect(run.income[120]).toBeGreaterThan(500);
      expect(run.income[120]).toBeGreaterThan(run.income[60] * 2);
    }
    expect(albino.income[120]).toBeGreaterThan(tux.income[120] * 1.3);
  }, 120_000);
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
