import { describe, expect, it } from 'vitest';
import { addFish } from '../sim';
import { newGameState } from './game';
import { BACKUP_INTERVAL_MS, BACKUP_KEY, loadSave, NEWER_KEY, parseSave, SAVE_KEY, SAVE_VERSION, serializeSave, writeSave, type KeyValueStore } from './save';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('存檔版本遷移', () => {
  it('第 1 版的舊存檔會升級成目前版本，內容不變', () => {
    const state = newGameState(3);
    addFish(state, 'guppy');
    const old = JSON.stringify({ version: 1, savedAt: 5, timeScale: 7, state });
    const res = parseSave(old);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.version).toBe(SAVE_VERSION);
      expect(res.file.state.fish).toHaveLength(1);
    }
  });

  it('比遊戲新的存檔不讀、也不會被覆蓋掉', () => {
    const store = memoryStore();
    const future = JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, timeScale: 7, state: {} });
    store.setItem(SAVE_KEY, future);
    expect(loadSave(store)).toEqual({ file: null, status: 'newer' });
    expect(store.getItem(NEWER_KEY)).toBe(future);
  });
});

describe('存檔備份', () => {
  it('主存檔壞掉時從備份還原', () => {
    const store = memoryStore();
    const state = newGameState(4);
    writeSave(store, state, 7, 0);
    writeSave(store, state, 7, BACKUP_INTERVAL_MS + 1);
    expect(store.getItem(BACKUP_KEY)).not.toBeNull();
    store.setItem(SAVE_KEY, '{"version":2,"broken');
    const res = loadSave(store);
    expect(res.status).toBe('restored');
    expect(res.file?.state.hours).toBe(state.hours);
  });

  it('壞掉又沒有備份時當作新遊戲', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, 'garbage');
    expect(loadSave(store)).toEqual({ file: null, status: 'corrupt' });
  });

  it('備份每 30 分鐘才更新一次', () => {
    const store = memoryStore();
    const state = newGameState(4);
    writeSave(store, state, 7, 0);
    writeSave(store, state, 7, 1000);
    const first = store.getItem(BACKUP_KEY);
    state.hours = 99;
    writeSave(store, state, 7, 2000);
    expect(store.getItem(BACKUP_KEY)).toBe(first);
    writeSave(store, state, 7, BACKUP_INTERVAL_MS + 5000);
    expect(JSON.parse(store.getItem(BACKUP_KEY)!).state.hours).toBe(99);
  });

  it('匯出的文字可以再匯入', () => {
    const state = newGameState(8);
    const res = parseSave(serializeSave(state, 7, 123));
    expect(res.ok && res.file.state).toEqual(state);
  });
});
