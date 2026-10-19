# 遊戲流程測試（Playwright）

品質閘門的第 3 關：PR 要合併前，這裡的測試要全部通過。

- `smoke.spec.ts`：冒煙測試（架構角色維護），只確認遊戲開得起來。
- `flows/`：遊戲流程測試，由 QA 測試角色撰寫，例如新手任務、養水、餵食、換水、繁殖、存檔讀檔、離線補算。
- `flows/helpers.ts`：流程測試的操作（點工具列、關面板、點掉老闆對話、`fastForward` 快轉、讀 `window.cycle` 狀態）。
- `flows/saves/`：用舊版程式實際產生的存檔（檔名是版本和 PR），`saves.spec.ts` 確認每份都升級得上來。改存檔格式時在這裡加一份新版存檔。
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
- 要快轉時間時直接改存檔或用 `flows/helpers.ts` 的 `fastForward`；每個測試要能在 60 秒內跑完。例外：新手任務全流程和快轉 3 週要玩十幾到二十幾個遊戲天，在檔案裡用 `test.setTimeout` 放寬，並用 1 倍密度省 CPU。
- 已知 bug 的回歸測試用 `test.fail(true, '已知問題 #N…')` 標著，修好後測試會提醒你拿掉。
- 一個測試只驗一件事，名稱用中文寫清楚「做了什麼 → 應該怎樣」。
