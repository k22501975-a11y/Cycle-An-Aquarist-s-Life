# 版本號與測試版發布

現在是開發階段，只出測試版，不送審、不上架。

## 版本號

| 欄位 | 規則 | 例子 |
|---|---|---|
| 主版本 `0.x.y` | 寫在 `package.json` 的 `version`，由人手動調 | `0.1.0` |
| versionName（App 與遊戲內顯示） | main：`0.x.y-beta.<CI 執行編號>`；其他分支和 PR：`0.x.y-dev.<CI 執行編號>`；本機：`0.x.y-dev` | `0.1.0-beta.123` |
| versionCode（Android） | CI 執行編號，每版都比上一版大 | `123` |

什麼時候調主版本：
- `y`（0.1.0 → 0.1.1）：一批修正或小功能，想讓測試者知道「這版值得更新」時。
- `x`（0.1.x → 0.2.0）：一個階段完成，或存檔格式有不能自動遷移的變動。
- `1.0.0`：正式上架的第一版。

遊戲內在「設定 › 版本」看得到版本；錯誤畫面「複製錯誤訊息」也會附上版本。

## 測試版怎麼發

`main` 每次合併後，CI 的「品質閘門」（`gate`，見 [quality-gate.md](quality-gate.md)）**通過**，`beta-release` 工作才會：

1. 在 GitHub Releases 開一個 pre-release `v0.1.0-beta.<N>`，附上 `cycle-0.1.0-beta.<N>.apk` 和更新說明（上一個測試版之後合併的 PR 標題）。
2. 把固定標籤 `beta` 移到這一版，附 `cycle-beta.apk`。下載網址永遠不變：
   `https://github.com/k22501975-a11y/Cycle-An-Aquarist-s-Life/releases/download/beta/cycle-beta.apk`
3. 只留最近 10 個測試版，更舊的連標籤一起刪掉。

品質閘門任何一關沒過就不發，手機上的版本停在上一個通過的版本。

PR 和其他分支的 APK 還是放在那次 CI 的 Artifacts（`cycle-debug-apk`，14 天過期），只給開發時臨時測試用。

## 簽章

測試版用 repo 裡的測試用金鑰 `android/app/beta-test.keystore`（密碼 `android`）簽，所以新版可以直接蓋過舊版安裝，存檔不會不見。這把金鑰公開也沒關係，**不能拿來上架**。

上架用的金鑰另外產生、放在 CI secrets，見 [android.md](android.md#上架-google-play)。
