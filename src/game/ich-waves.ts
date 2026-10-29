/**
 * 劇本量「前 120 天白點幾波」（polish-to-9.md §11、§13.6）：
 * - 一缸從有蟲到蟲死光是一段；這段裡真的有魚長出白點才算一波，潛伏的魚一直沒長出來就不在了不算。
 * - 帶蟲的魚被搬到別缸（分缸、搬去新缸）是同一波跟著魚走（#455）。
 * - 同一缸從這一波第一次發病那天起 7 天內再發，算同一波；7 天固定不往後延，超過才算新的一波。
 */
export const ICH_WAVE_DAYS = 7;

/** 一缸今天的白點狀態。 */
export interface IchDay {
  /** 缸還在不在一段白點裡（有魚帶蟲，或水裡的蟲還沒死光）。 */
  episode: boolean;
  /** 有魚身上看得到白點。 */
  visible: boolean;
  /** 這缸帶蟲的魚昨天就帶著（從別缸搬來的）。 */
  moved: boolean;
}

/** 每天叫一次，回傳今天新算的波數。key 是缸（同一個物件就是同一缸）。 */
export function ichWaveCounter<K>(): (day: number, tanks: ReadonlyArray<[K, IchDay]>) => number {
  const open = new Map<K, { counted: boolean }>();
  const waveStart = new Map<K, number>();
  return (day, tanks) => {
    let n = 0;
    for (const [key, t] of tanks) {
      if (!t.episode) {
        open.delete(key);
        continue;
      }
      let ep = open.get(key);
      if (!ep) open.set(key, (ep = { counted: t.moved }));
      if (ep.counted || !t.visible) continue;
      ep.counted = true;
      const start = waveStart.get(key);
      if (start !== undefined && day - start < ICH_WAVE_DAYS) continue;
      waveStart.set(key, day);
      n++;
    }
    return n;
  };
}
