# 程式碼規範

架構角色維護。PR 審查時照這份檢查；ESLint（`eslint.config.js`）和 TypeScript 設定能自動擋的部分會在 CI 擋下。

## 1. 分層（最重要）

```
src/sim     模擬核心：純 TypeScript，沒有 DOM、PixiJS、亂數以外的副作用
  ↑ 只讀
src/game    遊戲迴圈、存讀檔、離線補算、預測
  ↑
src/render  PixiJS 畫面：只讀模擬狀態來畫，不改狀態
src/ui      HTML 介面：玩家操作透過 game.act(...) 改狀態
src/audio   聲音
src/net     雲端存檔、好友、市場、推播（呼叫 server/）
src/simsvc  伺服器權威模擬（Node），直接重用 src/sim
server/     Spring Boot 3 + Java 21 + PostgreSQL
```

- `src/sim` 不能 import `pixi.js`、`render`、`ui`、`audio`（ESLint `no-restricted-imports`，`tsconfig.sim.json` 也擋 DOM 型別）。它會在伺服器上跑，同一份程式碼兩邊結果要一致。
- 畫面層不能直接改模擬狀態。要改就走 `game.act((st) => ...)`，這樣存檔、事件、伺服器同步才看得到。
- 遊戲規則、數值只寫在 `src/sim`。介面上顯示的價格、門檻從 sim 匯出的函式或常數讀，不要在 UI 再寫一份。
- 亂數一律用模擬狀態裡的種子亂數（不要用 `Math.random()` 影響模擬結果），否則伺服器重算會對不上。畫面上純裝飾的抖動可以用 `Math.random()`。

## 2. TypeScript

- `strict`、`noUnusedLocals`、`noUnusedParameters` 全開。不用的參數用 `_` 開頭命名。
- 不准 `any`（ESLint 擋）。外部資料（存檔、伺服器回應）用 `unknown` 接，驗證後再轉型。
- 比較用 `===`；只有和 `null` 比時可以用 `== null` 同時涵蓋 `undefined`。
- 型別只用來 import 時寫 `import type` 或 `type` 修飾。
- 列舉用字串聯集（`'low' | 'medium' | 'high'`），不用 `enum`。
- 不用 `!` 斷言掩蓋可能真的是 null 的值；只有 DOM 啟動時確定存在的節點可以。

## 3. 命名與檔案

- 檔名小寫加連字號：`frame-monitor.ts`；測試放旁邊：`frame-monitor.test.ts`。
- 類別 `PascalCase`，函式和變數 `camelCase`，常數 `UPPER_SNAKE_CASE`。
- 單位寫在名稱或註解裡：`intervalMs`、`tempC`、`liters`。模擬時間一律用「遊戲分鐘」或寫清楚。
- 一個檔案超過約 1000 行時，下次改它的 PR 要順手拆分（目前 `main.ts`、`ui/panels.ts`、`render/tank-view.ts` 已經偏大）。

## 4. 註解與文字

- 註解、介面文字、commit 訊息用繁體中文；程式識別字用英文。
- 註解寫「為什麼」和不明顯的規則，不重述程式在做什麼。公開函式寫一行 JSDoc。
- 參考設計文件時寫出處，例如 `design/art-style.md §6`。

## 5. 測試

- 新的遊戲規則、數值、存檔格式變更一定要有 Vitest 單元測試（`src/**/*.test.ts`）。
- 模擬核心的長期行為用情境測試（`src/sim/scenarios.test.ts` 的寫法）。
- 改到玩家流程（新手任務、商店、繁殖、存讀檔）時，要新增或更新 `e2e/` 的 Playwright 測試；寫法見 `e2e/README.md`。
- 長劇本（單一 `it` 在本機跑超過 10 秒，例如 120 天經濟）放進自己的 `*.scenario.test.ts`，一個檔案一條劇本。Vitest 是「檔案之間平行、檔案內依序」，拆檔才能分給不同 worker；同一個 `it` 裡不要連跑兩條劇本（拆成兩個 `it`、兩個檔）。
- 長劇本在 `it` 第三個參數寫明逾時（約本機時間的 3 倍），不要調高全域 `testTimeout`（20 秒），讓一般測試卡住時還是能很快抓到。
- CI「單元測試」整關預算 3 分鐘。超過時由架構把 `*.scenario.test.ts` 拆成獨立的 CI 工作，不是把劇本刪短到失去意義。
- 修 bug 先寫一個會失敗的測試重現它，修好後同一個測試要通過。
- 不准跳過、停用或刪掉測試讓 CI 變綠。

## 6. 存檔相容

- 存檔格式改變時：`SAVE_VERSION` 加一，在 `MIGRATIONS` 加一個轉換，並寫測試確認舊版存檔能讀。
- 新欄位設成選填，由 `normalizeState` 補預設值。
- 絕對不能讓玩家的舊存檔讀不進來或被清掉。

## 7. 畫面程式

- 每幀要做的事放在 ticker 裡，不能在每幀建立新的 `Graphics`、`Texture`、`Filter`；能快取就快取（例如魚貼圖快取）。
- 移除的顯示物件要 `destroy()`；貼圖由快取統一管理，不要各自 destroy 共用的貼圖。
- 動畫用經過時間（`deltaMS`）算，不要假設固定 60fps。
- 效能預算見 [performance-budget.md](performance-budget.md)。

## 8. 安全與敏感資訊

- 不把金鑰、密碼、簽章檔 commit 進 repo（CI 的 gitleaks 會擋）；用 GitHub Secrets 或環境變數。唯一例外是公開放在 repo 的測試用簽章金鑰 `android/app/beta-test.keystore`（見 `docs/release.md`），它不能拿來上架。
- 新增正式相依前先看維護狀況和授權；`npm audit --omit=dev` 有 high 以上漏洞的套件不能進來。
- 伺服器端不信任客戶端送來的數值（錢、魚的基因、時間），以伺服器重算為準。
- 從 innerHTML 插入的內容只能是程式內建的 SVG 圖示，不能放玩家輸入（名字、好友留言要用 `textContent`）。

## 9. 伺服器（server/）

- Java 21、Spring Boot 3；`./gradlew test` 要過。
- 資料庫結構改變用 migration，不手動改資料庫。
- API 錯誤回傳一致的 JSON 格式，不把例外堆疊回傳給客戶端。
