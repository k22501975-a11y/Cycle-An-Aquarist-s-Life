import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, FILTERS, HEATERS, LIGHTS, TANKS, type TankState } from '../sim';
import { morningLine } from './morning-card';
import { morningReport, snapshot, type MorningReport, type ReportItem } from './morning-report';

/** 養好水、種兩株草、一公一母孔雀魚的缸。 */
function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  addPlant(s, 'rotala');
  addPlant(s, 'moss');
  for (const sex of ['male', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }).ageDays = 120;
  return s;
}

const report = (items: Array<Pick<ReportItem, 'kind' | 'tone'>>): MorningReport => ({ title: '', hours: 12, stopped: false, items: items.map((i) => ({ ...i, tank: 0, text: '' })) });

describe('早上報告的開頭照昨晚的好壞說（#258，tutorial-lines.md §7）', () => {
  it('只有壞事、只有好事、好壞都有、都沒有', () => {
    expect(morningLine(report([{ kind: 'death', tone: 'bad' }]))).toBe('昨晚有點狀況。');
    expect(morningLine(report([{ kind: 'eaten', tone: 'warn' }]))).toBe('昨晚有點狀況。');
    expect(morningLine(report([{ kind: 'birth', tone: 'good' }]))).toBe('昨晚生小魚了！');
    expect(morningLine(report([{ kind: 'orders', tone: 'good' }]))).toBe('有好消息！');
    expect(morningLine(report([{ kind: 'disease', tone: 'warn' }, { kind: 'birth', tone: 'good' }]))).toBe('昨晚有點狀況，也有好消息。');
    expect(morningLine(report([{ kind: 'hungry', tone: 'warn' }]))).toBe('有件事要留意一下。');
    expect(morningLine(report([{ kind: 'cycle', tone: 'info' }]))).toBe('安靜的一晚。');
    expect(morningLine(report([]))).toBe('安靜的一晚。');
  });

  it('好消息的開頭照最要緊的那件換，不會天天同一句（體驗第 14 輪）', () => {
    const kinds = ['birth', 'belly', 'grown', 'fry_grew', 'lookalike', 'cycled'] as const;
    const lines = kinds.map((kind) => morningLine(report([{ kind, tone: 'good' }])));
    expect(new Set(lines).size).toBe(kinds.length);
  });
});

describe('平淡的早上帶一句小觀察', () => {
  it('沒好事也沒壞事才出，同一句型 3 天內不重複', () => {
    const s = tank();
    const seen: string[] = [];
    for (let night = 0; night < 3; night++) {
      const before = snapshot([s]);
      s.hours += 24;
      for (const f of s.fish) f.lengthCm += 0.01;
      for (const p of s.plants) p.biomassG += 0.001;
      const obs = morningReport(before, [s], 12, null).items.find((i) => i.kind === 'observe');
      expect(obs?.tone).toBe('info');
      seen.push(obs!.text);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('水草長了一點算日常：開頭是「安靜的一晚」，不是「有好消息」（體驗第 14 輪）', () => {
    const s = tank();
    const before = snapshot([s]);
    s.plants[0].biomassG *= 1.05;
    const r = morningReport(before, [s], 12, null);
    expect(r.items.map((i) => i.kind)).toContain('plant_grew');
    expect(morningLine(r)).toBe('安靜的一晚。');
  });

  it('要留意的事的早上不出小觀察', () => {
    const t = tank();
    const was = snapshot([t]);
    t.algae += 0.2;
    expect(morningReport(was, [t], 12, null).items.map((i) => i.kind)).not.toContain('observe');
  });
});
