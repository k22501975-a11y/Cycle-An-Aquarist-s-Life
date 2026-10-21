/// <reference lib="webworker" />
import { catchUp, type SaveFile } from './save';

/** 開機補算離開期間的時間（G6）：在背景執行緒跑，主執行緒同時初始化畫面、載圖，開場動畫也不會卡住。 */
self.onmessage = (e: MessageEvent<{ file: SaveFile; now: number }>) => {
  const { file, now } = e.data;
  const res = catchUp(file, now);
  // 事件只回傳每缸新增幾筆：主執行緒從回傳的缸裡切出來，才是同一批物件
  (self as unknown as Worker).postMessage({ file, hours: res.hours, capped: res.capped, counts: res.byTank.map((ev) => ev.length) });
};
