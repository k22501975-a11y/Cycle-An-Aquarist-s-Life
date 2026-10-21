import type { KeyValueStore } from '../game/save';

/** 圖鑑已解鎖（遇過）的條目 id，存在本機。 */
export const CODEX_KEY = 'cycle.codex.v1';

export function loadCodexSeen(store: KeyValueStore): Set<string> {
  try {
    const raw = JSON.parse(store.getItem(CODEX_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveCodexSeen(store: KeyValueStore, seen: Set<string>): void {
  try {
    store.setItem(CODEX_KEY, JSON.stringify([...seen]));
  } catch {
    // 存不了就算了
  }
}
