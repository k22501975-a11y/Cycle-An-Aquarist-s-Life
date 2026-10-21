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

/** 伺服器補算（L2）：伺服器用自己的時鐘把雲端存檔補算到現在。 */
export interface ServerAdvance extends CloudSave {
  hours: number;
  capped: boolean;
  deaths: number;
  births: number;
}

/** 上傳的存檔跟伺服器帳本對不上（少了或多了市場收支，docs/ledger.md §3.4）：只能改用雲端那份。 */
export const LEDGER_CODES = ['ledger_behind', 'ledger_ahead'];

/** 上傳時伺服器的模擬檢查沒過（L2）：遊戲時間跑太快、魚的身分被改、錢多出單機賺不到的數目。 */
export const SAVE_CHECK_CODES = ['time_ahead', 'identity_changed', 'gift_removed', 'shipped_fish', 'coins_jump', ...LEDGER_CODES];

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

export interface MarketSeller {
  username: string;
  /** 成功送到的筆數。 */
  deals: number;
  doaRate: number;
  /** 到貨死亡率偏高。 */
  warning: boolean;
  /** 到貨 30 天存活率（買家自己養死、賣掉的不算）；還沒有結果是 null，舊伺服器沒有這欄。 */
  survival?: number | null;
  /** 常有魚到貨後發病死掉（死於出貨時就帶著的病）。 */
  sick?: boolean;
}

export interface MarketListing {
  id: number;
  kind: 'fish' | 'plant';
  species: string;
  title: string;
  item: Record<string, unknown>;
  health: number;
  price: number;
  seller: MarketSeller;
  createdAt: number;
}

export interface MarketOrder {
  id: number;
  role: 'buyer' | 'seller';
  kind: 'fish' | 'plant';
  species: string;
  title: string;
  price: number;
  packaging: string;
  /** paid 等出貨、shipped 運送中（或已到）、cancelled 取消。 */
  status: 'paid' | 'shipped' | 'cancelled';
  arrived: boolean;
  counterpart: string | null;
  createdAt: number;
  arriveAt: number | null;
  /** 賣家才看得到：要出哪一件。 */
  item: Record<string, unknown> | null;
  listingId: number;
}

export interface MarketMine {
  listings: MarketListing[];
  sales: MarketOrder[];
  purchases: MarketOrder[];
  slots: number;
  /** 從什麼時候開始可以上架（新帳號要等幾天）。 */
  canListAt: number;
}

/** 伺服器記帳後的錢包（docs/ledger.md §3.3）：遊戲端照 delta 加減，revision 是改過錢之後的雲端存檔版本。 */
export interface LedgerWallet {
  revision: number;
  coins: number;
  ledgerSeq: number;
  delta: number;
}

export type MarketCollect =
  | { result: 'item'; item: Record<string, unknown>; stress: number; bagTemp: number; bagPh: number; kind: 'fish' | 'plant'; title: string; listingId: number }
  | { result: 'refund'; reason?: 'not_shipped' | 'doa'; amount: number; wallet: LedgerWallet; kind: 'fish' | 'plant'; title: string; listingId: number }
  | { result: 'payout'; amount: number; wallet: LedgerWallet; kind: 'fish' | 'plant'; title: string; listingId: number }
  | { result: 'doa' | 'cancelled'; kind: 'fish' | 'plant'; title: string; listingId: number };

export interface PricePoint {
  day: string;
  median: number;
  count: number;
}

export interface PointsCatalog {
  balance: number;
  /** 測試模式：儲值不收錢（金流還沒接）。 */
  sandbox: boolean;
  monthlyLimit: number;
  toppedUpThisMonth: number;
  packs: { id: string; twd: number; points: number }[];
  items: { id: string; name: string; note: string; points: number; daily: number; boughtToday: number }[];
  /** 伺服器上的道具庫存（每種還有幾個）。 */
  bag: Record<string, number>;
}

export interface PointsEntry {
  delta: number;
  balance: number;
  reason: 'topup' | 'buy';
  note: string;
  at: number;
}

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
  async upload(saveJson: string, force = false): Promise<CloudResult<{ revision: number; savedAt: number; notice?: string }>> {
    if (!this.session) return { ok: false, code: 'no_login', message: '請先登入' };
    const body = `{"baseRevision":${this.session.revision},"force":${force},"save":${saveJson}}`;
    const res = await this.call<{ revision: number; savedAt: number; notice?: string }>('PUT', '/api/save', body);
    if (res.ok) this.markSynced(res.value.revision);
    return res;
  }

  /** 請伺服器把雲端存檔補算到現在（伺服器的時鐘），回傳補算後的存檔。 */
  advance(): Promise<CloudResult<ServerAdvance>> {
    return this.call<ServerAdvance>('POST', '/api/save/advance');
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

  // ---- 玩家市場（market-and-breeding.md §3） ----

  marketListings(species?: string, sort: 'price' | 'new' = 'price'): Promise<CloudResult<MarketListing[]>> {
    const q = new URLSearchParams({ sort });
    if (species) q.set('species', species);
    return this.call('GET', `/api/market/listings?${q}`);
  }

  // 上架、買、收貨會動到錢：伺服器直接改雲端存檔，要帶手上那份的版本（docs/ledger.md）

  marketList(listing: { kind: 'fish' | 'plant'; species: string; title: string; item: unknown; price: number }): Promise<CloudResult<{ id: number; fee: number; wallet: LedgerWallet }>> {
    return this.call('POST', '/api/market/listings', JSON.stringify({ ...listing, baseRevision: this.session?.revision ?? 0 }));
  }

  marketUpdate(id: number, item: unknown): Promise<CloudResult<void>> {
    return this.call('PUT', `/api/market/listings/${id}`, JSON.stringify({ item }));
  }

  marketCancel(id: number): Promise<CloudResult<void>> {
    return this.call('DELETE', `/api/market/listings/${id}`);
  }

  marketBuy(id: number, packaging: string): Promise<CloudResult<{ order: MarketOrder; wallet: LedgerWallet }>> {
    return this.call('POST', `/api/market/listings/${id}/buy`, JSON.stringify({ packaging, baseRevision: this.session?.revision ?? 0 }));
  }

  marketMine(): Promise<CloudResult<MarketMine>> {
    return this.call('GET', '/api/market/mine');
  }

  marketShip(orderId: number, item: unknown, bagTemp: number, bagPh: number): Promise<CloudResult<MarketOrder>> {
    return this.call('POST', `/api/market/orders/${orderId}/ship`, JSON.stringify({ item, bagTemp, bagPh }));
  }

  marketSellerCancel(orderId: number): Promise<CloudResult<void>> {
    return this.call('POST', `/api/market/orders/${orderId}/cancel`);
  }

  marketCollect(orderId: number): Promise<CloudResult<MarketCollect>> {
    return this.call('POST', `/api/market/orders/${orderId}/collect`, JSON.stringify({ baseRevision: this.session?.revision ?? 0 }));
  }

  marketPrices(species: string): Promise<CloudResult<PricePoint[]>> {
    return this.call('GET', `/api/market/prices?species=${encodeURIComponent(species)}`);
  }

  // ---- 儲值點數與商城 ----

  points(): Promise<CloudResult<PointsCatalog>> {
    return this.call('GET', '/api/points');
  }

  pointsTopup(pack: string): Promise<CloudResult<{ balance: number }>> {
    return this.call('POST', '/api/points/topup', JSON.stringify({ pack }));
  }

  pointsBuy(item: string): Promise<CloudResult<{ balance: number; bag: Record<string, number> }>> {
    return this.call('POST', '/api/points/buy', JSON.stringify({ item }));
  }

  /** 用掉一個道具；requestId 每次使用產生一個，斷線重送同一個不會扣兩個。 */
  pointsUse(item: string, requestId: string): Promise<CloudResult<{ item: string; remaining: number }>> {
    return this.call('POST', '/api/points/use', JSON.stringify({ item, requestId }));
  }

  pointsHistory(): Promise<CloudResult<PointsEntry[]>> {
    return this.call('GET', '/api/points/history');
  }

  // ---- 推播（不用登入；有登入時順便讓伺服器知道這台是誰的） ----

  pushKey(): Promise<CloudResult<{ publicKey: string }>> {
    return this.call('GET', '/api/push/key', undefined, false);
  }

  pushRegister(deviceId: string, device: { secret: string; endpoint: string; p256dh: string; auth: string; categories: string[] }): Promise<CloudResult<void>> {
    return this.call('PUT', `/api/push/devices/${deviceId}`, JSON.stringify(device));
  }

  pushSchedule(deviceId: string, secret: string, items: { at: number; category: string; title: string; body: string; tag: string }[]): Promise<CloudResult<{ scheduled: number }>> {
    return this.call('PUT', `/api/push/devices/${deviceId}/schedule`, JSON.stringify({ secret, items }), false, true);
  }

  pushUnregister(deviceId: string, secret: string): Promise<CloudResult<void>> {
    return this.call('DELETE', `/api/push/devices/${deviceId}`, JSON.stringify({ secret }), false);
  }

  /** 伺服器上跟這個帳號有關的所有資料（個資法的查詢、複製權）。 */
  exportData(): Promise<CloudResult<Record<string, unknown>>> {
    return this.call('GET', '/api/me/export');
  }

  /** 刪除帳號和雲端上的所有資料；這台的水缸不受影響。 */
  async deleteAccount(password: string): Promise<CloudResult<void>> {
    const res = await this.call<void>('DELETE', '/api/account', JSON.stringify({ password }));
    if (res.ok) this.setSession(null);
    return res;
  }

  /**
   * 伺服器改了雲端存檔（市場收支）之後，記下新的版本號。
   * 只在剛好是下一版時前進：重送拿到的是雲端現在的版本，中間可能夾了別台裝置的上傳，
   * 跳過去會讓下次上傳悄悄蓋掉那份；不前進的話下次上傳會撞到衝突，讓玩家選。
   */
  advanceRevision(revision: number): void {
    if (!this.session || revision !== this.session.revision + 1) return;
    this.setSession({ ...this.session, revision });
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

  /** keepalive：關掉頁面時也要送到（推播排程）。 */
  private async call<T>(method: string, path: string, body?: string, withToken = true, keepalive = false): Promise<CloudResult<T>> {
    if (!this.baseUrl) return { ok: false, code: 'unavailable', message: '雲端存檔還沒開放' };
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (withToken && this.session) headers.Authorization = `Bearer ${this.session.token}`;
    let res: Response;
    try {
      res = await this.fetcher(this.baseUrl.replace(/\/$/, '') + path, keepalive ? { method, headers, body, keepalive } : { method, headers, body });
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
