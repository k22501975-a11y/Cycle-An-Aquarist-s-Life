import { describe, expect, it } from 'vitest';
import { firstTime, loadMoments, MOMENTS_KEY } from './moments';

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('第一次的慶祝只演一次', () => {
  it('同一件事第二次不再慶祝，不同的事各自算', () => {
    const store = memoryStore();
    expect(firstTime(store, 'first_sale')).toBe(true);
    expect(firstTime(store, 'first_sale')).toBe(false);
    expect(firstTime(store, 'cycled')).toBe(true);
    expect([...loadMoments(store)].sort()).toEqual(['cycled', 'first_sale']);
  });

  it('壞掉的紀錄當作沒有', () => {
    const store = memoryStore();
    store.setItem(MOMENTS_KEY, '{oops');
    expect(loadMoments(store).size).toBe(0);
    expect(firstTime(store, 'first_fry')).toBe(true);
  });
});
