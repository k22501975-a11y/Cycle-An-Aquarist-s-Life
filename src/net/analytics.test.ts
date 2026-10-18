import { describe, expect, it } from 'vitest';
import { ANALYTICS_KEY, Analytics } from './analytics';
import type { KeyValueStore } from '../game/save';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function recorder(status = 200) {
  const calls: { url: string; body: { clientId: string; events: { name: string; props?: unknown }[] }; keepalive?: boolean }[] = [];
  let code = status;
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(init!.body as string), keepalive: init!.keepalive });
    return new Response('{}', { status: code });
  };
  return { calls, fetcher, setStatus: (s: number) => (code = s) };
}

let n = 0;
const ids = () => `0000000${++n}-0000-4000-8000-000000000000`.slice(-36);

describe('匿名數據分析', () => {
  it('還沒同意前什麼都不記、不送', async () => {
    const r = recorder();
    const a = new Analytics('http://api', memoryStore(), r.fetcher, ids);
    expect(a.consent).toBeNull();
    a.track('session_start');
    await a.flush();
    expect(a.pending).toBe(0);
    expect(r.calls).toHaveLength(0);
  });

  it('同意後排隊，flush 一次送出，代號記住', async () => {
    const r = recorder();
    const store = memoryStore();
    const a = new Analytics('http://api/', store, r.fetcher, ids);
    a.setConsent(true);
    a.track('session_start', { tanks: 1 });
    a.track('fish_died', { cause: 'ammonia' });
    await a.flush(true);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].url).toBe('http://api/api/events');
    expect(r.calls[0].keepalive).toBe(true);
    expect(r.calls[0].body.events.map((e) => e.name)).toEqual(['session_start', 'fish_died']);
    expect(a.pending).toBe(0);
    const again = new Analytics('http://api', store, r.fetcher, ids);
    expect(again.consent).toBe(true);
    expect(JSON.parse(store.data.get(ANALYTICS_KEY)!).clientId).toBe(r.calls[0].body.clientId);
  });

  it('伺服器掛了留著下次送；4xx 丟掉；佇列有上限', async () => {
    const r = recorder(503);
    const a = new Analytics('http://api', memoryStore(), r.fetcher, ids);
    a.setConsent(true);
    a.track('x_event');
    await a.flush();
    expect(a.pending).toBe(1);
    r.setStatus(400);
    await a.flush();
    expect(a.pending).toBe(0);
    for (let i = 0; i < 250; i++) a.track('tick');
    expect(a.pending).toBe(200);
  });

  it('關掉會清空佇列並換新代號；沒伺服器網址就不開放', async () => {
    const r = recorder();
    const a = new Analytics('http://api', memoryStore(), r.fetcher, ids);
    a.setConsent(true);
    a.track('session_start');
    await a.flush();
    const first = r.calls[0].body.clientId;
    a.setConsent(false);
    a.track('session_start');
    expect(a.pending).toBe(0);
    a.setConsent(true);
    a.track('session_start');
    await a.flush();
    expect(r.calls[1].body.clientId).not.toBe(first);
    expect(new Analytics(undefined, memoryStore(), r.fetcher, ids).available).toBe(false);
  });
});
