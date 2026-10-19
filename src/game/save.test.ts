import { describe, expect, it } from 'vitest';
import { addFish, feed } from '../sim';
import { blankGameState, newGameState } from './game';
import { catchUp, clearSave, MAX_OFFLINE_HOURS, readSave, SAVE_KEY, writeSave, type KeyValueStore } from './save';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const HOUR_MS = 3600 * 1000;

describe('存檔', () => {
  it('存檔後讀回來，狀態完全一樣', () => {
    const store = memoryStore();
    const state = newGameState(5);
    addFish(state, 'guppy', { carriesIch: false });
    feed(state, 20);
    expect(writeSave(store, state, 7, 1000)).toBe(true);

    const file = readSave(store)!;
    expect(file.savedAt).toBe(1000);
    expect(file.timeScale).toBe(7);
    expect(file.state).toEqual(state);
  });

  it('壞掉或版本不對的存檔視為沒有存檔', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, '{not json');
    expect(readSave(store)).toBeNull();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(readSave(store)).toBeNull();
  });

  it('存不進去時不會讓遊戲壞掉', () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(writeSave(full, newGameState(1), 7)).toBe(false);
  });

  it('清除存檔', () => {
    const store = memoryStore();
    writeSave(store, newGameState(1), 7);
    clearSave(store);
    expect(readSave(store)).toBeNull();
  });
});

describe('離線補算', () => {
  it('離開現實 1 小時，用 ×7 補算 7 個遊戲小時', () => {
    const store = memoryStore();
    const state = newGameState(2);
    writeSave(store, state, 7, 0);
    const file = readSave(store)!;
    const result = catchUp(file, HOUR_MS);
    expect(result.hours).toBeCloseTo(7);
    expect(file.state.hours).toBeCloseTo(state.hours + 7, 1);
  });

  it('開發用加速倍率不影響離線補算', () => {
    const store = memoryStore();
    writeSave(store, newGameState(2), 21600, 0);
    expect(catchUp(readSave(store)!, HOUR_MS).hours).toBeCloseTo(7);
  });

  it('還沒開缸就關掉，回來不補算', () => {
    const store = memoryStore();
    const state = blankGameState(2);
    writeSave(store, state, 7, 0);
    const file = readSave(store)!;
    expect(catchUp(file, 24 * HOUR_MS).hours).toBe(0);
    expect(file.state.hours).toBe(state.hours);
  });

  it('暫停時存檔，不補算', () => {
    const store = memoryStore();
    writeSave(store, newGameState(2), 0, 0);
    expect(catchUp(readSave(store)!, HOUR_MS).hours).toBe(0);
  });

  it('離開太久只補算到上限', () => {
    const store = memoryStore();
    writeSave(store, newGameState(2), 7, 0);
    const result = catchUp(readSave(store)!, 365 * 24 * HOUR_MS);
    expect(result.hours).toBe(MAX_OFFLINE_HOURS);
    expect(result.capped).toBe(true);
  });

  it('回報離開期間發生的事件', () => {
    const store = memoryStore();
    const state = newGameState(3);
    const fish = addFish(state, 'guppy', { carriesIch: false });
    fish.health = 0.01;
    state.water.tan = 20;
    writeSave(store, state, 7, 0);
    const result = catchUp(readSave(store)!, HOUR_MS);
    expect(result.events.some((e) => e.type === 'fish_died')).toBe(true);
  });
});
