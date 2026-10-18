import type { KeyValueStore } from '../game/save';

/**
 * 匿名數據分析（隱私權政策第 3 節）：玩家在設定裡同意才會送。
 * 只記「發生了什麼」（例如魚死於氨中毒、完成教學某一步），用隨機代號，不連到帳號。
 */
export const ANALYTICS_KEY = 'cycle.analytics.v1';
const MAX_QUEUE = 200;
const BATCH = 50;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type EventProps = Record<string, string | number | boolean>;

interface Stored {
  /** null：還沒問過。 */
  consent: boolean | null;
  clientId: string;
}

export class Analytics {
  private stored: Stored;
  private queue: { name: string; props?: EventProps }[] = [];
  private sending = false;

  constructor(
    readonly baseUrl: string | undefined,
    private store: KeyValueStore,
    private fetcher: Fetch = (input, init) => fetch(input, init),
    private newId: () => string = () => crypto.randomUUID(),
  ) {
    this.stored = this.read();
  }

  /** 有伺服器才有數據分析可以開。 */
  get available(): boolean {
    return !!this.baseUrl;
  }

  get consent(): boolean | null {
    return this.stored.consent;
  }

  /** 玩家選了要不要幫忙。關掉時順便換一個新代號，之後就連不回以前的紀錄。 */
  setConsent(on: boolean): void {
    this.stored = { consent: on, clientId: on ? this.stored.clientId : this.newId() };
    if (!on) this.queue = [];
    this.write();
  }

  track(name: string, props?: EventProps): void {
    if (!this.available || this.stored.consent !== true) return;
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(props ? { name, props } : { name });
  }

  get pending(): number {
    return this.queue.length;
  }

  /** 把排隊的事件送出去；送失敗就留著下次再送。keepalive 用在關網頁時。 */
  async flush(keepalive = false): Promise<void> {
    if (!this.baseUrl || this.stored.consent !== true || this.sending || this.queue.length === 0) return;
    const batch = this.queue.slice(0, BATCH);
    this.sending = true;
    try {
      const res = await this.fetcher(this.baseUrl.replace(/\/$/, '') + '/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.stored.clientId, events: batch }),
        keepalive,
      });
      // 4xx 代表這批有問題，重送也沒用；5xx 留著下次
      if (res.ok || (res.status >= 400 && res.status < 500)) this.queue.splice(0, batch.length);
    } catch {
      // 離線：下次再送
    } finally {
      this.sending = false;
    }
  }

  private read(): Stored {
    try {
      const raw = JSON.parse(this.store.getItem(ANALYTICS_KEY) ?? 'null');
      if (raw && typeof raw.clientId === 'string' && (raw.consent === null || typeof raw.consent === 'boolean')) return raw;
    } catch {
      // 壞掉就當沒問過
    }
    return { consent: null, clientId: this.newId() };
  }

  private write(): void {
    try {
      this.store.setItem(ANALYTICS_KEY, JSON.stringify(this.stored));
    } catch {
      // 存不了就只在這次開啟期間有效
    }
  }
}
