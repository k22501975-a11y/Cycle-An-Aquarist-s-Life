# 水族人生 Cycle: An Aquarist's Life

從一個小缸開始的養魚與養水草模擬遊戲。以真實的氮循環、水質、疾病與遺傳為基礎。

設計文件：[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)

## 開發

```bash
npm install
npm run dev        # 本機開發伺服器
npm test           # 單元測試（Vitest）
npm run build      # 型別檢查 + 打包
```

## 怎麼玩（Phase 0 原型）

- 新遊戲是一個還沒養好水的 40L 缸。可以先種草、等硝化菌建立，或直接放魚體驗新缸症候群。
- 下方操作列：餵食、換水、測試劑、商店（魚、水草、設備）、設備與維護（加熱棒溫度、燈光時數、洗濾材、下藥）、撈死魚。
- 點魚可以看到牠的症狀，點水草可以修剪。
- 右上角可切換時間倍率（×7 是正式倍率，其他是開發用加速）；⚙ 會顯示真實數值，方便調整平衡。

## 程式結構

| 路徑 | 內容 |
|---|---|
| `src/sim/` | 模擬核心：純 TypeScript，不可使用 DOM 或 PixiJS（由 `tsconfig.sim.json` 強制），之後可移到伺服器端 |
| `src/sim/processes/` | 每個 tick 依序執行：溫度 → 廢物分解 → 氮循環 → 水草與藻類 → 氣體與 pH → 魚 |
| `src/sim/scenarios.test.ts` | 情境測試：新缸症候群、過度餵食、洗濾材、死魚連鎖、CO₂、水草、白點病等 |
| `src/game/` | 遊戲迴圈：把現實時間換算成模擬 tick、轉發事件 |
| `src/render/` | PixiJS 畫面層，只讀取模擬狀態來繪圖（魚的 Boids 游動、水草、氣泡、藻類、日夜） |
| `src/ui/` | HTML 介面：狀態列、操作列、底部面板、通知 |
| `src/main.ts` | 進入點：建立時鐘、模擬與畫面並串起來 |
