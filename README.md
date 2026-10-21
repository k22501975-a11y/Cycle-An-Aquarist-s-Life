# Cycle: An Aquarist's Life

從一個小缸開始的養魚與養水草模擬遊戲。以真實的氮循環、水質、疾病與遺傳為基礎。

設計文件：[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)

## 開發

```bash
npm install
npm run dev        # 本機開發伺服器
npm test           # 單元測試（Vitest）
npm run build      # 型別檢查 + 打包
npm run lint       # ESLint
npm run check      # lint + 型別 + 單元測試 + 素材預算（開 PR 前跑）
npm run e2e        # 遊戲流程測試（Playwright，要先 build）
```

合併規則與 CI 品質閘門：[docs/quality-gate.md](docs/quality-gate.md)；程式碼規範：[docs/coding-standards.md](docs/coding-standards.md)；效能預算：[docs/performance-budget.md](docs/performance-budget.md)。

## 怎麼玩（Phase 0 原型）

- 新遊戲是一個還沒養好水的 40L 缸。可以先種草、等硝化菌建立，或直接放魚體驗新缸症候群。
- 水缸鋪滿整個畫面（手機轉橫向最好玩），缸越大鏡頭拉得越遠。上方是時間與水質（要用測試劑測過才看得到），下方是按鈕列：餵食、換水、測試、修剪、商店、設備、撈死魚。
- 點魚會跳出資訊卡（品系、健康、壓力），點水草可以修剪。
- 有過濾器水流聲、打氣氣泡聲、操作與事件音效，以及即時彈奏的指彈吉他背景音樂；音量在右上角選單調整。
- 孔雀魚和極火蝦會自己繁殖（Phase 0 簡化版，沒有遺傳），但成魚會吃仔魚和仔蝦，水草越密越好躲。斑馬魚會輕微咬孔雀魚公魚的長尾巴，自己數量不到 6 隻時咬得更兇。
- 右上角選單可以調音量、切換時間倍率（×7 是正式倍率，其他是開發用加速）、看真實數值，也可以開新遊戲。
- 遊戲會自動存在瀏覽器（localStorage）。關掉網頁再回來時，會以正式倍率 ×7 補算離線期間（最多 14 個遊戲日）；暫停時存的檔不補算。

## 程式結構

| 路徑 | 內容 |
|---|---|
| `src/sim/` | 模擬核心：純 TypeScript，不可使用 DOM 或 PixiJS（由 `tsconfig.sim.json` 強制），之後可移到伺服器端 |
| `src/sim/processes/` | 每個 tick 依序執行：溫度 → 廢物分解 → 氮循環 → 水草與藻類 → 氣體與 pH → 魚 → 族群（成長、繁殖、混養） |
| `src/sim/scenarios.test.ts` | 情境測試：新缸症候群、過度餵食、洗濾材、死魚連鎖、CO₂、水草、白點病等 |
| `src/game/` | 遊戲迴圈：把現實時間換算成模擬 tick、轉發事件；`save.ts` 負責存讀檔與離線補算 |
| `src/render/` | PixiJS 畫面層，只讀取模擬狀態來繪圖（魚的 Boids 游動、水草、氣泡、藻類、日夜） |
| `src/ui/` | HTML 介面：狀態列、按鈕列、待辦卡、選取卡、底部面板、通知 |
| `src/audio/` | 聲音：Web Audio 即時合成的環境音、音效與指彈吉他背景音樂（不需要音檔） |
| `src/main.ts` | 進入點：建立時鐘、模擬與畫面並串起來 |
