import { DEFAULT_TIME_SCALE } from '../sim';
import { catchUp, type OfflineResult, type SaveFile } from './save';

/** 補算少於這麼多遊戲小時就直接在主執行緒算（開背景執行緒、載程式碼反而比較久）。 */
export const WORKER_MIN_HOURS = 2;

/**
 * 補算離開期間的時間（G6）：離開久的在 Web Worker 裡算，算完回傳補算後的存檔；
 * 開不了 Worker 或背景出錯就退回主執行緒算，結果一樣（同一份 catchUp）。
 * 回傳的存檔可能是另一份物件（背景算的），之後要用回傳的，不要再用傳進來的。
 */
export async function catchUpSave(file: SaveFile, now = Date.now()): Promise<{ file: SaveFile; offline: OfflineResult }> {
  const hours = (Math.max(0, now - file.savedAt) / 3_600_000) * DEFAULT_TIME_SCALE;
  if (hours < WORKER_MIN_HOURS || typeof Worker === 'undefined') return { file, offline: catchUp(file, now) };
  try {
    const out = await new Promise<{ file: SaveFile; hours: number; capped: boolean; counts: number[] }>((resolve, reject) => {
      // 跟推播預測共用同一個 Worker 檔（sim-worker.ts），這裡開一個用完就關
      const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => (worker.terminate(), resolve(e.data));
      worker.onerror = (e) => (worker.terminate(), reject(e));
      try {
        worker.postMessage({ file, now });
      } catch (err) {
        // 存檔複製不過去（DataCloneError）：關掉 Worker，退回主執行緒算
        worker.terminate();
        reject(err);
      }
    });
    const all = [out.file.state, ...(out.file.tanks ?? [])];
    const byTank = all.map((t, i) => t.events.slice(Math.max(0, t.events.length - out.counts[i])));
    return { file: out.file, offline: { hours: out.hours, capped: out.capped, events: byTank[0], byTank } };
  } catch {
    return { file, offline: catchUp(file, now) };
  }
}
