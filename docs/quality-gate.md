# 品質閘門與合併規則

PR 要合併到 `main`，必須同時符合：

1. **CI「品質閘門」綠燈**（`.github/workflows/ci.yml` 最後一個工作），它要求下面全部通過：
   - 靜態檢查：`npm run lint`（ESLint）、`npm run typecheck`（四份 tsconfig：主程式、模擬核心、模擬服務、e2e）、`npm run check:assets`（素材預算）、`npm audit --omit=dev --audit-level=high`（遊戲本體用的套件不能有 high 以上的已知漏洞）
   - 安全檢查：gitleaks 掃整個 git 歷史有沒有金鑰、密碼（設定在 `.gitleaks.toml`）；PR 新增或升級的套件用 dependency-review 檢查，有 high 以上漏洞就擋
   - 單元測試：`npm test`（Vitest）
   - 遊戲流程測試：打包、檢查 JS 大小、`npm run e2e`（Playwright，案例在 `e2e/`）；切成 3 份平行跑
   - 伺服器：`./gradlew test bootJar`
   - Android：打包測試版 APK

   有工作失敗或被取消，品質閘門就是紅的；被 `if:` 條件略過（skipped）的工作視為通過。新增工作時記得加進 `gate` 的 `needs`，否則它失敗也擋不住合併。
2. **架構角色審查通過**（照 [coding-standards.md](coding-standards.md) 和 [performance-budget.md](performance-budget.md)）。
3. **沒有和這個 PR 相關、未解決的 `severity:critical` 或 `severity:major` 問題**。
4. 由**總控**合併（2026-10-19 起，各角色不自己合併）。

本機一次跑完前三關（除了流程測試）：`npm run check`。

## 套件與秘密

- **Dependabot**（`.github/dependabot.yml`）：每週一檢查 npm 和伺服器（Gradle）的套件、每月檢查 GitHub Actions，有更新或安全公告就開 PR，照一般流程審查、合併。
- **相依套件圖**（`.github/workflows/dependency-graph.yml`）：GitHub 看不懂 Gradle，main 上的 `server/` 有改動時實際解析一次送上去，漏洞提醒才涵蓋伺服器。
- **秘密掃描誤判**：確定不是秘密才可以加進 `.gitleaks.toml` 的 allowlist，並在 PR 說明原因。真的外洩時，先到該服務撤銷金鑰，再清理 repo。
- **要 YenWel 設定一次**：
  1. repo 的 Settings → Advanced Security，開啟 **Dependency graph**、**Dependabot alerts**、**Dependabot security updates**（公開 repo 免費）。Secret scanning 和 Push protection 已經是開的。
  2. 再到 Settings → Secrets and variables → Actions → **Variables** 新增變數 `DEPENDENCY_REVIEW`，值填 `enabled`。設好之後 PR 的「新增套件檢查」才會真的跑，有 high 以上漏洞或檢查本身出錯都會擋；沒設時只出警告。順序不能反過來，先設變數、還沒開 Dependency graph 的話，所有 PR 都會被擋。

## 流程測試（Playwright）

- 設定在 `playwright.config.ts`，模擬手機橫向 915×412。
- `e2e/smoke.spec.ts` 是冒煙測試；QA 角色把遊戲流程測試加在 `e2e/flows/`。
- 頁面有未捕捉的錯誤時，測試自動失敗（`e2e/fixtures.ts`）。
- 失敗時 CI 會上傳 `playwright-report-N`（N 是第幾份）讓你看截圖和 trace。
- CI 把流程測試切成 3 份平行跑（`--shard`），每份的預算是 10 分鐘。單一測試最長不要超過 8 分鐘：比這更長的流程（例如新手任務全程）先想辦法縮短或拆開；份數不夠時由架構調高 `ci.yml` 的 shard 數。本機跑全部用 `npm run e2e`，只跑其中一份用 `npm run e2e -- --shard=1/3`。

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
6. 勾 **Require status checks to pass** → **Add checks** 搜尋並加入 **品質閘門**。先**不要**勾 Require branches to be up to date：同時開很多 PR 時，每合併一個其他 PR 都要重跑 CI。
7. 按 **Create**。

設定後，「品質閘門」沒綠的 PR 在 GitHub 上就按不了合併。
