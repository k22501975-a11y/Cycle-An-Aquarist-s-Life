import { describe, expect, it } from 'vitest';
import type { MorningReport, ReportItem } from './morning-report';
import { splitMarks } from './tank-marks';

const report = (items: ReportItem[], marks?: ReportItem[]): MorningReport & { marks?: ReportItem[] } => ({ title: '早安', hours: 10, stopped: false, items, marks });

describe('splitMarks（daily-loop.md §2）', () => {
  it('水草、小螺、新訂單從報告移到缸上，每缸每種一個', () => {
    const { report: r, marks } = splitMarks(
      report([
        { kind: 'birth', tank: 0, tone: 'good', text: '昨晚生了 5 尾小魚' },
        { kind: 'plant_grew', tank: 0, tone: 'info', text: '水草長了一點（+3%）' },
        { kind: 'new_leaf', tank: 0, tone: 'info', text: '莫絲長出新葉了', plantId: 7 },
        { kind: 'snails', tank: 1, tone: 'info', text: '小螺多了 2 隻' },
        { kind: 'orders', tank: 0, tone: 'info', text: '阿德那邊來了 2 張新訂單' },
      ]),
    );
    expect(r.items.map((i) => i.kind)).toEqual(['birth']);
    expect(marks).toEqual([
      { kind: 'plant', tank: 0, text: '水草長了一點（+3%）', plantId: undefined },
      { kind: 'snail', tank: 1, text: '小螺多了 2 隻', plantId: undefined },
      { kind: 'order', tank: 0, text: '阿德那邊來了 2 張新訂單', plantId: undefined },
    ]);
  });

  it('報告只剩標記時留一行平靜的早上', () => {
    const { report: r, marks } = splitMarks(report([{ kind: 'plant_grew', tank: 0, tone: 'info', text: '水草長了一點（+2%）' }]));
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kind).toBe('quiet');
    expect(marks).toHaveLength(1);
  });

  it('核心給了 marks 就照它的，報告不動；其他種類當小觀察', () => {
    const items: ReportItem[] = [{ kind: 'birth', tank: 0, tone: 'good', text: '生了' }];
    const { report: r, marks } = splitMarks(report(items, [{ kind: 'fish_relaxed', tank: 0, tone: 'info', text: '新來的魚慢慢適應了' }]));
    expect(r.items).toBe(items);
    expect(marks[0].kind).toBe('note');
  });
});
