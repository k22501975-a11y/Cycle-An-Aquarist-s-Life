import { describe, expect, it } from 'vitest';
import { addFish, crowdingRatio, DEFAULT_TIME_SCALE, linkTanks, type TankState } from '../sim';
import { awayReport } from '../ui/morning-report';
import { newGameState } from './game';
import { catchUp } from './save';

/** 離線時擠缸（midgame.md §7.7）：沒看過提醒的不會擠死魚，回來報告第一行寫你不在的時候太擠了，接著出 C14。 */
describe('離線時擠缸', () => {
  const crowdedHome = (): TankState => {
    const s = newGameState(7);
    linkTanks([s]);
    while (crowdingRatio(s) < 1.3) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    // 氨偏高、幾尾魚快撐不住：離線期間會一直被氨傷到
    s.water.tan = 1;
    for (const f of s.fish.slice(0, 4)) f.health = 1e-3;
    return s;
  };
  const away = (s: TankState, days: number) => {
    const now = 1_700_000_000_000;
    const hoursBefore = s.hours;
    const r = catchUp({ version: 1, savedAt: now - ((days * 24) / DEFAULT_TIME_SCALE) * 3_600_000, timeScale: DEFAULT_TIME_SCALE, state: s }, now);
    return { r, since: hoursBefore };
  };

  it('沒看過提醒：離線 7 天沒有擠死魚，回來先說太擠了、馬上出 C14', () => {
    const s = crowdedHome();
    s.crowdNotices = 0;
    const { r, since } = away(s, 7);
    expect(r.hours).toBeGreaterThanOrEqual(7 * 24 - 1);
    const crowdCauses = ['ammonia', 'nitrite', 'oxygen', 'co2', 'chronic_stress', 'ich'];
    expect(r.events.filter((e) => e.type === 'fish_died' && crowdCauses.includes(String(e.cause)))).toEqual([]);
    const report = awayReport([s], since, r.hours)!;
    expect(report.items[0].text).toMatch(/^你不在的時候.*太擠了$/);
    expect(report.items.find((i) => i.choice)?.choice?.id).toBe('C14');
  });

  it('離開前看過 2 次提醒：照常逐步擠死，全家一天最多 2 尾', () => {
    const s = crowdedHome();
    s.crowdNotices = 2;
    const { r } = away(s, 3);
    const died = r.events.filter((e) => e.type === 'fish_died');
    expect(died.length).toBeGreaterThan(0);
    const perDay = new Map<number, number>();
    for (const e of died) perDay.set(Math.floor(e.hours / 24), (perDay.get(Math.floor(e.hours / 24)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
  });

  it('連續兩次短離開：第二次不再出報告和 C14，提醒次數也不再加', () => {
    const s = crowdedHome();
    s.crowdNotices = 0;
    const first = away(s, 1 / 12);
    expect(awayReport([s], first.since, first.r.hours)?.items.some((i) => i.choice?.id === 'C14')).toBe(true);
    const notices = s.crowdNotices;
    const second = away(s, 1 / 12);
    expect(awayReport([s], second.since, second.r.hours)).toBeNull();
    expect(s.crowdNotices).toBe(notices);
  });

  it('離開期間沒擠過：沒有離線報告', () => {
    const s = newGameState(7);
    linkTanks([s]);
    const { r, since } = away(s, 2);
    expect(awayReport([s], since, r.hours)).toBeNull();
  });
});
