/// <reference lib="webworker" />
import { forecast } from '../sim/forecast';
import type { TankState } from '../sim';

/** 推播預測在背景執行緒跑（往後模擬 72 遊戲小時要幾百毫秒，不能卡住畫面）。 */
self.onmessage = (e: MessageEvent<{ id: number; tanks: TankState[]; hours: number }>) => {
  const { id, tanks, hours } = e.data;
  (self as unknown as Worker).postMessage({ id, alerts: forecast(tanks, hours) });
};
