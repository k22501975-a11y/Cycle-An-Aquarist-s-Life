# 遊戲流程測試（Playwright）

品質閘門的第 3 關：PR 要合併前，這裡的測試要全部通過。

- `smoke.spec.ts`：冒煙測試（架構角色維護），只確認遊戲開得起來。
- `flows/`：遊戲流程測試，由 QA 測試角色撰寫，例如新手任務、養水、餵食、換水、繁殖、存檔讀檔、離線補算。
- `fixtures.ts`：共用工具。測試請 `import { test, expect, openGame, readSave } from '../fixtures'`，這樣頁面有未捕捉的錯誤時會自動判定失敗。

## 本機執行

```bash
npm run build
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run e2e   # 雲端容器裡已有 Chromium
npx playwright install chromium && npm run e2e                               # 自己的電腦
```

## 寫法約定

- 畫面是手機橫向 915×412（`playwright.config.ts` 的 phone-landscape）。
- 盡量用看得到的文字找按鈕（`button.tool` + `hasText`），不要依賴 CSS 細節。
- 被面板蓋住的按鈕用 `locator.evaluate(b => b.click())` 點。
- 要快轉時間時直接改存檔或用選單的開發用加速；每個測試要能在 60 秒內跑完。
- 一個測試只驗一件事，名稱用中文寫清楚「做了什麼 → 應該怎樣」。
