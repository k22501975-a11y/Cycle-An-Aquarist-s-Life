import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, HEATERS, LIGHTS, simulate, TANKS, type CreateTankOptions, type TankState } from '../sim';
import { firstDeathOwnerLine } from './labels';
import { morningReport, snapshot, type MorningReport } from './morning-report';

const STARTER: CreateTankOptions = {
  tank: TANKS.std40,
  filter: FILTERS.hangOn,
  heater: { spec: HEATERS.h50, targetC: 25 },
  light: { spec: LIGHTS.basic },
  roomTempC: 24,
  seed: 31,
  matureMedia: true,
};

function stocked(options: Partial<CreateTankOptions> = {}): TankState {
  const s = createTank({ ...STARTER, ...options });
  for (let i = 0; i < 2; i++) addFish(s, 'guppy', { carriesIch: false, carries: [] });
  return s;
}

/** 睡前拍快照，一小時一小時跑到有魚死掉（每小時做 each），寫早上報告。 */
function untilDeath(s: TankState, maxHours: number, each?: (s: TankState) => void): MorningReport {
  const before = snapshot([s]);
  let hours = 0;
  while (!s.events.some((e) => e.type === 'fish_died') && hours < maxHours) {
    simulate(s, 1, each);
    hours++;
  }
  return morningReport(before, [s], hours, null);
}

const deaths = (r: MorningReport) => r.items.filter((i) => i.kind === 'death').map((i) => i.text);

describe('早上報告的死亡三件事（polish-to-9 U4）', () => {
  it('斷氧：寫缺氧、當時溶氧幾 mg/L、下次開打氣', () => {
    const s = stocked();
    // 過濾器、打氣都停了，水面不動：溶氧一直掉
    const lines = deaths(untilDeath(s, 24 * 3, (st) => (st.water.o2 = Math.min(st.water.o2, 0.5))));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain('死因：缺氧');
      expect(line).toMatch(/溶氧 \d+\.\d mg\/L/);
      expect(line).toMatch(/下次：.*打氣/);
    }
  });

  it('斷食：寫餓死、飢餓幾天、下次一天餵一到兩餐', () => {
    const s = stocked();
    // 完全不餵、缸裡也沒草沒藻可啃
    const lines = deaths(untilDeath(s, 24 * 60));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain('死因：餓死');
      const days = Number(/飢餓 (\d+) 天/.exec(line)?.[1]);
      expect(days).toBeGreaterThanOrEqual(7);
      expect(line).toMatch(/下次：.*一天要吃一到兩餐/);
    }
  });

  it('溫差：寫水溫不適、當時水溫和超出多少度、下次控溫', () => {
    // 夏天沒加熱棒控溫，房間 36°C
    const s = stocked({ heater: null, roomTempC: 36 });
    const lines = deaths(untilDeath(s, 24 * 14, (st) => st.fish.forEach((f) => (f.hunger = 0))));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain('死因：水溫不適');
      expect(line).toMatch(/水溫 3\d\.\d°C，比牠能撐的上限高 \d+\.\d°C/);
      expect(line).toMatch(/下次：.*控溫/);
    }
  });

  it('半夜因為死魚停下來：危機那條也寫三件事；第一次死魚老闆的話有安慰、數值和怎麼避免', () => {
    const s = stocked();
    const before = snapshot([s]);
    untilDeath(s, 24 * 3, (st) => (st.water.o2 = Math.min(st.water.o2, 0.5)));
    const died = s.events.find((e) => e.type === 'fish_died')!;
    const report = morningReport(before, [s], 12, { tank: 0, reason: 'fish_died', event: died });
    expect(report.items[0]).toMatchObject({ kind: 'crisis', action: 'remove_dead', subjectId: died.subjectId });
    expect(report.items[0].text).toMatch(/死因：缺氧（溶氧 \d+\.\d mg\/L.*）。下次：/);
    // 同一條不重複列
    expect(report.items.filter((i) => i.subjectId === died.subjectId)).toHaveLength(1);

    const owner = firstDeathOwnerLine(died, s.fish.find((f) => f.id === died.subjectId));
    expect(owner).toContain('別太難過');
    expect(owner).toMatch(/溶氧 \d+\.\d mg\/L/);
    expect(owner).toContain('打氣');
  });
});
