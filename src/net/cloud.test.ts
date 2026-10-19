import { describe, expect, it } from 'vitest';
import { CLOUD_KEY, CloudClient } from './cloud';
import type { KeyValueStore } from '../game/save';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** 假伺服器：照 server/ 的 API 行為回應。 */
function fakeServer() {
  const users = new Map<string, string>();
  const tokens = new Map<string, string>();
  let save: { revision: number; savedAt: number; save: unknown } | null = null;
  const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fetcher = async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const user = tokens.get(((init?.headers ?? {}) as Record<string, string>).Authorization?.slice(7) ?? '');
    if (path === '/api/auth/register') {
      if (users.has(body.username)) return reply(409, { code: 'taken', message: '這個名字已經有人用了' });
      users.set(body.username, body.password);
      tokens.set(`t-${body.username}`, body.username);
      return reply(201, { token: `t-${body.username}`, username: body.username });
    }
    if (path === '/api/auth/login') {
      if (users.get(body.username) !== body.password) return reply(401, { code: 'bad_login', message: '帳號或密碼不對' });
      return reply(200, { token: `t-${body.username}`, username: body.username });
    }
    if (!user) return reply(401, { code: 'expired', message: '登入過期了，請重新登入' });
    if (path === '/api/auth/logout') return reply(204);
    if (path === '/api/save' && init?.method === 'GET') return save ? reply(200, save) : reply(404, { code: 'none', message: '雲端還沒有存檔' });
    if (path === '/api/save' && init?.method === 'PUT') {
      const current = save?.revision ?? 0;
      if (!body.force && body.baseRevision !== current) return reply(409, { code: 'conflict', message: '另一台裝置剛上傳過存檔', revision: current, savedAt: save!.savedAt });
      save = { revision: current + 1, savedAt: body.save.savedAt, save: body.save };
      return reply(200, { revision: save.revision, savedAt: save.savedAt });
    }
    return reply(404, {});
  };
  return { fetcher, expireAll: () => tokens.clear() };
}

const file = (savedAt: number) => JSON.stringify({ version: 3, savedAt, timeScale: 7, state: { hours: 1 } });

describe('雲端存檔', () => {
  it('沒設定伺服器網址就不開放', async () => {
    const c = new CloudClient(undefined, memoryStore());
    expect(c.available).toBe(false);
    expect((await c.login('a', 'b')).ok).toBe(false);
  });

  it('註冊後記住登入，重開遊戲還在', async () => {
    const store = memoryStore();
    const { fetcher } = fakeServer();
    const c = new CloudClient('https://api.test/', store, fetcher);
    expect((await c.register('aquarist', 'guppy-1234')).ok).toBe(true);
    expect(store.getItem(CLOUD_KEY)).toContain('aquarist');
    const again = new CloudClient('https://api.test', store, fetcher);
    expect(again.loggedIn).toBe(true);
    await again.logout();
    expect(again.loggedIn).toBe(false);
  });

  it('上傳、下載；另一台裝置先傳過會衝突，可以強制覆蓋', async () => {
    const { fetcher } = fakeServer();
    const phone = new CloudClient('https://api.test', memoryStore(), fetcher);
    const pc = new CloudClient('https://api.test', memoryStore(), fetcher);
    await phone.register('aquarist', 'guppy-1234');
    await pc.login('aquarist', 'guppy-1234');
    expect((await phone.download()).ok && (await phone.download() as { value: unknown }).value).toBeNull();
    expect(await phone.upload(file(100))).toEqual({ ok: true, value: { revision: 1, savedAt: 100 } });
    const conflict = await pc.upload(file(50));
    expect(conflict).toMatchObject({ ok: false, code: 'conflict', revision: 1, savedAt: 100 });
    expect((await pc.upload(file(50), true)).ok).toBe(true);
    expect(pc.session!.revision).toBe(2);
    const got = await phone.download();
    expect(got.ok && got.value?.savedAt).toBe(50);
  });

  it('市場改了雲端存檔後只前進一版；中間夾了別台的上傳就不跳過，下次上傳會衝突', async () => {
    const { fetcher } = fakeServer();
    const phone = new CloudClient('https://api.test', memoryStore(), fetcher);
    await phone.register('aquarist', 'guppy-1234');
    await phone.upload(file(100));
    phone.advanceRevision(2);
    expect(phone.session!.revision).toBe(2);
    phone.advanceRevision(2);
    expect(phone.session!.revision).toBe(2);
    phone.advanceRevision(4);
    expect(phone.session!.revision).toBe(2);
  });

  it('登入過期會自動登出，錯誤訊息用伺服器的中文', async () => {
    const server = fakeServer();
    const c = new CloudClient('https://api.test', memoryStore(), server.fetcher);
    await c.register('aquarist', 'guppy-1234');
    server.expireAll();
    const res = await c.download();
    expect(res).toMatchObject({ ok: false, message: '登入過期了，請重新登入' });
    expect(c.loggedIn).toBe(false);
  });

  it('連不上伺服器時回傳離線', async () => {
    const c = new CloudClient('https://api.test', memoryStore(), async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await c.login('a', 'b')).toMatchObject({ ok: false, code: 'offline' });
  });
});
