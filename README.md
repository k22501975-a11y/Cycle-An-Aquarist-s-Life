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

## 程式結構

| 路徑 | 內容 |
|---|---|
| `src/sim/` | 模擬核心：純 TypeScript，不可使用 DOM 或 PixiJS（由 `tsconfig.sim.json` 強制），之後可移到伺服器端 |
| `src/sim/processes/` | 每個 tick 依序執行：溫度 → 廢物分解 → 氮循環 → 水草與藻類 → 氣體與 pH → 魚 |
| `src/sim/scenarios.test.ts` | 情境測試：新缸症候群、過度餵食、洗濾材、死魚連鎖、CO₂、水草、白點病等 |
| `src/render/` | PixiJS 畫面層，只讀取模擬狀態來繪圖 |
| `src/main.ts` | 進入點：建立時鐘、模擬與畫面並串起來 |
