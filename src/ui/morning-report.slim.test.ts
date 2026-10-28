import { describe, expect, it } from 'vitest';
import type { ChoiceCard } from '../sim/choices';
import { choiceFollowUp, lineGroup, REPORT_LINES, slimReport, type MorningReport, type ReportItem } from './morning-report';

const item = (kind: ReportItem['kind'], tone: ReportItem['tone'], text: string, more: Partial<ReportItem> = {}): ReportItem => ({ kind, tone, text, tank: 0, ...more });
const report = (items: ReportItem[]): MorningReport => ({ title: '早安，第 20 天', hours: 12, stopped: false, items });
const card = (id: ChoiceCard['id']): ChoiceCard => ({ id, tank: 0, title: '要決定的事', owner: '', options: [{ key: 'a', label: 'A', outcome: '' }] });

describe('早上報告瘦身（daily-loop.md §2）', () => {
  it('最多 3 行：要處理的壞消息 → 目標的進度 → 好消息；水草、小螺、新訂單改放缸上標記，擠不下的收進鈴鐺', () => {
    const r = report([
      item('birth', 'good', '昨晚生了 12 尾小魚，水草越密越好躲', { count: 12 }),
      item('plant_grew', 'info', '水草長了一點（+2%）', { count: 2 }),
      item('belly', 'good', '母魚的肚子圓起來了，看得出懷孕'),
      item('snails', 'info', '小螺多了 3 隻', { count: 3 }),
      item('orders', 'info', '阿德那邊來了 2 張新訂單', { count: 2 }),
      item('fish_relaxed', 'good', '新來的魚慢慢適應新家，放鬆了'),
      item('hungry', 'warn', '2 尾魚餓到開始消瘦，今天不餵會餓死'),
      item('courtship', 'good', '公魚整晚追著母魚跑，配對成功了，等下一窩'),
    ]);
    const slim = slimReport(r);
    expect(slim.lines).toHaveLength(REPORT_LINES);
    expect(slim.lines.map((i) => i.kind)).toEqual(['hungry', 'belly', 'courtship']);
    expect(slim.lines.map(lineGroup)).toEqual(['bad', 'goal', 'goal']);
    expect(lineGroup(r.items[0])).toBe('good');
    expect(slim.decision).toBeNull();
    expect(slim.marks).toEqual([
      { kind: 'plant', tank: 0, text: '長了一點（+2%）', note: '水草長了一點（+2%）' },
      { kind: 'snail', tank: 0, text: '多了 3 隻', note: '小螺多了 3 隻' },
      { kind: 'orders', tank: 0, text: '阿德那邊有 2 張新訂單', note: '阿德那邊來了 2 張新訂單' },
    ]);
    expect(slim.rest.map((i) => i.kind)).toEqual(['birth', 'fish_relaxed']);
  });

  it('選擇卡不寫在報告的文字裡，另外一行；品系取名那天排第一行（比照開獎）', () => {
    const lines = [item('hungry', 'warn', '魚在水面游來游去討食，該餵了'), item('birth', 'good', '昨晚生了 3 尾小魚')];
    const c9 = slimReport(report([...lines, item('choice', 'good', '要決定的事', { choice: card('C9') })]));
    expect(c9.lines.map((i) => i.kind)).toEqual(['hungry', 'birth']);
    expect(c9.decision?.choice?.id).toBe('C9');
    expect(c9.decisionFirst).toBe(false);
    const c18 = slimReport(report([...lines, item('choice', 'good', '要決定的事', { choice: card('C18') })]));
    expect(c18.decisionFirst).toBe(true);
  });

  it('開獎、半夜的危機排在壞消息前面', () => {
    const slim = slimReport(report([item('disease', 'warn', '3 條魚有白點'), item('reveal', 'good', '開獎！'), item('crisis', 'bad', '有魚死了')]));
    expect(slim.lines.map((i) => i.kind)).toEqual(['crisis', 'reveal', 'disease']);
  });

  it('安靜的早上只寫一行，有小觀察就放小觀察；第一隻小螺照樣上報告', () => {
    const quiet = slimReport(report([item('plant_grew', 'info', '水草長了一點（+1%）', { count: 1 }), item('observe', 'info', '夜裡螺把缸壁的藻吃掉了一小片')]));
    expect(quiet.lines.map((i) => i.text)).toEqual(['夜裡螺把缸壁的藻吃掉了一小片']);
    expect(quiet.marks).toHaveLength(1);
    const first = slimReport(report([item('snails', 'info', '缸壁上出現第一隻小螺，應該是跟著水草混進來的', { count: 1 })]));
    expect(first.lines.map((i) => i.kind)).toEqual(['snails']);
    expect(first.marks).toEqual([]);
  });

  it('選擇的回音排在目標進度後面，擠不下就收進鈴鐺（polish-to-9.md §10.5）', () => {
    const echo = item('echo', 'info', '賣了 11 尾，+220 元，主缸現在 62%', { echo: '賣一批' });
    const r = slimReport(report([echo, item('belly', 'good', '母魚的肚子圓起來了'), item('breeding', 'good', '留種的那對還要 10 天')]));
    expect(r.lines.map((l) => l.kind)).toEqual(['belly', 'breeding', 'echo']);
    const full = slimReport(report([echo, item('hungry', 'warn', '魚餓了'), item('belly', 'good', '母魚的肚子圓起來了'), item('breeding', 'good', '留種的那對還要 10 天')]));
    expect(full.lines).not.toContain(echo);
    expect(full.rest).toContain(echo);
  });

  it('住不下（C14）選了再買一缸、換大缸：直接打開購買確認（polish-to-9.md §10.2）', () => {
    const c14 = card('C14');
    expect(choiceFollowUp(c14, 'tank')).toBe('buy_tank');
    expect(choiceFollowUp(c14, 'big')).toBe('buy_big');
    expect(choiceFollowUp(c14, 'water')).toBeUndefined();
  });
});

describe('開獎倒數（polish-to-9.md §12.1）', () => {
  it('倒數那行排在開頭（危機後面），不佔 3 行的名額', () => {
    const r = report([
      item('hungry', 'warn', '2 尾魚餓到開始消瘦'),
      item('belly', 'good', '母魚的肚子圓起來了'),
      item('courtship', 'good', '配對成功了'),
      item('algae', 'warn', '玻璃上的藻變多了'),
      item('countdown', 'good', '肚子方方的，看得到小魚的眼睛了', { countdown: { days: 3, momId: 7 } }),
      item('death', 'bad', '一尾魚死了', { subjectId: 2 }),
    ]);
    const lines = slimReport(r).lines;
    expect(lines.map((i) => i.kind).slice(0, 2)).toEqual(['death', 'countdown']);
    expect(lines.filter((i) => i.kind !== 'death' && i.kind !== 'countdown')).toHaveLength(REPORT_LINES);
  });
});
