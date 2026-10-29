import { describe, expect, it } from 'vitest';
import { addFish, addPlant, economy, feed, simulate, snailState } from '../sim';
import { blankGameState, newGameState } from './game';
import { catchUp, clearSave, MAX_OFFLINE_HOURS, parseSave, readSave, SAVE_KEY, serializeSave, writeSave, type KeyValueStore } from './save';

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

  it('收納箱（polish-to-9.md §13.7）：舊存檔沒有就是沒有；箱裡的魚跟缸裡的一樣補上缺的欄位', () => {
    const old = newGameState(5);
    const raw = JSON.parse(serializeSave(old, 7, 1000));
    const read = parseSave(JSON.stringify(raw));
    expect(read.ok && read.file.state.tub).toBeUndefined();
    const f = addFish(old, 'guppy', { carriesIch: false });
    old.fish = [];
    old.tub = { fish: [f] };
    const withTub = JSON.parse(serializeSave(old, 7, 1000));
    delete withTub.state.tub.fish[0].finDamage;
    const back = parseSave(JSON.stringify(withTub));
    expect(back.ok && back.file.state.tub?.fish[0].finDamage).toBe(0);
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

describe('舊存檔遷移：搭便車的螺（polish-to-9.md §4）', () => {
  /** 做一份舊版存檔：錢包沒有 plantBuys、螺沒有 pestsSeen。 */
  const oldSave = (setup: (main: ReturnType<typeof newGameState>, second: ReturnType<typeof newGameState>) => void) => {
    const main = newGameState(5);
    const second = newGameState(6);
    setup(main, second);
    for (const t of [main, second]) {
      delete economy(t).plantBuys;
      if (t.snails) delete t.snails.pestsSeen;
    }
    const res = parseSave(serializeSave(main, 7, 1000, undefined, { tanks: [second], active: 0 }));
    if (!res.ok) throw new Error(res.reason);
    return res.file;
  };

  it('任一缸已經有水草：第一次必帶螺算用掉了；都沒有水草就還沒用', () => {
    expect(economy(oldSave((_, second) => void addPlant(second, 'anubias')).state).plantBuys).toBe(1);
    expect(economy(oldSave(() => {}).state).plantBuys).toBe(0);
  });

  it('缸裡已經有 5 隻以上的害蟲螺：直接當作看過了，讀檔後不會補記 pests_seen', () => {
    const file = oldSave((_, second) => {
      snailState(second).pests.ramshorn = 12;
    });
    const second = file.tanks![0];
    expect(second.snails!.pestsSeen).toBe(true);
    simulate(second, 24);
    expect(second.events.some((e) => e.type === 'pests_seen')).toBe(false);
  });
});
