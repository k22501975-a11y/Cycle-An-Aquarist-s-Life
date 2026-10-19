# 品質閘門與合併規則

PR 要合併到 `main`，必須同時符合：

1. **CI「品質閘門」綠燈**（`.github/workflows/ci.yml` 最後一個工作），它要求下面全部通過：
   - 靜態檢查：`npm run lint`（ESLint）、`npm run typecheck`（三份 tsconfig）、`npm run check:assets`（素材預算）
   - 單元測試：`npm test`（Vitest）
   - 遊戲流程測試：打包、檢查 JS 大小、`npm run e2e`（Playwright，案例在 `e2e/`）
   - 伺服器：`./gradlew test bootJar`
   - Android：打包測試版 APK
2. **架構角色審查通過**（照 [coding-standards.md](coding-standards.md) 和 [performance-budget.md](performance-budget.md)）。
3. **沒有和這個 PR 相關、未解決的 `severity:critical` 或 `severity:major` 問題**。
4. 由**總控**合併（2026-10-19 起，各角色不自己合併）。

本機一次跑完前三關（除了流程測試）：`npm run check`。

## 流程測試（Playwright）

- 設定在 `playwright.config.ts`，模擬手機橫向 915×412。
- `e2e/smoke.spec.ts` 是冒煙測試；QA 角色把遊戲流程測試加在 `e2e/flows/`。
- 頁面有未捕捉的錯誤時，測試自動失敗（`e2e/fixtures.ts`）。
- 失敗時 CI 會上傳 `playwright-report` 讓你看截圖和 trace。

## 標籤

標籤定義在 `.github/labels.json`，合併到 main 後由「同步標籤」工作自動建立。也可以到 Actions →「同步標籤」→ Run workflow 手動跑。

| 類別 | 標籤 |
|---|---|
| 角色 | `role:orchestrator` `role:design` `role:arch` `role:core` `role:art-ui` `role:qa` `role:debug` `role:perf-sec` `role:release` `role:critic-gameplay` `role:critic-visual` `role:critic-ux` |
| 嚴重度 | `severity:critical`（當機、存檔損毀、無法繼續）`severity:major`（主要功能錯誤）`severity:minor`（小瑕疵） |
| 類型 | `type:bug` `type:feature` `type:task` `type:playtest` |
| 狀態 | `status:blocked` `status:in-progress` `status:needs-review` |
| 區域 | `area:sim` `area:render` `area:ui` `area:server` `area:android` `area:art` |

## 分支命名

`<角色>/<issue 編號>-<簡短英文>`，例如 `core/123-cycle-quest`、`art-ui/130-shop-cards`、`debug/141-crash-on-pregnancy`。
雲端工作階段被指定分支名稱時（例如 `claude/...`）沿用指定的名稱，在 PR 裡連到 Issue 即可。

## 分支保護（YenWel 在 GitHub 設定一次）

1. 打開 repo → **Settings** → **Branches**（或 **Rules → Rulesets**）→ **Add branch ruleset**。
2. Ruleset name 填 `main`，Enforcement status 選 **Active**。
3. Target branches → **Add target** → **Include default branch**。
4. 勾 **Restrict deletions**、**Block force pushes**。
5. 勾 **Require a pull request before merging**，Required approvals 設 **0**（審查由架構角色用留言完成，同一個帳號無法核准自己的 PR）。
6. 勾 **Require status checks to pass** → **Add checks** 搜尋並加入 **品質閘門**；勾 **Require branches to be up to date before merging**。
7. 按 **Create**。

設定後，「品質閘門」沒綠的 PR 在 GitHub 上就按不了合併。
