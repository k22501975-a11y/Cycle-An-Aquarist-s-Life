import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addBottledBacteria, addFish, addHardscape, addPlant, FISH_SPECIES, feed, HARDSCAPE, newTankSyndrome, observeSymptoms, type NewTankSyndromeStatus, PINCH_MEALS, simulate, useTestKit, waterChange, type TankState, type TestKitReading } from '../sim';
import { advanceQuest, currentQuest, newProgress } from '../ui/tutorial';

/**
 * 新缸的氨（design/polish-to-9.md §6.3「P6 的新缸氨數值」、§6「P6 實作確認」）：基準玩法——40L、一公兩母、一株草、一天一小撮、
 * 沒加菌液，任務叫你做什麼就做，每天早上測水、測到氨或亞硝就換三成水（跟新手節奏劇本一樣）。
 * 第 1 天早上讀 0.25、第 2～3 天最高 0.5、亞硝第 3～4 天讀 0.25、第 5 天都回到 0；
 * 換水讀數掉一格；加菌液新缸症候群不出現、一直讀 0；都不換水魚會緊張（磨身、浮頭）但不會死。
 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
/** 買來的那一公兩母（不算缸裡生的小魚）。 */
const bought = (s: TankState) => alive(s).filter((f) => (f.generation ?? 0) === 0);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
const steady = (s: TankState) => {
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
};

interface Run {
  /** 第 d 天早上（第 d 次過夜後、換水前）的測試劑讀數；第 0 天是剛放魚時。 */
  readings: TestKitReading[];
  /** 讀到 0.5 的那天早上，換三成水以後馬上再測的讀數（換水前後各一筆）。 */
  drops: { before: number; after: number }[];
  /** 整段期間有沒有魚看得出緊張（磨身、浮頭）。 */
  nervous: boolean;
  minHealth: number;
  /** 第 1 天早上新缸症候群的狀態（早上報告用來說原因）。 */
  syndrome: NewTankSyndromeStatus;
  tank: TankState;
}

function play(seed: number, opts: { bacteria?: boolean; changeWater?: boolean } = {}): Run {
  const changeWater = opts.changeWater ?? true;
  const s = newGameState(seed);
  steady(s);
  const p = newProgress();
  const act = () => {
    for (let q = advanceQuest(p, s); q; q = advanceQuest(p, s));
  };
  act();
  const readings: TestKitReading[] = [];
  const drops: Run['drops'] = [];
  let syndrome: NewTankSyndromeStatus = 'none';
  let nervous = false;
  let minHealth = 1;
  for (let d = 0; d <= 6; d++) {
    if (currentQuest(p)?.id === 'fish') {
      if (opts.bacteria) addBottledBacteria(s);
      for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
    }
    act();
    if (d === 0) readings.push(useTestKit(s));
    feed(s, meal(s) * PINCH_MEALS);
    act();
    if (currentQuest(p)?.id === 'plant') addPlant(s, 'anubias');
    act();
    if (currentQuest(p)?.id === 'test') useTestKit(s);
    act();
    if (currentQuest(p)?.id === 'water' && changeWater) waterChange(s, 0.3);
    act();
    if (currentQuest(p)?.id === 'scape') addHardscape(s, HARDSCAPE.lava);
    act();
    if (currentQuest(p)?.id === 'name') s.label = '我的第一缸';
    act();
    for (let h = 0; h < 24; h++) {
      simulate(s, 1);
      for (const f of bought(s)) {
        minHealth = Math.min(minHealth, f.health);
        const sym = observeSymptoms(s, f);
        if (sym.includes('flashing') || sym.includes('gasping')) nervous = true;
      }
    }
    const r = useTestKit(s);
    readings.push(r);
    if (d === 0) syndrome = newTankSyndrome(s);
    act();
    if (changeWater && (r.ammonia > 0 || r.nitrite > 0)) {
      waterChange(s, 0.3);
      if (r.ammonia === 0.5) drops.push({ before: r.ammonia, after: useTestKit(s).ammonia });
    }
  }
  return { readings, drops, nervous, minHealth, syndrome, tank: s };
}

const deaths = (s: TankState) => s.events.filter((e) => e.type === 'fish_died');

describe('新缸的氨（polish-to-9.md §6.3 P6）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：基準玩法第 1 天讀 0.25、第 2～3 天最高 0.5、第 5 天回到 0，魚都活著`, () => {
      const { readings, syndrome, tank } = play(seed);
      // 測到氨的原因說得出來：新缸症候群
      expect(syndrome).toBe('active');
      const ammonia = readings.map((r) => r.ammonia);
      const nitrite = readings.map((r) => r.nitrite);
      expect(ammonia[0]).toBe(0);
      // 第一個「測到的問題」
      expect(ammonia[1]).toBe(0.25);
      // 第 2～3 天最高 0.5，整段都不會更高
      expect(Math.max(ammonia[2], ammonia[3])).toBe(0.5);
      expect(Math.max(...ammonia)).toBe(0.5);
      // 亞硝酸鹽第 3～4 天出現，讀 0.25
      expect(Math.max(nitrite[3], nitrite[4])).toBe(0.25);
      expect(Math.max(...nitrite)).toBe(0.25);
      expect(Math.max(nitrite[0], nitrite[1], nitrite[2])).toBe(0);
      // 第 5 天氨和亞硝都回到 0，之後也不會再冒出來
      for (const d of [5, 6]) expect([ammonia[d], nitrite[d]]).toEqual([0, 0]);
      expect(deaths(tank)).toEqual([]);
      expect(bought(tank)).toHaveLength(3);
    }, 120_000);
  }

  it('換三成水：讀 0.5 的那天換完馬上測，掉一格到 0.25', () => {
    for (const seed of [1, 2, 3]) {
      const { drops } = play(seed);
      expect(drops.length).toBeGreaterThan(0);
      for (const d of drops) expect(d).toEqual({ before: 0.5, after: 0.25 });
    }
  }, 120_000);

  it('放魚前倒了硝化菌液：新缸症候群不出現，氨和亞硝一直讀 0', () => {
    for (const seed of [1, 2, 3]) {
      const { readings, syndrome, tank } = play(seed, { bacteria: true });
      // 看不到問題本身就是菌液的回報；早上報告說「菌液讓新缸症候群沒出現」
      expect(syndrome).toBe('prevented_by_bacteria');
      expect(Math.max(...readings.map((r) => r.ammonia))).toBe(0);
      expect(Math.max(...readings.map((r) => r.nitrite))).toBe(0);
      expect(deaths(tank)).toEqual([]);
    }
  }, 120_000);

  it('照建議都不換水：魚會緊張（磨身、浮頭），但不會死', () => {
    for (const seed of [1, 2, 3]) {
      const { readings, nervous, minHealth, tank } = play(seed, { changeWater: false });
      // 不換水氨比較高，但還是會自己退
      expect(Math.max(...readings.map((r) => r.ammonia))).toBe(0.5);
      expect(nervous).toBe(true);
      expect(deaths(tank)).toEqual([]);
      expect(bought(tank)).toHaveLength(3);
      expect(minHealth).toBeGreaterThan(0.9);
    }
  }, 120_000);
});
