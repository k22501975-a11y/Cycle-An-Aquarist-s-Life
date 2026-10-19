# Android App（Capacitor）

遊戲本體就是網頁版，Capacitor 把 `vite build` 出來的 `dist/` 包進 Android WebView。App 是橫向全螢幕，會藏起狀態列；匯出存檔改成開分享選單。

## 拿到測試版 APK

手機打開這個網址就能下載最新測試版，裝好後之後的新版會直接蓋過去、存檔保留：

https://github.com/k22501975-a11y/Cycle-An-Aquarist-s-Life/releases/download/beta/cycle-beta.apk

每一版的更新說明和舊版 APK 在 repo 的 Releases 頁。版本號規則和發布流程見 [release.md](release.md)。手機要先允許「安裝不明來源的應用程式」。

測試版的雲端存檔要連得到伺服器，請在 repo 的 Settings › Secrets and variables › Actions › Variables 加上 `VITE_API_URL`（伺服器網址）。沒設定時，App 裡的雲端功能會顯示「還沒開放」，其他功能照常。

## 本機打包

需要 Android Studio（或 Android SDK）和 Java 21。

```bash
npm ci
npm run android          # build 網頁並複製到 android/
cd android && ./gradlew assembleDebug
# 產出：android/app/build/outputs/apk/debug/app-debug.apk
```

也可以 `npx cap open android` 用 Android Studio 開啟，直接裝到接著 USB 的手機上。

## 上架 Google Play

上架要用自己的簽章金鑰打包 AAB。金鑰一旦上架就不能換，**請自己保管好，不要放進 repo**。

1. 產生金鑰（只做一次）：
   ```bash
   keytool -genkeypair -v -keystore cycle-release.jks -alias cycle -keyalg RSA -keysize 2048 -validity 10000
   ```
2. 在 repo 的 Settings › Secrets and variables › Actions › Secrets 加上：
   - `ANDROID_KEYSTORE_BASE64`：`base64 -w0 cycle-release.jks` 的結果
   - `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`（上面例子是 `cycle`）、`ANDROID_KEY_PASSWORD`
3. 之後 main 分支每次 CI 會多一個 `cycle-release-aab`，上傳到 Play Console 即可。`versionCode` 用 CI 的執行編號，每版自動遞增。

上架資料（說明、截圖、隱私權政策網址、資料安全性表單）在共用資料夾的 `store/listing.md`。

## 伺服器

App 裡網頁的來源是 `https://localhost`，伺服器的 `ALLOWED_ORIGINS` 要包含它（預設已經有）。
