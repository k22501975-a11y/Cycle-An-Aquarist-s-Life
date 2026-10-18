import type { KeyValueStore } from '../game/save';

/**
 * 雲端存檔（L1）：登入帳號後，把整份存檔放到伺服器上，換手機也能接著玩。
 * 伺服器只保管存檔，不解析內容；revision 用來發現另一台裝置已經上傳過。
 */

export const CLOUD_KEY = 'cycle.cloud.v1';

export interface CloudSession {
  token: string;
  username: string;
  /** 這台裝置最後一次和雲端同步時的版本號。 */
  revision: number;
  /** 最後一次同步的現實時間（毫秒）。 */
  syncedAt?: number;
}

export interface CloudSave {
  revision: number;
  savedAt: number;
  save: unknown;
}

export interface FriendInfo {
  username: string;
  affinity: number;
  /** 交情等級：1 魚友、2 熟識、3 好友、4 摯友。 */
  level: number;
  visitedToday: boolean;
  likedToday: boolean;
}

export interface FriendsOverview {
  code: string;
  likes: number;
  friends: FriendInfo[];
  incoming: string[];
  outgoing: string[];
  sendLeft: number;
  receiveLeft: number;
}

export interface FriendTank {
  username: string;
  likes: number;
  savedAt?: number;
  save?: unknown;
}

export type GiftPayload = { kind: 'cuttings'; payload: { species: string; count: number } } | { kind: 'media'; payload: { bacteria: number; filter: string; ich: boolean } };

export type Gift = GiftPayload & { id: number; from: string; createdAt: number };

export type CloudResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string; revision?: number; savedAt?: number };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class CloudClient {
  session: CloudSession | null;

  constructor(
    readonly baseUrl: string | undefined,
    private store: KeyValueStore,
    private fetcher: Fetch = (input, init) => fetch(input, init),
  ) {
    this.session = readSession(store);
  }

  /** 有設定伺服器網址才開放雲端存檔。 */
  get available(): boolean {
    return !!this.baseUrl;
  }

  get loggedIn(): boolean {
    return this.session !== null;
  }

  register(username: string, password: string): Promise<CloudResult<CloudSession>> {
    return this.auth('register', username, password);
  }

  login(username: string, password: string): Promise<CloudResult<CloudSession>> {
    return this.auth('login', username, password);
  }

  async logout(): Promise<void> {
    if (this.session) await this.call('POST', '/api/auth/logout').catch(() => undefined);
    this.setSession(null);
  }

  /** 讀雲端的存檔；雲端沒有就回傳 value: null。 */
  async download(): Promise<CloudResult<CloudSave | null>> {
    const res = await this.call<CloudSave>('GET', '/api/save');
    if (!res.ok && res.code === 'none') return { ok: true, value: null };
    return res;
  }

  /**
   * 上傳存檔（saveJson 是 serializeSave 產生的文字）。
   * 另一台裝置在這之間上傳過會回傳 code: 'conflict'，除非 force。
   */
  async upload(saveJson: string, force = false): Promise<CloudResult<{ revision: number; savedAt: number }>> {
    if (!this.session) return { ok: false, code: 'no_login', message: '請先登入' };
    const body = `{"baseRevision":${this.session.revision},"force":${force},"save":${saveJson}}`;
    const res = await this.call<{ revision: number; savedAt: number }>('PUT', '/api/save', body);
    if (res.ok) this.markSynced(res.value.revision);
    return res;
  }

  // ---- 好友（friends.md） ----

  friends(): Promise<CloudResult<FriendsOverview>> {
    return this.call('GET', '/api/friends');
  }

  requestFriend(code: string): Promise<CloudResult<{ username: string; status: 'requested' | 'friends' }>> {
    return this.call('POST', '/api/friends/request', JSON.stringify({ code }));
  }

  acceptFriend(username: string): Promise<CloudResult<void>> {
    return this.call('POST', `/api/friends/${encodeURIComponent(username)}/accept`);
  }

  declineFriend(username: string): Promise<CloudResult<void>> {
    return this.call('POST', `/api/friends/${encodeURIComponent(username)}/decline`);
  }

  unfriend(username: string): Promise<CloudResult<void>> {
    return this.call('DELETE', `/api/friends/${encodeURIComponent(username)}`);
  }

  visit(username: string): Promise<CloudResult<FriendTank>> {
    return this.call('GET', `/api/friends/${encodeURIComponent(username)}/tank`);
  }

  like(username: string): Promise<CloudResult<{ likes: number }>> {
    return this.call('POST', `/api/friends/${encodeURIComponent(username)}/like`);
  }

  sendGift(to: string, gift: GiftPayload): Promise<CloudResult<{ sendLeft: number }>> {
    return this.call('POST', '/api/gifts', JSON.stringify({ to, ...gift }));
  }

  gifts(): Promise<CloudResult<Gift[]>> {
    return this.call('GET', '/api/gifts');
  }

  claimGift(id: number): Promise<CloudResult<Gift>> {
    return this.call('POST', `/api/gifts/${id}/claim`);
  }

  /** 採用了雲端那份（或確認兩邊一樣）之後，記下雲端的版本號。 */
  markSynced(revision: number, now = Date.now()): void {
    if (!this.session) return;
    this.setSession({ ...this.session, revision, syncedAt: now });
  }

  private async auth(kind: 'register' | 'login', username: string, password: string): Promise<CloudResult<CloudSession>> {
    const res = await this.call<{ token: string; username: string }>('POST', `/api/auth/${kind}`, JSON.stringify({ username, password }), false);
    if (!res.ok) return res;
    const session: CloudSession = { token: res.value.token, username: res.value.username, revision: 0 };
    this.setSession(session);
    return { ok: true, value: session };
  }

  private async call<T>(method: string, path: string, body?: string, withToken = true): Promise<CloudResult<T>> {
    if (!this.baseUrl) return { ok: false, code: 'unavailable', message: '雲端存檔還沒開放' };
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (withToken && this.session) headers.Authorization = `Bearer ${this.session.token}`;
    let res: Response;
    try {
      res = await this.fetcher(this.baseUrl.replace(/\/$/, '') + path, { method, headers, body });
    } catch {
      return { ok: false, code: 'offline', message: '連不上雲端，檢查一下網路' };
    }
    if (res.status === 204) return { ok: true, value: undefined as T };
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      // 伺服器沒回 JSON（例如閘道錯誤）
    }
    if (res.ok) return { ok: true, value: data as T };
    const code = typeof data.code === 'string' ? data.code : `http_${res.status}`;
    // 登入過期：清掉，請玩家重新登入
    if (res.status === 401 && withToken) this.setSession(null);
    return {
      ok: false,
      code,
      message: typeof data.message === 'string' ? data.message : '雲端出了點問題，等一下再試',
      revision: typeof data.revision === 'number' ? data.revision : undefined,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : undefined,
    };
  }

  private setSession(session: CloudSession | null): void {
    this.session = session;
    try {
      if (session) this.store.setItem(CLOUD_KEY, JSON.stringify(session));
      else this.store.removeItem(CLOUD_KEY);
    } catch {
      // 存不了就只在這次開啟期間有效
    }
  }
}

function readSession(store: KeyValueStore): CloudSession | null {
  try {
    const raw = JSON.parse(store.getItem(CLOUD_KEY) ?? 'null');
    if (raw && typeof raw.token === 'string' && typeof raw.username === 'string' && typeof raw.revision === 'number') return raw;
  } catch {
    // 壞掉就當沒登入
  }
  return null;
}
