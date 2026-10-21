/// <reference lib="webworker" />
import { forecast } from '../sim/forecast';
import type { TankState } from '../sim';
import { catchUp, type SaveFile } from './save';

/**
 * 背景執行緒跑模擬（不能卡住畫面）。兩件事共用一個檔，模擬程式只打包一份（check-assets 的 JS 總量上限）：
 * - 推播預測：往後模擬 72 遊戲小時要幾百毫秒（Forecaster）
 * - 開機補算離開期間的時間（G6，catchUpSave）：主執行緒同時初始化畫面、載圖，開場動畫也不會卡住
 */
type Request = { id: number; tanks: TankState[]; hours: number } | { file: SaveFile; now: number };

self.onmessage = (e: MessageEvent<Request>) => {
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  const req = e.data;
  if ('file' in req) {
    const res = catchUp(req.file, req.now);
    // 事件只回傳每缸新增幾筆：主執行緒從回傳的缸裡切出來，才是同一批物件
    post({ file: req.file, hours: res.hours, capped: res.capped, counts: res.byTank.map((ev) => ev.length) });
  } else post({ id: req.id, alerts: forecast(req.tanks, req.hours) });
};
