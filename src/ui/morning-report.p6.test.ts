import { describe, expect, it } from 'vitest';
import { Game, newGameState } from '../game/game';
import { addFish, addPlant, BIG_WATER_CHANGE, createTank, feed, FILTERS, HEATERS, LIGHTS, measuredProblem, NORMAL_WATER_CHANGE, pinchMg, suggestedWaterChange, TANKS, type TankState } from '../sim';
import { lineGroup, morningReport, slimReport, snapshot } from './morning-report';

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
  it('有魚已經餓到開始消瘦：寫幾尾、口氣比「一天餵兩次」重（#315）', () => {
    const r = reportAfter((s) => {
      const fry = addFish(s, 'guppy', { carriesIch: false });
      fry.lengthCm = 0.8;
      fry.hunger = 0.65;
    });
    expect(r.items.find((i) => i.kind === 'hungry')).toMatchObject({ tone: 'warn', text: '1 尾魚餓到開始消瘦，今天不餵會餓死', action: 'feed' });
  });

  it('連 3 天要多餵、這天又有魚消瘦、錢夠：餵食器提示併進消瘦那行，排在壞消息最前面（daily-loop.md §7）', () => {
    const r = reportAfter((s) => {
      const fry = addFish(s, 'guppy', { carriesIch: false });
      fry.lengthCm = 0.8;
      fry.hunger = 0.65;
      s.feedWarn = { day: Math.floor(s.hours / 24) - 1, days: 2 };
      // 藻變多那行（warn）先寫進報告，消瘦那行還是要排第一
      s.algae += 0.1;
    });
    const hungry = r.items.filter((i) => i.kind === 'hungry');
    expect(hungry).toHaveLength(1);
    expect(hungry[0]).toMatchObject({ tone: 'warn', text: '1 尾魚開始消瘦，今天不餵會餓死', action: 'buy_feeder', goLabel: '裝自動餵食器' });
    expect(kinds(r).indexOf('algae')).toBeLessThan(kinds(r).indexOf('hungry'));
    expect(slimReport(r).lines[0]).toBe(hungry[0]);
    expect(lineGroup(hungry[0])).toBe('bad');
  });

  it('水草長了 1% 以上才寫「水草長了一點」', () => {
    const grew = reportAfter((s) => (s.plants[0].biomassG *= 1.05));
    expect(grew.items.find((i) => i.kind === 'plant_grew')).toMatchObject({ tone: 'info', text: '水草長了一點（+5%）' });
    expect(kinds(grew)).not.toContain('quiet');
    expect(kinds(reportAfter((s) => (s.plants[0].biomassG *= 1.005)))).not.toContain('plant_grew');
    // 睡前沒種、睡醒才種的不算
    expect(kinds(reportAfter((s) => void addPlant(s, 'moss')))).not.toContain('plant_grew');
  });

  it('魚的平均壓力降了一截才寫「放鬆了」；發色升一級才說顏色變亮', () => {
    const relaxed = reportAfter((s) => s.fish.forEach((f) => (f.stress = 0.2)));
    const item = relaxed.items.find((i) => i.kind === 'fish_relaxed');
    expect(item).toMatchObject({ tone: 'good', action: 'fish', text: '新來的魚慢慢適應新家，放鬆了' });
    expect(kinds(relaxed)).not.toContain('quiet');
    const bright = reportAfter((s) => s.fish.forEach((f) => ((f.stress = 0.2), (f.colorBoost = 0.3))));
    expect(bright.items.find((i) => i.kind === 'fish_relaxed')?.text).toBe('新來的魚放鬆了，顏色變亮');
    expect(kinds(reportAfter((s) => s.fish.forEach((f) => (f.stress -= 0.03))))).not.toContain('fish_relaxed');
  });

  it('放進缸 2 天以後的老住戶：昨天真的緊張過才說放鬆了，而且隔 3 天才再說（#237）', () => {
    const settled = () => {
      const s = tank();
      s.hours += 72;
      return s;
    };
    // 每天的小起伏（0.2 → 0.1）不寫
    let s = settled();
    s.fish.forEach((f) => (f.stress = 0.2));
    expect(kinds(reportAfter((x) => x.fish.forEach((f) => (f.stress = 0.1)), s))).not.toContain('fish_relaxed');
    // 換缸、生病過（0.5 → 0.2）才寫，說的不是「適應新家」
    s = settled();
    s.fish.forEach((f) => (f.stress = 0.5));
    const r = reportAfter((x) => x.fish.forEach((f) => (f.stress = 0.2)), s);
    expect(r.items.find((i) => i.kind === 'fish_relaxed')?.text).toBe('昨天緊張的魚放鬆了，鰭又張開了');
    // 隔天又緊張又放鬆：3 天內不重複
    s.hours += 24;
    s.fish.forEach((f) => (f.stress = 0.5));
    expect(kinds(reportAfter((x) => x.fish.forEach((f) => (f.stress = 0.2)), s))).not.toContain('fish_relaxed');
    s.hours += 48;
    s.fish.forEach((f) => (f.stress = 0.5));
    expect(kinds(reportAfter((x) => x.fish.forEach((f) => (f.stress = 0.2)), s))).toContain('fish_relaxed');
  });

  it('氨第一次讀到 0.25：警告、點了去換水，排在好消息前面', () => {
    const r = reportAfter((s) => {
      s.water.tan = 0.3;
      s.plants[0].biomassG *= 1.05;
    });
    expect(r.items.find((i) => i.kind === 'ammonia')).toMatchObject({ tone: 'warn', action: 'water_change', text: '氨 0.25，水開始髒了，換一半的水' });
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

  it('建議換水量：換三成讀數掉得下來就三成，掉不下來（第 1 天讀 0.25）就換一半（#237）', () => {
    const s = tank();
    s.water.tan = 0;
    s.water.no2 = 0;
    expect(suggestedWaterChange(s)).toBe(NORMAL_WATER_CHANGE);
    // 0.22 讀 0.25：三成後 0.154 還是 0.25，一半後 0.11 讀 0
    s.water.tan = 0.22;
    expect(suggestedWaterChange(s)).toBe(BIG_WATER_CHANGE);
    // 0.45 讀 0.5：三成後 0.315 讀 0.25，掉一格
    s.water.tan = 0.45;
    expect(suggestedWaterChange(s)).toBe(NORMAL_WATER_CHANGE);
    s.water.tan = 0;
    s.water.no2 = 0.2;
    expect(suggestedWaterChange(s)).toBe(BIG_WATER_CHANGE);
    // 報告的文字跟著建議走
    const r = reportAfter((x) => (x.water.tan = 0.45));
    expect(r.items.find((i) => i.kind === 'ammonia')?.text).toBe('氨 0.5，水開始髒了，換三成水');
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

  it('細菌白濁第一次看得出來時說一次是新缸常見的（整個存檔一次）', () => {
    const s = tank();
    s.water.tan = 0;
    s.water.no2 = 0;
    expect(kinds(reportAfter((t) => (t.water.tan = 0.02), s))).not.toContain('bloom');
    const r = reportAfter((t) => (t.water.tan = 0.25), s);
    expect(r.items.find((i) => i.kind === 'bloom')?.text).toContain('新缸常見的細菌白濁');
    expect(kinds(reportAfter((t) => (t.water.tan = 0.5), s))).not.toContain('bloom');
  });
});
