import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, Notifier, planNotices, readPrefs, type PlannedNotice, type PushPlatform } from './push';
import type { ForecastAlert } from '../sim';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

const alert = (hours: number, category: ForecastAlert['category'], key = 'ammonia'): ForecastAlert => ({ hours, category, tank: 0, key, body: key });

function fakePlatform(granted = true) {
  const log: PlannedNotice[][] = [];
  const platform: PushPlatform & { log: PlannedNotice[][]; synced: number } = {
    kind: 'web',
    log,
    synced: 0,
    requestPermission: async () => granted,
    replace: async (n) => void log.push(n),
    sync: async () => (platform.synced++, null),
    disable: async () => undefined,
  };
  return platform;
}

describe('推播排程', () => {
  it('遊戲小時換成現實時間（7 倍速），濾掉沒開的類別和已經過去的', () => {
    const prefs = { enabled: true, categories: { ...DEFAULT_PREFS.categories, breeding: false } };
    const t0 = 1_000_000;
    const list = planNotices([alert(7, 'crisis'), alert(14, 'breeding', 'fry'), alert(0.001, 'crisis', 'old')], prefs, t0, 7, t0 + 60_000);
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe(t0 + 3_600_000);
    expect(list[0].tag).toBe('0:ammonia');
  });

  it('沒開通知或遊戲暫停中就不排', () => {
    expect(planNotices([alert(7, 'crisis')], DEFAULT_PREFS, 0, 7, -1)).toEqual([]);
    expect(planNotices([alert(7, 'crisis')], { ...DEFAULT_PREFS, enabled: true }, 0, 0, -1)).toEqual([]);
  });

  it('開啟要先拿到權限；開關會記住', async () => {
    const store = memory();
    const denied = new Notifier(store, fakePlatform(false));
    expect(await denied.enable()).toMatch(/權限/);
    expect(denied.enabled).toBe(false);

    const p = fakePlatform();
    const n = new Notifier(store, p);
    expect(await n.enable()).toBeNull();
    expect(n.enabled).toBe(true);
    await n.setCategory('friends', false);
    expect(readPrefs(store)).toEqual({ enabled: true, categories: { crisis: true, breeding: true, market: true, friends: false } });
    expect(p.synced).toBe(2);

    await n.plan([{ at: 5, category: 'crisis', title: 't', body: 'b', tag: 'x' }]);
    await n.clear();
    expect(p.log.map((l) => l.length)).toEqual([1, 0]);
  });

  it('沒有平台（瀏覽器不支援）時什麼都不做', async () => {
    const n = new Notifier(memory(), null);
    expect(n.available).toBe(false);
    expect(await n.enable()).toMatch(/收不到/);
    await n.plan([]);
  });
});
