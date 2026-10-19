import { describe, expect, it } from 'vitest';
import { trimLru } from './lru';

describe('調色快取的上限（Issue #100）', () => {
  it('超過上限時丟掉最久沒用、沒人在用的，並且釋放', () => {
    const cache = new Map<string, number>();
    for (let i = 0; i < 100; i++) cache.set(`t${i}`, i);
    const held = new Set([0, 1]);
    const freed: number[] = [];
    trimLru(cache, 64, (v) => held.has(v), (v) => freed.push(v));
    expect(cache.size).toBe(64);
    expect(cache.has('t0') && cache.has('t1')).toBe(true);
    expect(freed).toHaveLength(36);
    expect(freed[0]).toBe(2);
  });

  it('全部都有人在用就先不丟', () => {
    const cache = new Map([['a', 1], ['b', 2], ['c', 3]]);
    trimLru(cache, 1, () => true, () => {});
    expect(cache.size).toBe(3);
  });
});
