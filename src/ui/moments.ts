import type { KeyValueStore } from '../game/save';

/**
 * 「第一次」的有感演出（MVP M20）：養水完成、第一次賣魚…每件事只慶祝一次。
 * 記在這台裝置上（跟新手教學的進度一樣），不進存檔。
 */
export type MomentId = 'cycled' | 'first_sale' | 'first_fry';

export const MOMENTS_KEY = 'cycle.moments.v1';

export function loadMoments(store: KeyValueStore): Set<MomentId> {
  try {
    const raw = store.getItem(MOMENTS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is MomentId => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** 第一次發生就記下來並回傳 true；之後都回傳 false。 */
export function firstTime(store: KeyValueStore, id: MomentId): boolean {
  const seen = loadMoments(store);
  if (seen.has(id)) return false;
  seen.add(id);
  try {
    store.setItem(MOMENTS_KEY, JSON.stringify([...seen]));
  } catch {
    // 存不了（無痕模式）也照樣慶祝這一次
  }
  return true;
}
