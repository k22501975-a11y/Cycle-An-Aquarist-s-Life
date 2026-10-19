import { describe, expect, it } from 'vitest';
import {
  addFish,
  addPlant,
  breakHeater,
  lightHeatC,
  computeStressors,
  createTank,
  doseIchMedication,
  feed,
  FILTERS,
  FISH_SPECIES,
  HEATERS,
  LIGHTS,
  CO2_KITS,
  AIR_PUMPS,
  observeSymptoms,
  removeDeadFish,
  rinseFilterMedia,
  setHeaterTarget,
  unplugHeater,
  simulate,
  TANKS,
  testWater,
  trimPlant,
  waterChange,
  type CreateTankOptions,
  type FishSpeciesId,
  type TankState,
} from './index';

/** 一般的 40L 起步配置：外掛過濾、50W 加熱棒設 25°C、基本燈。 */
const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
};

/** 放魚。預設全放公的，避免繁殖干擾水質類的情境（繁殖與混養另有測試）。 */
function stock(state: TankState, species: FishSpeciesId, count: number): void {
  for (let i = 0; i < count; i++) addFish(state, species, { carriesIch: false, sex: 'male' });
}

const alive = (s: TankState) => s.fish.filter((f) => f.alive);

/** 每天早晚各餵一次，份量 = 魚的每日食量 × multiplier ÷ 2。 */
function dailyRation(s: TankState, multiplier = 1): number {
  return (alive(s).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg, 0) * multiplier) / 2;
}

interface RunOptions {
  feedMultiplier?: number;
  /** 每 7 天換水的比例（水溫與缸水相同）。 */
  weeklyWaterChange?: number;
  onDay?: (s: TankState, day: number) => void;
  onHour?: (s: TankState) => void;
}

function runDays(s: TankState, days: number, opts: RunOptions = {}): void {
  for (let day = 0; day < days; day++) {
    opts.onDay?.(s, day);
    if (opts.weeklyWaterChange && day % 7 === 6) waterChange(s, opts.weeklyWaterChange, { tempC: s.water.tempC });
    for (let h = 0; h < 24; h++) {
      if (h === 8 || h === 18) feed(s, dailyRation(s, opts.feedMultiplier ?? 1));
      simulate(s, 1, opts.onHour);
    }
  }
}

describe('氮循環', () => {
  it('無魚養水：每天補氨，約 3–7 天硝化菌建立，氨與亞硝酸鹽一天內就被處理掉', () => {
    // 補氨會消耗 KH；KH 太低時 pH 崩跌、硝化停擺，所以這裡用 KH 較高的自來水。
    const s = createTank({ ...STARTER, tap: { kh: 6 }, seed: 1 });
    const dose = (st: TankState) => {
      if (st.water.tan < 1) st.water.tan = 1;
    };
    const cycled = (st: TankState) => {
      dose(st);
      simulate(st, 24);
      return st.water.tan < 0.25 && st.water.no2 < 0.25;
    };

    runDays(s, 2, { weeklyWaterChange: 0.5, onDay: dose });
    expect(cycled(structuredClone(s))).toBe(false);

    runDays(s, 12, { weeklyWaterChange: 0.5, onDay: dose });
    expect(cycled(structuredClone(s))).toBe(true);
    expect(s.water.no3).toBeGreaterThan(5);
  });

  it('新缸症候群：細菌還沒建立就一次放太多魚又餵太多，氨爆、魚生病', () => {
    // 養水只要 3–7 天，但一次放太多魚、餵太多，氨冒出來的速度比細菌長得快
    const s = createTank({ ...STARTER, seed: 2 });
    stock(s, 'guppy', 20);
    let peakTan = 0;
    let minHealth = 1;
    runDays(s, 10, {
      feedMultiplier: 3,
      onHour: (st) => {
        peakTan = Math.max(peakTan, st.water.tan);
        for (const f of alive(st)) minHealth = Math.min(minHealth, f.health);
      },
    });

    expect(peakTan).toBeGreaterThan(1);
    expect(minHealth).toBeLessThan(0.8);
  });

  it('同樣的魚放進已養好水的缸，每週換水，一個月後全部健康、測試劑讀不到氨', () => {
    const s = createTank({ ...STARTER, seed: 3, matureMedia: true });
    stock(s, 'guppy', 10);
    runDays(s, 30, { weeklyWaterChange: 0.3 });

    expect(alive(s)).toHaveLength(10);
    expect(testWater(s).ammonia).toBe(0);
    expect(testWater(s).nitrite).toBe(0);
    for (const f of alive(s)) expect(f.stress).toBeLessThan(0.3);
  });

  it('過度餵食：殘餌腐敗，氨明顯升高，魚的壓力上升', () => {
    const normal = createTank({ ...STARTER, seed: 4, matureMedia: true });
    const overfed = createTank({ ...STARTER, seed: 4, matureMedia: true });
    stock(normal, 'guppy', 10);
    stock(overfed, 'guppy', 10);
    let peakNormal = 0;
    let peakOverfed = 0;
    runDays(normal, 10, { onHour: (st) => (peakNormal = Math.max(peakNormal, st.water.tan)) });
    runDays(overfed, 10, { feedMultiplier: 6, onHour: (st) => (peakOverfed = Math.max(peakOverfed, st.water.tan)) });

    expect(peakOverfed).toBeGreaterThan(peakNormal * 3);
    expect(overfed.water.no3).toBeGreaterThan(normal.water.no3 + 3);
  });

  it('洗濾材陷阱：用自來水洗濾材殺死硝化菌，幾天內氨回升；用缸水洗則沒事', () => {
    const tap = createTank({ ...STARTER, seed: 5, matureMedia: true });
    stock(tap, 'guppy', 10);
    runDays(tap, 7);
    const tankWater = structuredClone(tap);

    rinseFilterMedia(tap, 'tap');
    rinseFilterMedia(tankWater, 'tank');
    let peakTap = 0;
    let peakTank = 0;
    runDays(tap, 4, { onHour: (st) => (peakTap = Math.max(peakTap, st.water.tan)) });
    runDays(tankWater, 4, { onHour: (st) => (peakTank = Math.max(peakTank, st.water.tan)) });

    // 硝化菌長得快，幾天內就補回來，但這幾天測得到氨
    expect(peakTap).toBeGreaterThan(0.1);
    expect(peakTap).toBeGreaterThan(peakTank * 3);
    expect(peakTank).toBeLessThan(0.05);
  });

  it('死魚沒撈出來會腐爛產生大量氨；撈掉就不會', () => {
    const left = createTank({ ...STARTER, tank: TANKS.nano20, filter: FILTERS.sponge, seed: 6, matureMedia: true });
    stock(left, 'guppy', 5);
    runDays(left, 3);
    for (const f of left.fish.slice(0, 3)) {
      f.alive = false;
      f.corpseMg = FISH_SPECIES.guppy.bodyMassMg;
    }
    const removed = structuredClone(left);
    expect(removeDeadFish(removed)).toBe(3);

    let peakLeft = 0;
    let peakRemoved = 0;
    runDays(left, 4, { onHour: (st) => (peakLeft = Math.max(peakLeft, st.water.tan)) });
    runDays(removed, 4, { onHour: (st) => (peakRemoved = Math.max(peakRemoved, st.water.tan)) });

    expect(peakLeft).toBeGreaterThan(peakRemoved * 3);
  });
});

describe('設備與環境', () => {
  it('缸子太小、魚太多：擁擠造成壓力', () => {
    const s = createTank({ ...STARTER, tank: TANKS.nano20, seed: 7, matureMedia: true });
    stock(s, 'guppy', 12);
    expect(computeStressors(s, s.fish[0]).crowding).toBeGreaterThan(0.5);

    const roomy = createTank({ ...STARTER, tank: TANKS.std90, seed: 7, matureMedia: true });
    stock(roomy, 'guppy', 12);
    expect(computeStressors(roomy, roomy.fish[0]).crowding).toBe(0);
  });

  it('群游魚數量不足會有壓力', () => {
    const s = createTank({ ...STARTER, seed: 8, matureMedia: true });
    stock(s, 'zebrafish', 2);
    expect(computeStressors(s, s.fish[0]).group).toBeGreaterThan(0);
    stock(s, 'zebrafish', 4);
    expect(computeStressors(s, s.fish[0]).group).toBe(0);
  });

  it('冬天加熱棒壞掉，水溫掉到孔雀魚適溫以下', () => {
    const s = createTank({ ...STARTER, roomTempC: 16, seed: 9, matureMedia: true });
    stock(s, 'guppy', 4);
    runDays(s, 2);
    expect(s.water.tempC).toBeGreaterThan(24);

    s.equipment.heater!.broken = true;
    runDays(s, 2);
    expect(s.water.tempC).toBeLessThan(19);
    expect(computeStressors(s, s.fish[0]).temperature).toBeGreaterThan(0.5);
  });

  it('加熱棒卡住一直加熱：水溫衝過 33°C 把孔雀魚煮熟；拔掉插頭後慢慢降回室溫', () => {
    const s = createTank({ ...STARTER, roomTempC: 24, seed: 21, matureMedia: true });
    stock(s, 'guppy', 4);
    runDays(s, 1);
    expect(s.water.tempC).toBeLessThan(26);

    s.equipment.heater!.broken = true;
    s.equipment.heater!.stuckOn = true;
    runDays(s, 1);
    expect(s.equipment.heater!.heating).toBe(true);
    expect(s.water.tempC).toBeGreaterThan(33);
    expect(computeStressors(s, s.fish[0]).temperature).toBeGreaterThan(0.5);

    unplugHeater(s);
    expect(s.equipment.heater!.heating).toBe(false);
    runDays(s, 2);
    expect(s.water.tempC).toBeLessThan(26);
    expect(s.equipment.heater!.broken).toBe(true);
  });

  it('加熱棒故障約四分之一是卡住一直加熱，並發出對應通知', () => {
    let stuck = 0;
    const runs = 1000;
    for (let seed = 1; seed <= runs; seed++) {
      const s = createTank({ ...STARTER, seed });
      breakHeater(s);
      const last = s.events[s.events.length - 1];
      expect(s.equipment.heater!.broken).toBe(true);
      expect(last.type).toBe(s.equipment.heater!.stuckOn ? 'heater_stuck' : 'heater_broke');
      if (s.equipment.heater!.stuckOn) stuck++;
    }
    expect(stuck / runs).toBeGreaterThan(0.2);
    expect(stuck / runs).toBeLessThan(0.3);
  });

  it('燈具會發熱：開燈時水溫比室溫高，水草燈比基本燈熱、小缸比大缸熱', () => {
    const noHeater = { ...STARTER, heater: null, roomTempC: 26, seed: 22 };
    const dark = createTank({ ...noHeater, light: null });
    const basic = createTank({ ...noHeater, light: { spec: LIGHTS.basic, startHour: 0, photoperiodHours: 16 } });
    const planted = createTank({ ...noHeater, light: { spec: LIGHTS.planted, startHour: 0, photoperiodHours: 16 } });
    // 跑到第三天的開燈後段（14 點），讓水溫接近平衡。
    for (const s of [dark, basic, planted]) simulate(s, 48 + 14);
    expect(basic.water.tempC - dark.water.tempC).toBeGreaterThan(0.3);
    expect(planted.water.tempC - basic.water.tempC).toBeGreaterThan(0.4);
    expect(planted.water.tempC - dark.water.tempC).toBeLessThan(1.5);

    const nano = createTank({ ...noHeater, tank: TANKS.nano20, light: { spec: LIGHTS.planted, startHour: 0, photoperiodHours: 16 } });
    simulate(nano, 48 + 14);
    expect(lightHeatC(nano)).toBeGreaterThan(lightHeatC(planted));

    // 關燈後燈熱歸零。
    simulate(planted, 4);
    expect(lightHeatC(planted)).toBe(0);
  });

  it('加熱棒功率不足時，大缸在冷房間達不到設定溫度', () => {
    const s = createTank({ ...STARTER, tank: TANKS.std90, heater: { spec: HEATERS.h25, targetC: 26 }, roomTempC: 15, seed: 10 });
    runDays(s, 3);
    expect(s.water.tempC).toBeLessThan(25);
  });

  it('換水沒對水溫：冷水讓魚緊迫', () => {
    const s = createTank({ ...STARTER, roomTempC: 16, seed: 11, matureMedia: true });
    stock(s, 'guppy', 4);
    runDays(s, 2);
    waterChange(s, 0.5, { tempC: 15 });
    expect(computeStressors(s, s.fish[0]).suddenChange).toBeGreaterThan(1);
  });

  it('CO₂ 注入讓 pH 下降；打氣機會把 CO₂ 趕跑、補充溶氧', () => {
    const co2 = createTank({ ...STARTER, light: { spec: LIGHTS.planted }, co2: CO2_KITS.diy, seed: 12 });
    const co2WithAir = createTank({ ...STARTER, light: { spec: LIGHTS.planted }, co2: CO2_KITS.diy, airPump: AIR_PUMPS.small, seed: 12 });
    // 模擬到隔天下午（開燈中）。
    simulate(co2, 24 + 16);
    simulate(co2WithAir, 24 + 16);

    expect(co2.water.co2).toBeGreaterThan(10);
    expect(co2.water.ph).toBeLessThan(7.2);
    expect(co2WithAir.water.co2).toBeLessThan(co2.water.co2 / 2);
    expect(co2WithAir.water.ph).toBeGreaterThan(co2.water.ph);
  });

  it('小缸 CO₂ 開太多：魚浮頭，最後窒息死亡', () => {
    const s = createTank({ ...STARTER, tank: TANKS.nano20, filter: FILTERS.canister, light: { spec: LIGHTS.planted }, co2: { ...CO2_KITS.diy, mgPerHour: 300 }, seed: 13, matureMedia: true });
    stock(s, 'guppy', 3);
    let sawGasping = false;
    runDays(s, 2, { onHour: (st) => (sawGasping ||= observeSymptoms(st, st.fish[0]).includes('gasping')) });
    expect(sawGasping).toBe(true);
    expect(s.events.find((e) => e.type === 'fish_died')?.cause).toBe('co2');
  });
});

describe('水草與藻類', () => {
  const PLANTED: CreateTankOptions = { ...STARTER, light: { spec: LIGHTS.planted }, co2: CO2_KITS.diy, matureMedia: true };

  it('陽性草在強光＋CO₂ 下長得快，三週內生物量增加一半以上', () => {
    const s = createTank({ ...PLANTED, seed: 14 });
    stock(s, 'zebrafish', 6);
    const rotala = addPlant(s, 'rotala', 3);
    runDays(s, 21, { weeklyWaterChange: 0.3 });
    expect(rotala.biomassG).toBeGreaterThan(4.5);
  });

  it('陽性草放在弱光、沒有 CO₂ 的缸裡會慢慢溶葉', () => {
    const s = createTank({ ...STARTER, seed: 15, matureMedia: true });
    stock(s, 'zebrafish', 6);
    const rotala = addPlant(s, 'rotala', 3);
    runDays(s, 21, { weeklyWaterChange: 0.3 });
    expect(rotala.biomassG).toBeLessThan(3);
  });

  it('陰性草在弱光下也能生長；放在強光下葉面長藻', () => {
    const low = createTank({ ...STARTER, seed: 16, matureMedia: true });
    const high = createTank({ ...PLANTED, seed: 16 });
    stock(low, 'zebrafish', 6);
    stock(high, 'zebrafish', 6);
    const anubiasLow = addPlant(low, 'anubias', 6);
    const anubiasHigh = addPlant(high, 'anubias', 6);
    runDays(low, 21, { weeklyWaterChange: 0.3 });
    runDays(high, 21, { weeklyWaterChange: 0.3 });

    expect(anubiasLow.biomassG).toBeGreaterThan(6);
    expect(anubiasLow.leafAlgae).toBeLessThan(0.05);
    expect(anubiasHigh.leafAlgae).toBeGreaterThan(0.2);
  });

  it('水草會吸收氮：同樣的魚，有草的缸硝酸鹽比較低', () => {
    const bare = createTank({ ...PLANTED, seed: 17 });
    const planted = createTank({ ...PLANTED, seed: 17 });
    stock(bare, 'guppy', 8);
    stock(planted, 'guppy', 8);
    for (let i = 0; i < 8; i++) addPlant(planted, 'rotala', 3);
    runDays(bare, 21);
    runDays(planted, 21);
    expect(planted.water.no3).toBeLessThan(bare.water.no3 * 0.6);
  });

  it('強光、沒有水草、硝酸鹽高：藻類爆發；水草茂盛的 CO₂ 缸藻類很少', () => {
    const algaeTank = createTank({ ...STARTER, light: { spec: LIGHTS.planted, photoperiodHours: 10 }, seed: 18, matureMedia: true });
    stock(algaeTank, 'guppy', 10);
    runDays(algaeTank, 30);

    const healthy = createTank({ ...PLANTED, seed: 18 });
    stock(healthy, 'guppy', 10);
    for (let i = 0; i < 4; i++) addPlant(healthy, 'rotala', 3);
    runDays(healthy, 30, { weeklyWaterChange: 0.3 });

    expect(algaeTank.algae).toBeGreaterThan(0.4);
    expect(healthy.algae).toBeLessThan(0.1);
  });

  it('長滿的水草可以修剪出插枝', () => {
    const s = createTank({ ...PLANTED, seed: 19 });
    const rotala = addPlant(s, 'rotala', 14);
    const cuttings = trimPlant(s, rotala.id);
    expect(cuttings).toBe(6);
    expect(rotala.biomassG).toBeCloseTo(8);
    expect(trimPlant(s, rotala.id)).toBe(0);
  });
});

describe('疾病', () => {
  it('帶白點蟲的新魚沒檢疫就下缸，會傳染給同缸的魚', () => {
    const s = createTank({ ...STARTER, seed: 20, matureMedia: true });
    stock(s, 'guppy', 8);
    addFish(s, 'guppy', { carriesIch: true, sex: 'male' });
    runDays(s, 14);
    const infected = s.fish.filter((f) => f.ich.stage !== 'none' || !f.alive).length;
    expect(infected).toBeGreaterThan(3);
    expect(s.events.some((e) => e.type === 'ich_visible')).toBe(true);
  });

  it('下藥加上提高水溫能控制白點病；不治療的缸持續惡化', () => {
    const untreated = createTank({ ...STARTER, seed: 21, matureMedia: true });
    stock(untreated, 'guppy', 8);
    addFish(untreated, 'guppy', { carriesIch: true, sex: 'male' });
    runDays(untreated, 7);
    const treated = structuredClone(untreated);

    setHeaterTarget(treated, 30);
    runDays(untreated, 28);
    runDays(treated, 28, { onDay: (st, d) => d % 3 === 0 && doseIchMedication(st) });

    const avgHealth = (st: TankState) => alive(st).reduce((sum, f) => sum + f.health, 0) / Math.max(1, alive(st).length);
    const sick = (st: TankState) => alive(st).filter((f) => f.ich.stage !== 'none').length;
    expect(sick(treated)).toBe(0);
    expect(sick(untreated)).toBeGreaterThan(3);
    expect(avgHealth(treated)).toBeGreaterThan(avgHealth(untreated) + 0.2);
  });

  it('白點藥對蝦有毒', () => {
    const s = createTank({ ...STARTER, seed: 22, matureMedia: true });
    stock(s, 'cherry_shrimp', 10);
    runDays(s, 3, { onDay: (st) => doseIchMedication(st, 2) });
    expect(alive(s).length).toBeLessThan(10);
    expect(s.events.find((e) => e.type === 'fish_died')?.cause).toBe('medication');
  });

  it('白點病有可觀察的症狀', () => {
    const s = createTank({ ...STARTER, seed: 23, matureMedia: true });
    const fish = addFish(s, 'guppy', { carriesIch: true, sex: 'male' });
    let sawFlashing = false;
    let sawSpots = false;
    runDays(s, 6, {
      onHour: (st) => {
        const sym = observeSymptoms(st, fish);
        sawFlashing ||= sym.includes('flashing');
        sawSpots ||= sym.includes('white_spots');
      },
    });
    expect(sawFlashing).toBe(true);
    expect(sawSpots).toBe(true);
  });
});

describe('可重現性', () => {
  it('同樣的種子與操作，得到完全相同的結果', () => {
    const run = () => {
      const s = createTank({ ...STARTER, seed: 42 });
      stock(s, 'guppy', 6);
      addFish(s, 'zebrafish');
      runDays(s, 10);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('狀態可以 JSON 存檔、讀檔後繼續模擬，結果一致', () => {
    const a = createTank({ ...STARTER, seed: 43 });
    stock(a, 'guppy', 6);
    runDays(a, 5);
    const b: TankState = JSON.parse(JSON.stringify(a));
    runDays(a, 5);
    runDays(b, 5);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
