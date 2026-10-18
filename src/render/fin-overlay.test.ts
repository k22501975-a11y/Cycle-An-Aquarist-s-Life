import { describe, expect, it } from 'vitest';
import { finShapes } from './fin-overlay';

const body = { x: 0, y: 0, rx: 30, ry: 10 };
const ys = (pts: number[]) => pts.filter((_, i) => i % 2 === 1);

describe('鰭型補畫（J18）', () => {
  it('沒有特殊鰭型就不畫', () => {
    expect(finShapes({}, body, 100)).toEqual([]);
  });

  it('大C：背鰭往上、臀鰭往下各一片畫在身體後面，鰭長分數越高拉得越遠', () => {
    const s = finShapes({ bigC: true, ribbon: true, length: 0.7 }, body, 100);
    expect(s).toHaveLength(2);
    expect(Math.min(...ys(s[0].points))).toBeLessThan(-body.ry * 1.8);
    expect(Math.max(...ys(s[1].points))).toBeGreaterThan(body.ry * 1.8);
    expect(s.every((f) => !f.front && f.kind === 'fill')).toBe(true);
    const longer = finShapes({ bigC: true, length: 1 }, body, 100);
    expect(Math.min(...ys(longer[0].points))).toBeLessThan(Math.min(...ys(s[0].points)) - body.ry * 0.8);
  });

  it('雙劍兩支、上劍一支朝上', () => {
    expect(finShapes({ sword: 3 }, body, 100)).toHaveLength(2);
    const tipX = (len: number) => Math.max(...finShapes({ sword: 1, length: len }, body, 100)[0].points.filter((_, i) => i % 2 === 0));
    expect(tipX(0.9)).toBeGreaterThan(tipX(0.3));
    const top = finShapes({ sword: 1 }, body, 100);
    expect(top).toHaveLength(1);
    expect(Math.min(...ys(top[0].points))).toBeLessThan(0);
  });

  it('燕尾拖出細絲、緞帶垂兩條、大耳的胸鰭畫在前面', () => {
    expect(finShapes({ swallow: true }, body, 100).filter((f) => f.kind === 'line').length).toBeGreaterThanOrEqual(6);
    expect(finShapes({ ribbon: true }, body, 100)).toHaveLength(2);
    const d = finShapes({ dumbo: true }, body, 100);
    expect(d[0].front).toBe(true);
  });
});
