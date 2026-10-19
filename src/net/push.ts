import type { KeyValueStore } from '../game/save';
import type { AlertCategory, ForecastAlert } from '../sim';
import type { CloudClient } from './cloud';

/**
 * 推播通知（GAME_DESIGN 第 11 節）：
 * - 網頁／PWA：用 Web Push。遊戲關掉前把預測交給伺服器，時間到由伺服器送；市場、好友的事由伺服器直接送。
 * - Android App：用手機的本機通知排程（不需要伺服器）；市場只排得到已知的到貨時間。
 * 危機預設開啟，繁殖、市場、好友可以各自開關（2026-10-18 定案）。
 */

export const NOTIFY_KEY = 'cycle.notify.v1';
export const PUSH_DEVICE_KEY = 'cycle.pushdevice.v1';

export interface NotifyPrefs {
  enabled: boolean;
  categories: Record<AlertCategory, boolean>;
}

export const DEFAULT_PREFS: NotifyPrefs = { enabled: false, categories: { crisis: true, breeding: true, market: true, friends: true } };

export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  crisis: '危機預警：水質變差、設備故障、生病、魚餓壞',
  breeding: '繁殖：生仔魚、仔蝦',
  market: '市場：有人買了你的東西、貨到了',
  friends: '好友：邀請、收到禮物',
};

export interface PlannedNotice {
  /** 現實時間（毫秒）。 */
  at: number;
  category: AlertCategory;
  title: string;
  body: string;
  tag: string;
}

/** 一次最多排幾則（和伺服器一致）。 */
export const MAX_PLANNED = 20;

/**
 * 把預測（遊戲小時）換成現實時間，濾掉沒開的類別。
 * 離線時遊戲以 timeScale 倍速前進，所以 h 個遊戲小時後 = h / timeScale 個現實小時後。
 */
export function planNotices(alerts: ForecastAlert[], prefs: NotifyPrefs, snapshotAt: number, timeScale: number, now = Date.now()): PlannedNotice[] {
  if (!prefs.enabled || timeScale <= 0) return [];
  return alerts
    .filter((a) => prefs.categories[a.category])
    .map((a) => ({ at: snapshotAt + (a.hours * 3_600_000) / timeScale, category: a.category, title: "Aquarist's Life", body: a.body, tag: `${a.tank}:${a.key}` }))
    .filter((n) => n.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PLANNED);
}

export function readPrefs(store: KeyValueStore): NotifyPrefs {
  try {
    const raw = JSON.parse(store.getItem(NOTIFY_KEY) ?? 'null');
    if (raw && typeof raw.enabled === 'boolean') return { enabled: raw.enabled, categories: { ...DEFAULT_PREFS.categories, ...raw.categories } };
  } catch {
    // 壞掉就用預設
  }
  return { ...DEFAULT_PREFS, categories: { ...DEFAULT_PREFS.categories } };
}

/** 平台差異：網頁用 Web Push，App 用本機通知。 */
export interface PushPlatform {
  kind: 'web' | 'native';
  /** 跟系統要通知權限；回傳是否允許。 */
  requestPermission(): Promise<boolean>;
  /** 換掉排好的通知（空陣列就是全部取消）。 */
  replace(notices: PlannedNotice[]): Promise<void>;
  /** 偏好改了（開關類別、登入登出）。 */
  sync(prefs: NotifyPrefs): Promise<string | null>;
  disable(): Promise<void>;
}

export class Notifier {
  prefs: NotifyPrefs;

  constructor(
    private store: KeyValueStore,
    readonly platform: PushPlatform | null,
  ) {
    this.prefs = readPrefs(store);
  }

  get available(): boolean {
    return this.platform !== null;
  }

  get enabled(): boolean {
    return this.available && this.prefs.enabled;
  }

  /** 開啟通知；不成功回傳原因。 */
  async enable(): Promise<string | null> {
    if (!this.platform) return '這個瀏覽器收不到通知';
    if (!(await this.platform.requestPermission())) return '通知權限被拒絕了，要到瀏覽器或手機的設定裡打開';
    this.prefs = { ...this.prefs, enabled: true };
    const err = await this.platform.sync(this.prefs);
    if (err) {
      this.prefs = { ...this.prefs, enabled: false };
      return err;
    }
    this.save();
    return null;
  }

  async disable(): Promise<void> {
    this.prefs = { ...this.prefs, enabled: false };
    this.save();
    await this.platform?.disable();
  }

  async setCategory(category: AlertCategory, on: boolean): Promise<void> {
    this.prefs = { ...this.prefs, categories: { ...this.prefs.categories, [category]: on } };
    this.save();
    if (this.enabled) await this.platform!.sync(this.prefs);
  }

  /** 登入、登出後讓伺服器知道這台現在是誰的。 */
  async refresh(): Promise<void> {
    if (this.enabled) await this.platform!.sync(this.prefs);
  }

  async plan(notices: PlannedNotice[]): Promise<void> {
    if (this.enabled) await this.platform!.replace(notices);
  }

  async clear(): Promise<void> {
    if (this.enabled) await this.platform!.replace([]);
  }

  private save(): void {
    try {
      this.store.setItem(NOTIFY_KEY, JSON.stringify(this.prefs));
    } catch {
      // 存不了就只在這次有效
    }
  }
}

function randomId(): string {
  return crypto.randomUUID();
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const enabledCategories = (prefs: NotifyPrefs) => (Object.keys(prefs.categories) as AlertCategory[]).filter((c) => prefs.categories[c]);

/** 網頁版：Service Worker 的 Push 訂閱交給伺服器。 */
export function webPushPlatform(cloud: CloudClient, store: KeyValueStore): PushPlatform | null {
  if (!cloud.available || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined' || !('PushManager' in window) || !('Notification' in window)) return null;
  const device = (): { id: string; secret: string } => {
    try {
      const raw = JSON.parse(store.getItem(PUSH_DEVICE_KEY) ?? 'null');
      if (raw?.id && raw?.secret) return raw;
    } catch {
      // 重新產生
    }
    const d = { id: randomId(), secret: randomId() + randomId() };
    store.setItem(PUSH_DEVICE_KEY, JSON.stringify(d));
    return d;
  };
  return {
    kind: 'web',
    async requestPermission() {
      return (await Notification.requestPermission()) === 'granted';
    },
    async sync(prefs) {
      const key = await cloud.pushKey();
      if (!key.ok) return key.message;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.value.publicKey) as BufferSource });
        } catch {
          return '這個瀏覽器沒辦法訂閱通知';
        }
      }
      const j = sub.toJSON();
      const d = device();
      const res = await cloud.pushRegister(d.id, { secret: d.secret, endpoint: j.endpoint ?? '', p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', categories: enabledCategories(prefs) });
      return res.ok ? null : res.message;
    },
    async replace(notices) {
      const d = device();
      await cloud.pushSchedule(d.id, d.secret, notices);
    },
    async disable() {
      const d = device();
      await cloud.pushUnregister(d.id, d.secret);
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
    },
  };
}

/** App 版：手機自己排本機通知（關掉 App 也會跳）。 */
export function nativePlatform(): PushPlatform {
  const plugin = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);
  const cancelAll = async () => {
    const ln = await plugin();
    const pending = await ln.getPending();
    if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  };
  return {
    kind: 'native',
    async requestPermission() {
      const ln = await plugin();
      const now = await ln.checkPermissions();
      if (now.display === 'granted') return true;
      return (await ln.requestPermissions()).display === 'granted';
    },
    async sync() {
      return null;
    },
    async replace(notices) {
      await cancelAll();
      if (notices.length === 0) return;
      const ln = await plugin();
      await ln.schedule({
        notifications: notices.map((n, i) => ({ id: i + 1, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true }, extra: { category: n.category, tag: n.tag } })),
      });
    },
    async disable() {
      await cancelAll();
    },
  };
}
