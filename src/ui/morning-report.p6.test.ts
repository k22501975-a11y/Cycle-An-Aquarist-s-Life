import { describe, expect, it } from 'vitest';
import { Game, newGameState } from '../game/game';
import { addFish, addPlant, createTank, feed, FILTERS, HEATERS, LIGHTS, measuredProblem, pinchMg, TANKS, type TankState } from '../sim';
import { morningReport, snapshot } from './morning-report';

/** 養好水、種一株草、一公兩母孔雀魚的缸。 */
function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  addPlant(s, 'rotala');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false });
  return s;
}

/** 拍快照、照 change 改缸（假裝過了一晚），寫報告。 */
function reportAfter(change: (s: TankState) => void, s = tank()) {
  const before = snapshot([s]);
  change(s);
  return morningReport(before, [s], 12, null);
}

const kinds = (r: ReturnType<typeof reportAfter>) => r.items.map((i) => i.kind);

describe('早上報告寫玩家自己做的事的結果（polish-to-9 §6 P6）', () => {
  it('水草長了 1% 以上才寫「水草長了一點」', () => {
    const grew = reportAfter((s) => (s.plants[0].biomassG *= 1.05));
    expect(grew.items.find((i) => i.kind === 'plant_grew')).toMatchObject({ tone: 'good', text: '水草長了一點（+5%）' });
    expect(kinds(grew)).not.toContain('quiet');
    expect(kinds(reportAfter((s) => (s.plants[0].biomassG *= 1.005)))).not.toContain('plant_grew');
    // 睡前沒種、睡醒才種的不算
    expect(kinds(reportAfter((s) => void addPlant(s, 'moss')))).not.toContain('plant_grew');
  });

  it('魚的平均壓力降了一截才寫「放鬆了」；發色升一級才說顏色變亮', () => {
    const relaxed = reportAfter((s) => s.fish.forEach((f) => (f.stress = 0.2)));
    const item = relaxed.items.find((i) => i.kind === 'fish_relaxed');
    expect(item).toMatchObject({ tone: 'good', action: 'fish', text: '魚慢慢適應新家，放鬆了' });
    expect(kinds(relaxed)).not.toContain('quiet');
    const bright = reportAfter((s) => s.fish.forEach((f) => ((f.stress = 0.2), (f.colorBoost = 0.3))));
    expect(bright.items.find((i) => i.kind === 'fish_relaxed')?.text).toBe('魚放鬆了，顏色變亮');
    expect(kinds(reportAfter((s) => s.fish.forEach((f) => (f.stress -= 0.03))))).not.toContain('fish_relaxed');
  });

  it('氨第一次讀到 0.25：警告、點了去換水，排在好消息前面', () => {
    const r = reportAfter((s) => {
      s.water.tan = 0.3;
      s.plants[0].biomassG *= 1.05;
    });
    expect(r.items.find((i) => i.kind === 'ammonia')).toMatchObject({ tone: 'warn', action: 'water_change', text: '氨 0.25，水開始髒了，換三成水' });
    expect(kinds(r).indexOf('ammonia')).toBeLessThan(kinds(r).indexOf('plant_grew'));
    expect(kinds(r)).not.toContain('quiet');
    // 睡前就已經讀得到：不重複
    const s = tank();
    s.water.tan = 0.3;
    expect(kinds(reportAfter((x) => (x.water.tan = 0.6), s))).not.toContain('ammonia');
    // 讀數還在 0（< 0.125）
    expect(kinds(reportAfter((x) => (x.water.tan = 0.1)))).not.toContain('ammonia');
    // 沒魚（無魚養水滴氨水）不叫玩家換水
    const empty = tank();
    empty.fish = [];
    expect(kinds(reportAfter((x) => (x.water.tan = 0.3), empty))).not.toContain('ammonia');
  });

  it('measuredProblem 照測試劑讀數：氨優先，其次亞硝酸', () => {
    const s = tank();
    s.water.tan = 0;
    s.water.no2 = 0;
    expect(measuredProblem(s)).toBeNull();
    s.water.no2 = 0.3;
    expect(measuredProblem(s)).toBe('nitrite');
    s.water.tan = 0.2;
    expect(measuredProblem(s)).toBe('ammonia');
    s.water.tan = 0.1; // 色卡讀 0
    expect(measuredProblem(s)).toBe('nitrite');
  });

  it('真實的第一晚：新缸、種草、放一公兩母、餵一小撮、過一晚', () => {
    const s = newGameState(42);
    addPlant(s, 'moss');
    for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false });
    feed(s, pinchMg(s));
    const game = new Game(s);
    const before = snapshot(game.tanks);
    const r = game.sleep();
    const report = morningReport(before, game.tanks, r.hours, r.crisis);
    expect(kinds(report).some((k) => k === 'plant_grew' || k === 'fish_relaxed')).toBe(true);
    expect(kinds(report)).not.toContain('quiet');
  });
});
