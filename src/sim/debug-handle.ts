/**
 * 主控台和流程測試用的 cycle.sim（main.ts 開機後延後載入）：整包 sim 的 export 放在這個延後載入的 chunk，
 * 不然 main.ts 把 sim 命名空間掛到 window 上，搖樹就搖不掉沒用到的 export，全部進開機必載（約 16 KB gzip）。
 */
export * from './index';
