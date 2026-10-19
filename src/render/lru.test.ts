import { describe, expect, it } from 'vitest';
import { RefLru, trimLru } from './lru';

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

describe('有參照計數的調色快取（架構審查 #93）', () => {
  type Tex = { id: string; destroyed: boolean };
  const make = () => {
    const lru = new RefLru<string, Tex>(64, (t) => (t.destroyed = true));
    const tex = (id: string) => lru.get(id) ?? lru.add(id, { id, destroyed: false });
    return { lru, tex };
  };

  it('同時用到超過 64 個組合：舊的都有魚在用時，剛建好的那張不會被銷毀', () => {
    const { lru, tex } = make();
    for (let i = 0; i < 64; i++) lru.retain(tex(`fish${i}`));
    const fresh = tex('fish64');
    expect(fresh.destroyed).toBe(false);
    expect(lru.get('fish64')).toBe(fresh);
    expect(lru.size).toBe(65);
  });

  it('像 setTone 那樣先 retain rest 再拿 eating：rest 不會被清掉', () => {
    const { lru, tex } = make();
    for (let i = 0; i < 64; i++) lru.retain(tex(`fish${i}`));
    const rest = tex('new');
    lru.retain(rest);
    const eating = tex('new#eating');
    lru.retain(eating);
    expect(rest.destroyed).toBe(false);
    expect(eating.destroyed).toBe(false);
  });

  it('沒人用了才會在下次建新貼圖時被釋放', () => {
    const { lru, tex } = make();
    const all = Array.from({ length: 64 }, (_, i) => tex(`fish${i}`));
    for (const t of all) lru.retain(t);
    lru.release(all[0]);
    expect(all[0].destroyed).toBe(false);
    tex('fish64');
    expect(all[0].destroyed).toBe(true);
    expect(all[1].destroyed).toBe(false);
    expect(lru.size).toBe(64);
  });

  it('命中時標成剛用過，最久沒用的先丟', () => {
    const { tex } = make();
    const all = Array.from({ length: 64 }, (_, i) => tex(`fish${i}`));
    tex('fish0');
    tex('fish64');
    expect(all[0].destroyed).toBe(false);
    expect(all[1].destroyed).toBe(true);
  });
});
