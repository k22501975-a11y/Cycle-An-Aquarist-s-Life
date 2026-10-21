# 效能預算

架構角色維護。目標裝置是中階 Android 手機（約 2021 年的機種、4 GB 記憶體）橫向遊玩。
標「CI」的項目由 `scripts/check-assets.mjs` 自動檢查，超過就不能合併；其他項目在 PR 審查和效能評測時檢查。

## 1. 幀率

| 項目 | 預算 |
|---|---|
| 一般缸（中畫質，≤ 50 尾、滿缸水草） | 穩定 60 fps |
| 繁殖缸（中畫質，100 尾） | ≥ 30 fps |
| 自動降畫質 | 低於 40 fps 持續 8 秒降一級（`src/game/frame-monitor.ts`） |
| 每幀 JS 時間（遊戲邏輯＋場景更新） | 中階手機上 50 尾 ≤ 12 ms、100 尾 ≤ 25 ms。CI／雲端測試機（沒有 GPU）100 尾超過 8 ms 就要查（效能與安全的基準：2026-10-19 是 5.4 ms） |
| 閒置（20 秒沒操作） | 降到 30 fps 省電 |
| 單一幀最長 | ≤ 50 ms（離線補算、開大面板例外，但要顯示進度或分批做） |
| 模擬一個 tick | ≤ 2 ms（CPU 時間）；離線補算 14 個遊戲日要在 3 秒內完成 |

每幀的工作只做「讀狀態、移動、畫」，不在每幀配置大量物件或建立新的貼圖、濾鏡。

## 2. 記憶體

| 項目 | 預算 |
|---|---|
| JS heap（遊玩 10 分鐘後） | ≤ 150 MB |
| GPU 貼圖合計 | ≤ 200 MB |
| 長時間遊玩 | 開關面板、換缸 20 次後 heap 不能持續上升（沒有洩漏） |

## 3. 載入

| 項目 | 預算 |
|---|---|
| 冷啟動到看得到水缸（手機 4G） | ≤ 3 秒 |
| 1. 主程式（入口 JS）gzip 後 | ≤ 300 KB（CI，`--dist`；目前約 278 KB） |
| 2. 開機必載：入口加上它靜態 import 的 chunk（Vite manifest 的 `imports`）gzip 後 | ≤ 330 KB（CI，`--dist`；目前約 278 KB，入口沒有靜態 import 的 chunk） |
| 2b. 開機實際下載的 JS（含開機時動態載入的 WebGL 渲染器、Pixi 環境擴充、面板包） | ≤ 420 KB（效能與安全用 Playwright 量，每個候選版本一次；2026-10-21 約 372 KB） |
| 3. JS 程式碼 gzip 後合計（防膨脹：延後載入的 chunk、Worker 也算） | ≤ 520 KB（CI，`--dist`；目前約 423 KB） |
| 4. 開機必載以外的單一 chunk（延後載入的面板、Worker）gzip 後 | ≤ 60 KB（CI，`--dist`；目前最大是 WebGL 渲染器約 36 KB） |
| 存檔大小 | ≤ 1 MB（localStorage 有 5 MB 上限，還要留給其他資料） |

把只在特定時候用到的介面改成延後載入（`import()`），可以降第 1、2 條；第 3 條是總量，延後載入也算，避免整體無限長大。
渲染器只用 WebGL（`src/render/gl-app.ts`），不經過 Pixi 的 autoDetectRenderer，打包時不會帶 WebGPU、Canvas 兩套渲染器；裝置開不了 WebGL 時顯示原因（`showStartupError`，e2e：`webgl-unavailable.spec.ts`）。

## 4. 素材與貼圖

| 項目 | 規則 |
|---|---|
| `public/art/` 格式 | 只收 `.webp`（CI） |
| `public/art/` 單張 | ≤ 300 KB（CI） |
| `public/icons/` 單張 | ≤ 400 KB（CI） |
| `public/` 合計（會打進 APK） | ≤ 15 MB（CI；目前約 5.4 MB） |
| 角色、道具貼圖尺寸 | 長邊 ≤ 512 px，透明背景；畫面上最大顯示尺寸 × 2 就夠 |
| 背景貼圖尺寸 | 長邊 ≤ 2560 px |
| 貼圖尺寸 | 盡量用 2 的倍數或至少偶數，避免縮放時邊緣模糊 |
| 原始大圖 | 放專案共用資料夾 `art/`（png），不要放進 repo；進 repo 前用 `scripts/import-art.py` 轉 webp 縮尺寸 |
| 程式畫的向量圖 | 轉成貼圖快取，每種組合畫一次，不每幀重畫 |

## 5. 網路

| 項目 | 預算 |
|---|---|
| 雲端存檔上傳 | 只在存檔有變時上傳，並且節流（目標間隔 ≥ 60 秒） |
| 離線時 | 遊戲要能完整遊玩；網路功能失敗只顯示提示，不能卡住或當掉 |

## 6. 怎麼量

- 素材與程式碼大小：`npm run check:assets`、打包後 `node scripts/check-assets.mjs --dist`。
- 幀率不能在 CI 量：CI 和雲端容器沒有 GPU，畫面是 CPU 軟體繪製，絕對幀率遠低於手機。幀率以實機為準；CI 只看「每幀 JS 時間」這種和 GPU 無關的指標。
- 幀率：開發者選單的效能資訊，或 Chrome DevTools Performance（手機用 `chrome://inspect` 遠端偵錯）。
- 記憶體：DevTools Memory → Heap snapshot，前後比較。
- 效能與安全角色每個候選版本跑一次完整量測，結果寫在專案共用資料夾 `reports/perf/`。
