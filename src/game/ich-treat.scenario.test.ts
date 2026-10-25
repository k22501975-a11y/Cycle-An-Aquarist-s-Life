import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addPlant, changeDilutesIch, checkGoals, dailyTasks, doseIchMedication, feed, FISH_SPECIES, goalState, ichHeatC, ichMedDays, ichMedShort, ichTreatment, needsMedicine, nextStep, PINCH_MEALS, setHeaterTarget, simulate, updateDaily, useTestKit, waterChange, type TankState } from '../sim';

/**
 * 照下一步治白點（#324，評測 g20）：開局魚第 4 天出現白點，照任務卡做——叫下藥就下一份、說藥效中就把加熱棒調到說的溫度（孔雀魚缸 28°C，不超過適溫上限）等——
 * 每天餵、測水、該換水就換。一次白點最多花一份藥，而且 14 天內治好。
 */
const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
const sick = (s: TankState) => alive(s).some((f) => f.ich.stage === 'visible');

/** bigChange：第一次下藥那天照早上的建議換一半的水（g25 #384）。 */
function followSteps(seed: number, bigChange = false) {
  const s = newGameState(seed);
  const tanks = [s];
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { sex, carriesIch: false });
  simulate(s, 3 * 24);
  // 開局魚帶來的白點：一尾看得到，水裡有游走的蟲
  s.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
  s.water.ichPathogen = 1;
  let doses = 0;
  const steps: string[] = [];
  for (let d = 0; d < 14 && (sick(s) || d === 0); d++) {
    let step = nextStep(tanks);
    steps.push(step?.text ?? '');
    if (step?.text.includes('去下藥')) {
      doseIchMedication(s);
      doses++;
      if (bigChange && d === 0) {
        waterChange(s, 0.5, { tempC: s.water.tempC });
        step = nextStep(tanks);
        steps.push(step?.text ?? '');
      }
    }
    if (step?.text.includes('補一份')) {
      doseIchMedication(s);
      doses++;
    } else if (step?.text.includes('藥效中') && s.equipment.heater && s.equipment.heater.targetC < ichHeatC(s)) setHeaterTarget(s, ichHeatC(s));
    simulate(s, 24);
    updateDaily(tanks);
    feed(s, meal(s) * PINCH_MEALS);
    const r = useTestKit(s);
    const tasks = dailyTasks(tanks)?.tasks.map((t) => t.id) ?? [];
    if (r.ammonia > 0 || r.nitrite > 0 || tasks.includes('water')) waterChange(s, 0.3);
  }
  return { s, doses, cured: !sick(s), steps };
}

describe('照下一步治白點（#324）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：一次白點只下一份藥，14 天內治好；下完藥任務卡改說藥效中`, () => {
      const { doses, cured, steps } = followSteps(seed);
      const log = steps.join(' / ');
      expect(doses, log).toBe(1);
      expect(cured, log).toBe(true);
      expect(steps[1], log).toMatch(/^藥效中，水溫調到 28°C，約 \d+ 天會好$/);
    });
  }

  it('調幾度看缸裡的魚：孔雀魚缸 28°C；有水晶蝦（上限 24°C）的缸不叫你調高（架構 #329）', () => {
    const s = newGameState(1);
    addFish(s, 'guppy', { sex: 'female', carriesIch: false });
    expect(ichHeatC(s)).toBe(28);
    s.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    s.water.medication = 1;
    expect(ichTreatment([s])?.heatC).toBe(28);
    addFish(s, 'crystal_shrimp', { carriesIch: false });
    expect(ichHeatC(s)).toBe(24);
    s.water.tempC = 24;
    if (s.equipment.heater) setHeaterTarget(s, 24);
    expect(ichTreatment([s])?.heatC).toBeNull();
    expect(nextStep([s])?.text).toMatch(/^藥效中，約 \d+ 天會好$/);
  });

  it('兩缸：這缸下過藥了、另一缸的病魚還沒藥，要下藥的是另一缸（#356）', () => {
    const viewing = newGameState(1);
    const other = newGameState(2);
    for (const t of [viewing, other]) {
      addFish(t, 'guppy', { sex: 'female', carriesIch: false });
      t.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    }
    doseIchMedication(viewing);
    expect(needsMedicine(viewing)).toBe(false);
    expect(needsMedicine(other)).toBe(true);
    expect([viewing, other].findIndex(needsMedicine)).toBe(1);
    expect(ichMedDays(viewing)).toBeGreaterThan(0);
    expect(ichMedDays(other)).toBe(0);
    // 兩缸都下過藥了才說藥效中
    expect(nextStep([viewing, other])?.text).toBe('有魚生病了，去下藥');
    doseIchMedication(other);
    expect(nextStep([viewing, other])?.text).toMatch(/^藥效中/);
  });
});

describe('治白點中換水沖淡藥（#384，g25）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：下藥當天換一半的水，任務卡說補一份；照做最多兩份藥治好，之後兩週白點不再回來`, () => {
      const { s, doses, cured, steps } = followSteps(seed, true);
      const log = steps.join(' / ');
      expect(steps[1], log).toBe('藥效撐不到白點掉，再補一份藥');
      expect(doses, log).toBe(2);
      expect(cured, log).toBe(true);
      for (let d = 0; d < 14; d++) {
        feed(s, meal(s) * PINCH_MEALS);
        simulate(s, 24);
        expect(sick(s), `第 ${d + 1} 天又有白點`).toBe(false);
      }
      expect(s.water.ichCause).toBeUndefined();
    });
  }

  it('下藥當天換三成水不用補，換一半要補；換完就提醒', () => {
    const s = newGameState(1);
    addFish(s, 'guppy', { sex: 'female', carriesIch: false });
    s.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    doseIchMedication(s);
    expect(ichMedShort(s)).toBe(false);
    expect(changeDilutesIch(s, 0.3)).toBe(false);
    expect(changeDilutesIch(s, 0.5)).toBe(true);
    waterChange(s, 0.5, { tempC: s.water.tempC });
    expect(ichMedShort(s)).toBe(true);
    expect(needsMedicine(s)).toBe(true);
    expect(ichTreatment([s])).toMatchObject({ short: true });
    expect(nextStep([s])?.text).toBe('藥效撐不到白點掉，再補一份藥');
    doseIchMedication(s);
    expect(ichTreatment([s])).toMatchObject({ short: false });
  });

  it('上一波的白點都掉了、蟲還沒死光又上身：原因寫「沒斷根」不寫店裡買的魚；蟲死光前不算治好', () => {
    const s = newGameState(1);
    const tanks = [s];
    addPlant(s, 'anubias');
    for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { sex, carriesIch: false });
    s.fish[0].ich = { stage: 'visible', progress: 0.99, cause: 'new_fish' };
    checkGoals(tanks);
    // 白點掉下來，包囊還在底砂：好了但還不算治好
    simulate(s, 2);
    expect(s.fish[0].ich.stage).toBe('none');
    expect(s.water.ichCause).toBe('new_fish');
    checkGoals(tanks);
    expect(goalState(tanks).cured).toBeFalsy();
    // 沒下藥：包囊破了，蟲又上身
    let cause: string | undefined;
    for (let h = 0; h < 10 * 24 && !cause; h++) {
      simulate(s, 1);
      cause = s.events.find((e) => e.type === 'ich_visible')?.cause;
      s.events = [];
      if (h % 12 === 0) feed(s, meal(s));
    }
    expect(cause).toBe('relapse');
  });

  it('蟲死光了才算第一次治好', () => {
    const s = newGameState(1);
    const tanks = [s];
    addFish(s, 'guppy', { sex: 'female', carriesIch: false });
    s.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    checkGoals(tanks);
    s.fish[0].ich = { stage: 'none', progress: 0 };
    s.water.ichCause = 'new_fish';
    s.water.ichCysts = 1;
    checkGoals(tanks);
    expect(goalState(tanks).cured).toBeFalsy();
    s.water.ichCysts = 0;
    s.water.ichPathogen = 0;
    delete s.water.ichCause;
    checkGoals(tanks);
    expect(goalState(tanks).cured).toBe(true);
  });

  it('要升溫的那缸加熱棒壞了：叫你先換一支再調，不叫你直接調（#389 架構）', () => {
    const s = newGameState(1);
    addFish(s, 'guppy', { sex: 'female', carriesIch: false });
    s.fish[0].ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    s.water.tempC = 25;
    doseIchMedication(s);
    expect(nextStep([s])?.text).toMatch(/^藥效中，水溫調到 28°C，約 \d+ 天會好$/);
    s.equipment.heater!.broken = true;
    expect(ichTreatment([s])).toMatchObject({ heatC: 28, fixHeater: true, short: false });
    expect(nextStep([s])?.text).toMatch(/^藥效中，加熱棒壞了，換一支再調到 28°C，約 \d+ 天會好$/);
  });
});
