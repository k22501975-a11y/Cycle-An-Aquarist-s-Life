import type { ForecastAlert, TankState } from '../sim';

/** 在 Web Worker 裡跑推播預測；同時只跑一次，新的請求會等上一個做完。 */
export class Forecaster {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (alerts: ForecastAlert[]) => void>();

  run(tanks: TankState[], hours: number): Promise<ForecastAlert[]> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./forecast-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; alerts: ForecastAlert[] }>) => {
        this.pending.get(e.data.id)?.(e.data.alerts);
        this.pending.delete(e.data.id);
      };
    }
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      // 傳一份純資料過去（structured clone）
      this.worker!.postMessage({ id, tanks: JSON.parse(JSON.stringify(tanks)), hours });
    });
  }
}
