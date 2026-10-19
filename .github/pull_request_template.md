<!-- 合併條件見 docs/quality-gate.md：CI「品質閘門」綠燈＋架構審查通過＋沒有未解決的 critical/major。 -->

## 改了什麼

Before：

After：

## 對應 Issue

Closes #

## 怎麼驗證

- [ ] `npm run check`（lint、型別、單元測試、素材預算）本機通過
- [ ] 改到遊戲流程時，有新增或更新 `e2e/` 的測試
- [ ] 改到畫面時附上手機橫向截圖
- [ ] 改到存檔格式時，舊存檔能讀（有遷移與測試）

## 效能與風險

<!-- 有沒有新增貼圖、每幀運算、記憶體用量；對照 docs/performance-budget.md -->
