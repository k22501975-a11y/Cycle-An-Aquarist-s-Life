import { DEFAULT_TIME_SCALE, simulate, type SimEvent, type TankState } from '../sim';

export const SAVE_KEY = 'cycle.save.v1';

/** 離線補算最多補幾個遊戲小時（約兩週），避免久沒開時一次算太久。 */
export const MAX_OFFLINE_HOURS = 14 * 24;

export interface SaveFile {
  version: 1;
  /** 存檔時的現實時間（毫秒）。 */
  savedAt: number;
  timeScale: number;
  state: TankState;
}

/** 可替換的儲存位置（瀏覽器用 localStorage，測試用記憶體）。 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeSave(store: KeyValueStore, state: TankState, timeScale: number, now = Date.now()): boolean {
  const file: SaveFile = { version: 1, savedAt: now, timeScale, state };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    // 無痕模式或空間不足時存不了，遊戲照常進行。
    return false;
  }
}

export function readSave(store: KeyValueStore): SaveFile | null {
  let raw: string | null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (file?.version !== 1 || file.state?.version !== 1 || typeof file.savedAt !== 'number') return null;
    return file;
  } catch {
    return null;
  }
}

export function clearSave(store: KeyValueStore): void {
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* 忽略 */
  }
}

export interface OfflineResult {
  /** 補算了幾個遊戲小時。 */
  hours: number;
  /** 是否因為離開太久而只補算到上限。 */
  capped: boolean;
  /** 離開期間發生的事件。 */
  events: SimEvent[];
}

/**
 * 補算玩家離開期間的時間。離線一律用正式倍率（×7）計算，
 * 開發用的加速倍率不算數；存檔時是暫停狀態就不補算。
 */
export function catchUp(file: SaveFile, now = Date.now()): OfflineResult {
  const elapsedMs = Math.max(0, now - file.savedAt);
  const scale = file.timeScale > 0 ? DEFAULT_TIME_SCALE : 0;
  const wanted = (elapsedMs / 1000 / 3600) * scale;
  const hours = Math.min(wanted, MAX_OFFLINE_HOURS);
  const before = file.state.events.at(-1);
  if (hours >= 1 / 60) simulate(file.state, hours);
  const events = file.state.events;
  const fresh = events.slice(before ? events.lastIndexOf(before) + 1 : 0);
  return { hours, capped: wanted > MAX_OFFLINE_HOURS, events: fresh };
}

/** 瀏覽器的 localStorage；不能用時退回記憶體（只在這次開啟期間有效）。 */
export function browserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__cycle_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}
