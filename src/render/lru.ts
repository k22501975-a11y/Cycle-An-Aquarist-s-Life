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

/**
 * 有參照計數的 LRU 快取（調色後的魚貼圖用）：有人 retain 的不會被丟；
 * 剛放進去、還來不及 retain 的那一個也不會被丟（不然拿到的是已經銷毀的貼圖）。
 */
export class RefLru<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly refs = new Map<V, number>();

  constructor(
    private readonly max: number,
    private readonly dispose: (v: V) => void,
  ) {}

  get size(): number {
    return this.cache.size;
  }

  /** 拿快取裡的值，順便標成剛用過。 */
  get(key: K): V | undefined {
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  /** 放進新值，超過上限就丟掉最久沒用、沒人在用的（不含這個新值）。 */
  add(key: K, value: V): V {
    this.cache.set(key, value);
    trimLru(this.cache, this.max, (v) => v === value || this.refs.has(v), this.dispose);
    return value;
  }

  retain(v: V | null): void {
    if (v !== null) this.refs.set(v, (this.refs.get(v) ?? 0) + 1);
  }

  release(v: V | null): void {
    if (v === null) return;
    const n = (this.refs.get(v) ?? 0) - 1;
    if (n > 0) this.refs.set(v, n);
    else this.refs.delete(v);
  }
}
