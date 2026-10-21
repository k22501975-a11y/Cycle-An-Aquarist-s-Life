import { describe, expect, it } from 'vitest';
import { blankGameState } from './game';
import { addFish, applySetup, buyPlant, feed, FISH_SPECIES, PINCH_MEALS, simulate, takeGearNote, useTestKit, waterChange, type SetupChoice, type TankState } from '../sim';

/**
 * 開缸挑的設備有後果（polish-to-9.md G5）：便宜、推薦、高階三種開局照新手基準玩法玩 10 天，
 * 每天早上拿一句設備的後果；第 3～10 天每種開局至少被提到 2 次，而且三種開局說法不同。
 */

const CHEAP: SetupChoice = { tank: 'std40', filter: 'sponge', heater: 'h25', light: 'basic', substrate: 'sand', air: 'none' };
const RECOMMENDED: SetupChoice = { tank: 'std40', filter: 'hangOn', heater: 'h50', light: 'basic', substrate: 'sand', air: 'none' };
const PREMIUM: SetupChoice = { tank: 'std40', filter: 'hangOn', heater: 'h50', light: 'planted', substrate: 'soil', air: 'small' };

const meal = (s: TankState) => s.fish.filter((f) => f.alive).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 回傳每天早上（第幾天 → 那句話）。 */
function notes(choice: SetupChoice, roomC: number): Map<number, string> {
  const s = blankGameState(1);
  s.environment.roomTempC = roomC;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = roomC;
  expect(applySetup(s, choice)).toBeNull();
  buyPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
  const said = new Map<number, string>();
  for (let d = 1; d <= 12; d++) {
    // 早上 8 點醒來看報告
    const note = takeGearNote(s);
    if (note) said.set(d, note.text);
    feed(s, meal(s) * PINCH_MEALS);
    simulate(s, 24);
    const r = useTestKit(s);
    if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
  }
  return said;
}

describe('開缸設備的後果寫進早上報告（G5）', () => {
  for (const roomC of [25, 18]) {
    it(`室溫 ${roomC} 度：三種開局第 3～10 天都被提到至少 2 次，說法不同，第 3 天以前和第 10 天以後不說`, () => {
      const runs = [CHEAP, RECOMMENDED, PREMIUM].map((c) => notes(c, roomC));
      for (const said of runs) {
        expect(said.size, [...said.values()].join('\n')).toBeGreaterThanOrEqual(2);
        for (const day of said.keys()) {
          expect(day).toBeGreaterThanOrEqual(3);
          expect(day).toBeLessThanOrEqual(10);
        }
        // 同一句不重複
        expect(new Set(said.values()).size).toBe(said.size);
      }
      const texts = runs.map((said) => [...said.values()].join('|'));
      expect(new Set(texts).size).toBe(3);
    });
  }

  it('高階組合說得出水草泥讓 pH 降、打氣機；便宜組合說得出水妖精', () => {
    const premium = [...notes(PREMIUM, 25).values()].join('\n');
    expect(premium).toMatch(/水草泥讓 pH 降到 6\.\d/);
    expect(premium).toMatch(/打氣機/);
    expect([...notes(CHEAP, 25).values()].join('\n')).toMatch(/水妖精/);
    // 冬天 40L 配 25W 拉不滿溫度（setup.scenario.test.ts 的便宜組合最慢養好的原因）
    expect([...notes(CHEAP, 18).values()].join('\n')).toMatch(/25W 加熱棒拉不太動/);
  });
});
