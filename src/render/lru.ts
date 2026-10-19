/**
 * 快取超過上限時，從最久沒用的開始丟掉（Map 依加入順序，命中時要先刪掉再放回最後面）。
 * held 為 true 的還有人在用，跳過；全部都有人在用時可以暫時超過上限。
 */
export function trimLru<K, V>(cache: Map<K, V>, max: number, held: (v: V) => boolean, dispose: (v: V) => void): void {
  for (const [k, v] of cache) {
    if (cache.size <= max) return;
    if (held(v)) continue;
    cache.delete(k);
    dispose(v);
  }
}
