import { DEFAULT_TIME_SCALE, linkTanks, needsSetup, normalizeState, simulate, step, TICK_HOURS, type SimEvent, type TankState } from '../sim';

export const SAVE_KEY = 'cycle.save.v1';

/** 離線補算最多補幾個遊戲小時（約兩週），避免久沒開時一次算太久。 */
export const MAX_OFFLINE_HOURS = 14 * 24;

/** 目前的存檔格式版本。改了存檔結構就加 1，並在 MIGRATIONS 補上舊版轉新版的步驟。 */
export const SAVE_VERSION = 3;
/** 自動備份：主存檔讀不出來時用它還原。 */
export const BACKUP_KEY = 'cycle.save.backup';
/** 比目前遊戲新的存檔（例如在新版玩過又開到舊版）原封不動留在這裡，不覆蓋。 */
export const NEWER_KEY = 'cycle.save.newer';
/** 壞掉的存檔留一份，方便回報問題。 */
export const CORRUPT_KEY = 'cycle.save.corrupt';
/** 多久更新一次備份（毫秒）。 */
export const BACKUP_INTERVAL_MS = 30 * 60 * 1000;

export interface SaveFile {
  version: number;
  /** 存檔時的現實時間（毫秒）。 */
  savedAt: number;
  timeScale: number;
  /** 主缸（第一缸）。 */
  state: TankState;
  /** 其他的缸（多缸）。 */
  tanks?: TankState[];
  /** 存檔時在看哪一缸（0 是主缸）。 */
  active?: number;
  /** 這份存檔上次備份的時間（現實毫秒）。 */
  backedUpAt?: number;
}

/** 可替換的儲存位置（瀏覽器用 localStorage，測試用記憶體）。 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 舊版存檔轉新版：key 是「從哪一版」，回傳下一版。 */
const MIGRATIONS: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2：加入備份時間欄位；狀態結構相同（新欄位都是選填，由 normalizeState 補齊）。
  1: (file) => ({ ...file, version: 2 }),
  // v2 → v3：加入多缸（tanks、active 選填，舊存檔只有一缸）。
  2: (file) => ({ ...file, version: 3 }),
};

/** 存檔裡除了主缸以外的部分。 */
export interface ExtraTanks {
  tanks: TankState[];
  active: number;
}

export type ParseResult = { ok: true; file: SaveFile } | { ok: false; reason: 'corrupt' | 'newer' };

/** 解析並升級一份存檔文字。 */
export function parseSave(raw: string): ParseResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') return { ok: false, reason: 'corrupt' };
  if (data.version > SAVE_VERSION) return { ok: false, reason: 'newer' };
  while ((data.version as number) < SAVE_VERSION) {
    const migrate = MIGRATIONS[data.version as number];
    if (!migrate) return { ok: false, reason: 'corrupt' };
    data = migrate(data);
  }
  const file = data as unknown as SaveFile;
  const state = file.state as TankState | undefined;
  if (typeof file.savedAt !== 'number' || typeof file.timeScale !== 'number' || !state || state.version !== 1 || !Array.isArray(state.fish)) return { ok: false, reason: 'corrupt' };
  if (file.tanks !== undefined && (!Array.isArray(file.tanks) || file.tanks.some((t) => !t || t.version !== 1 || !Array.isArray(t.fish)))) return { ok: false, reason: 'corrupt' };
  try {
    normalizeState(state);
    for (const t of file.tanks ?? []) normalizeState(t);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  return { ok: true, file };
}

function get(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function set(store: KeyValueStore, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function serializeSave(state: TankState, timeScale: number, now = Date.now(), backedUpAt?: number, extra?: ExtraTanks): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, timeScale, state, backedUpAt };
  if (extra && extra.tanks.length > 0) {
    file.tanks = extra.tanks;
    file.active = extra.active;
  }
  return JSON.stringify(file);
}

/** 存檔。每隔 BACKUP_INTERVAL_MS 先把上一份好的存檔複製到備份。 */
export function writeSave(store: KeyValueStore, state: TankState, timeScale: number, now = Date.now(), extra?: ExtraTanks): boolean {
  const prevRaw = get(store, SAVE_KEY);
  let backedUpAt: number | undefined;
  if (prevRaw) {
    const prev = parseSave(prevRaw);
    if (prev.ok) {
      backedUpAt = prev.file.backedUpAt;
      if (backedUpAt === undefined || now - backedUpAt >= BACKUP_INTERVAL_MS) {
        if (set(store, BACKUP_KEY, prevRaw)) backedUpAt = now;
      }
    }
  }
  // 無痕模式或空間不足時存不了，遊戲照常進行。
  return set(store, SAVE_KEY, serializeSave(state, timeScale, now, backedUpAt ?? now, extra));
}

export interface LoadResult {
  file: SaveFile | null;
  /** none：沒有存檔；ok：正常；restored：主存檔壞了，從備份還原；newer：存檔比遊戲新，已另外保留；corrupt：壞了也沒有備份。 */
  status: 'none' | 'ok' | 'restored' | 'newer' | 'corrupt';
}

export function loadSave(store: KeyValueStore): LoadResult {
  const raw = get(store, SAVE_KEY);
  if (!raw) return { file: null, status: 'none' };
  const main = parseSave(raw);
  if (main.ok) return { file: main.file, status: 'ok' };
  if (main.reason === 'newer') {
    set(store, NEWER_KEY, raw);
    return { file: null, status: 'newer' };
  }
  set(store, CORRUPT_KEY, raw);
  const backupRaw = get(store, BACKUP_KEY);
  const backup = backupRaw ? parseSave(backupRaw) : null;
  if (backup?.ok) {
    set(store, SAVE_KEY, backupRaw!);
    return { file: backup.file, status: 'restored' };
  }
  return { file: null, status: 'corrupt' };
}

export function readSave(store: KeyValueStore): SaveFile | null {
  return loadSave(store).file;
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
  /** 離開期間主缸發生的事件。 */
  events: SimEvent[];
  /** 每一缸離開期間的事件（第 0 個是主缸，和 events 相同）。 */
  byTank: SimEvent[][];
}

/**
 * 補算玩家離開期間的時間。離線一律用正式倍率（×7）計算，
 * 開發用的加速倍率不算數；存檔時是暫停狀態就不補算。
 */
export function catchUp(file: SaveFile, now = Date.now()): OfflineResult {
  const elapsedMs = Math.max(0, now - file.savedAt);
  // 還沒開缸（還在挑設備）的空缸不算時間，跟 Game.advance 一樣
  const scale = file.timeScale > 0 && !needsSetup(file.state) ? DEFAULT_TIME_SCALE : 0;
  const wanted = (elapsedMs / 1000 / 3600) * scale;
  const hours = Math.min(wanted, MAX_OFFLINE_HOURS);
  const all = [file.state, ...(file.tanks ?? [])];
  // 共用錢包：每缸的電費都記到同一個帳上
  linkTanks(all);
  const before = all.map((t) => t.events.at(-1));
  // 每缸輪流走一個 tick，時間和電費帳單才會對齊
  if (hours >= 1 / 60) {
    if (all.length === 1) simulate(all[0], hours);
    else for (let i = Math.round(hours / TICK_HOURS); i > 0; i--) for (const t of all) step(t);
  }
  const byTank = all.map((t, i) => t.events.slice(before[i] ? t.events.lastIndexOf(before[i]!) + 1 : 0));
  return { hours, capped: wanted > MAX_OFFLINE_HOURS, events: byTank[0], byTank };
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
