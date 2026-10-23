import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addPlant, dailyTasks, doseIchMedication, feed, FISH_SPECIES, ICH_HEAT_C, nextStep, PINCH_MEALS, setHeaterTarget, simulate, updateDaily, useTestKit, waterChange, type TankState } from '../sim';

/**
 * 照下一步治白點（#324，評測 g20）：開局魚第 4 天出現白點，照任務卡做——叫下藥就下一份、說藥效中就把加熱棒調到 29°C 等——
 * 每天餵、測水、該換水就換。一次白點最多花一份藥，而且 14 天內治好。
 */
const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
const sick = (s: TankState) => alive(s).some((f) => f.ich.stage === 'visible');

function followSteps(seed: number) {
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
    const step = nextStep(tanks);
    steps.push(step?.text ?? '');
    if (step?.text.includes('去下藥')) {
      doseIchMedication(s);
      doses++;
    } else if (step?.text.includes('藥效中') && s.equipment.heater && s.equipment.heater.targetC < 28) setHeaterTarget(s, ICH_HEAT_C);
    simulate(s, 24);
    updateDaily(tanks);
    feed(s, meal(s) * PINCH_MEALS);
    const r = useTestKit(s);
    const tasks = dailyTasks(tanks)?.tasks.map((t) => t.id) ?? [];
    if (r.ammonia > 0 || r.nitrite > 0 || tasks.includes('water')) waterChange(s, 0.3);
  }
  return { doses, cured: !sick(s), steps };
}

describe('照下一步治白點（#324）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：一次白點只下一份藥，14 天內治好；下完藥任務卡改說藥效中`, () => {
      const { doses, cured, steps } = followSteps(seed);
      const log = steps.join(' / ');
      expect(doses, log).toBe(1);
      expect(cured, log).toBe(true);
      expect(steps[1], log).toMatch(/^藥效中，水溫調到 28～30°C，約 \d+ 天會好$/);
    });
  }
});
