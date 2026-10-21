import { describe, expect, it } from 'vitest';
import { blankGameState } from './game';
import {
  addFish,
  buyPlant,
  applySetup,
  FISH_SPECIES,
  feed,
  isCycled,
  PINCH_MEALS,
  setupCost,
  simulate,
  STARTING_COINS,
  useTestKit,
  waterChange,
  type SetupChoice,
  type TankState,
} from '../sim';

/**
 * 開缸三種組合（first-10-minutes.md §2.1 F1-a）：照新手基準玩法（1 株水草、一公兩母、每天一小撮、
 * 每天測水、測到氨或亞硝就換三成），便宜、推薦、高階都要在 7 天內養好水，便宜的最慢。
 * 室溫 25 度和冬天 18 度都跑一次（便宜組合的 25W 在 40L 冬天拉不滿溫度，菌長得更慢）。
 */

const CHEAP: SetupChoice = { tank: 'std40', filter: 'sponge', heater: 'h25', light: 'basic', substrate: 'sand', air: 'none' };
const RECOMMENDED: SetupChoice = { tank: 'std40', filter: 'hangOn', heater: 'h50', light: 'basic', substrate: 'sand', air: 'none' };
const PREMIUM: SetupChoice = { tank: 'std40', filter: 'hangOn', heater: 'h50', light: 'planted', substrate: 'soil', air: 'small' };
const NANO: SetupChoice = { tank: 'nano20', filter: 'sponge', heater: 'h25', light: 'basic', substrate: 'sand', air: 'none' };

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 回傳開缸後第幾天（含小數）養好水；14 天還沒好回傳 Infinity。 */
function cycleDays(choice: SetupChoice, roomC: number): number {
  const s = blankGameState(1);
  s.environment.roomTempC = roomC;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = roomC;
  expect(applySetup(s, choice)).toBeNull();
  // 在店裡買的（第一株一定夾帶扁卷螺，polish-to-9.md §4）
  buyPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
  for (let d = 0; d < 14; d++) {
    feed(s, meal(s) * PINCH_MEALS);
    for (let h = 1; h <= 24; h++) {
      simulate(s, 1);
      if (isCycled(s)) return d + h / 24;
    }
    const r = useTestKit(s);
    if (r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
  }
  return Infinity;
}

describe('開缸組合劇本（F1-a）', () => {
  it('三種組合都買得起，而且都剩錢買魚和水草', () => {
    for (const c of [CHEAP, RECOMMENDED, PREMIUM, NANO]) expect(STARTING_COINS - setupCost(c)).toBeGreaterThanOrEqual(300);
    expect(setupCost(CHEAP)).toBeLessThan(setupCost(RECOMMENDED));
    expect(setupCost(RECOMMENDED)).toBeLessThan(setupCost(PREMIUM));
  });

  for (const roomC of [25, 18]) {
    it(`室溫 ${roomC} 度：便宜、推薦、高階都在 7 天內養好水，便宜的最慢`, () => {
      const cheap = cycleDays(CHEAP, roomC);
      const recommended = cycleDays(RECOMMENDED, roomC);
      const premium = cycleDays(PREMIUM, roomC);
      for (const d of [cheap, recommended, premium, cycleDays(NANO, roomC)]) expect(d).toBeLessThanOrEqual(7);
      expect(cheap).toBeGreaterThan(recommended);
      expect(cheap).toBeGreaterThan(premium);
    }, 30_000);
  }
});
