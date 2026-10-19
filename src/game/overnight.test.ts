import { describe, expect, it } from 'vitest';
import { addBottledBacteria, addFish, addPlant, createTank, FILTERS, HEATERS, LIGHTS, recordEvent, TANKS, type TankState } from '../sim';
import { morningReport, snapshot } from '../ui/morning-report';
import { Game, hoursUntilMorning, newGameState } from './game';

function cycledTank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  for (let i = 0; i < 4; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
  return s;
}

/** 過一晚＋寫報告（畫面會這樣用）。 */
function night(game: Game) {
  const before = snapshot(game.tanks);
  const r = game.sleep();
  return { ...r, report: morningReport(before, game.tanks, r.hours, r.crisis) };
}

describe('「過一晚」（first-10-minutes.md F2）', () => {
  it('跳到下一個早上 8 點，最多 24 小時', () => {
    expect(hoursUntilMorning(20)).toBe(12);
    expect(hoursUntilMorning(2)).toBe(6);
    expect(hoursUntilMorning(8)).toBe(24);
    expect(hoursUntilMorning(24 * 5 + 8)).toBe(24);
    const game = new Game(cycledTank());
    const { hours, crisis, report } = night(game);
    expect(crisis).toBeNull();
    expect(hours).toBeCloseTo(12);
    expect(game.state.hours % 24).toBeCloseTo(8);
    expect(report.title).toBe('早安，第 2 天');
  });

  it('半夜加熱棒卡住：停在那一刻，報告第一條是危機，點了去設備', () => {
    const game = new Game(cycledTank());
    game.state.equipment.heater!.broken = true;
    game.state.equipment.heater!.stuckOn = true;
    const { hours, crisis, report } = night(game);
    expect(crisis?.reason).toBe('too_hot');
    expect(hours).toBeLessThan(12);
    expect(report.stopped).toBe(true);
    expect(report.items[0]).toMatchObject({ kind: 'crisis', tone: 'bad', action: 'equipment' });
    expect(game.state.fish.every((f) => f.alive)).toBe(true);
  });

  it('養水：早上報告寫進度；硝化菌夠了、氨和亞硝酸處理掉的那一晚，報告說水養好了', () => {
    const s = newGameState(42);
    addPlant(s, 'moss');
    s.water.tan = 1; // 無魚養水：滴了氨水
    const game = new Game(s);
    expect(night(game).report.items.find((i) => i.kind === 'cycle')?.text).toMatch(/養水進度/);
    // 倒了硝化菌液：菌一下就夠了，但氨和亞硝酸還要幾晚才降下來
    addBottledBacteria(game.state);
    expect(night(game).report.items.find((i) => i.kind === 'cycle')?.text).toContain('硝化菌夠了');

    // 菌已經夠了，只剩一點氨：今晚就處理掉
    const ready = newGameState(7);
    ready.bacteria.aob = ready.bacteria.nob = 0.35;
    ready.water.tan = 0.15;
    expect(night(new Game(ready)).report.items[0]).toMatchObject({ kind: 'cycled', tone: 'good', action: 'test_water' });
  });

  it('母魚快生了：早上報告有出生，數量對得上', () => {
    const s = cycledTank();
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true });
    mom.pregnancy = 0.995;
    const game = new Game(s);
    let birth;
    for (let d = 0; d < 3 && !birth; d++) birth = night(game).report.items.find((i) => i.kind === 'birth');
    expect(birth?.count).toBeGreaterThan(0);
    expect(birth?.action).toBe('fish');
  });

  it('過一晚的事件照常通知，通知時 sleeping 是 true（畫面可以不跳提示）', () => {
    const s = cycledTank();
    s.fish[0].health = -1;
    const game = new Game(s);
    const seen: boolean[] = [];
    game.onEvent(() => seen.push(game.sleeping));
    const { report } = night(game);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
    expect(game.sleeping).toBe(false);
    // 死魚是危機：停下來，報告寫原因、點了去撈
    expect(report.items[0]).toMatchObject({ kind: 'crisis', action: 'remove_dead' });
  });

  it('晚上有小魚被吃：報告寫被吃了幾尾、不寫平安，點了去檢疫盒（#176）', () => {
    const game = new Game(cycledTank());
    const before = snapshot(game.tanks);
    game.act((st) => {
      recordEvent(st, { type: 'fry_eaten', cause: 'guppy', count: 3 });
      recordEvent(st, { type: 'fry_eaten', cause: 'guppy', count: 2 });
    });
    const report = morningReport(before, game.tanks, 12, null);
    const item = report.items.find((x) => x.kind === 'eaten');
    expect(item?.text).toContain('5 尾小魚被大魚吃掉');
    expect(item?.action).toBe('fry_box');
    expect(report.items.some((x) => x.kind === 'quiet')).toBe(false);
  });
});
