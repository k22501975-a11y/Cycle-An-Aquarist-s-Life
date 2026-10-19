# 水族人生 伺服器

帳號、雲端存檔、好友、市場、推播、商城，以及伺服器權威模擬（L2）。Spring Boot 3、Java 21、PostgreSQL、Flyway；
水缸模擬跑在旁邊的 Node 小服務（`src/simsvc`），跟遊戲用同一份 TypeScript 程式。

## 本機執行

```bash
cd server
docker compose up          # PostgreSQL + 模擬小服務 + 伺服器，http://localhost:8080
# 或自己開 PostgreSQL 後：
./gradlew bootRun
```

不用 Docker 時，模擬小服務自己開（在 repo 根目錄）：

```bash
npm run build:sim && SIM_TOKEN=dev npm run sim     # http://127.0.0.1:8091，只聽本機
cd server && SIM_SERVICE_URL=http://127.0.0.1:8091 SIM_TOKEN=dev ./gradlew bootRun
```

沒設定 `SIM_SERVICE_URL` 時伺服器照舊只保管存檔（不檢查、不補算），其他功能照常。

遊戲端要知道伺服器在哪：

```bash
VITE_API_URL=http://localhost:8080 npm run dev
```

沒設定 `VITE_API_URL` 時，遊戲的「雲端存檔」會顯示尚未開放，其他功能照常。

## 設定（環境變數）

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 8080 | |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/cycle` | |
| `DATABASE_USER`／`DATABASE_PASSWORD` | cycle／cycle | |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:4173,https://localhost` | 遊戲網頁的網址，逗號分隔；`https://localhost` 是 Android App 裡的來源，上線時記得保留 |
| `MARKET_MIN_ACCOUNT_DAYS` | `3` | 新帳號滿幾天才能在市場上架（防開小號洗錢）；本機測試可以設 `0` |
| `CYCLE_PRODUCTION` | `false` | 正式環境設 `true`：資料庫用預設密碼、沒設 `SIM_SERVICE_URL` 或 `SIM_TOKEN`、開著 `PAYMENTS_SANDBOX`、`ALLOWED_ORIGINS` 還有開發用的 localhost（App 的 `https://localhost`、`capacitor://localhost` 可以留），伺服器就不啟動 |
| `FORWARD_HEADERS` | `none` | **放在反向代理（nginx、Caddy、Cloudflare）後面一定要設 `native`**（或 `framework`）。維持 `none` 時所有玩家都被當成代理的 IP，註冊每小時 5 次、登入次數這些頻率限制會變成全站共用；`CYCLE_PRODUCTION=true` 時啟動會記一條警告。見下方「部署注意」 |
| `PAYMENTS_SANDBOX` | `false` | 儲值測試模式：不收錢直接入帳。金流還沒接，本機測試商城時設 `true`；正式上線前要接上金流、維持 `false` |
| `PUSH_SUBJECT` | `mailto:admin@localhost` | 推播服務聯絡營運者用的信箱（`mailto:`）或網址，上線時改成真的 |
| `VAPID_PUBLIC_KEY`／`VAPID_PRIVATE_KEY` | 空 | 推播的 VAPID 金鑰（base64url）。留空會在第一次啟動時產生並存進資料庫；換金鑰會讓所有裝置的訂閱失效 |
| `SIM_SERVICE_URL` | 空 | 模擬小服務的網址，例如 `http://sim:8091`。留空代表不用伺服器權威模擬 |
| `SIM_TOKEN` | 空 | 跟模擬小服務共用的密碼（兩邊設一樣）。模擬小服務沒設就不啟動（本機真的要不設，另外設 `SIM_INSECURE_NO_TOKEN=1`）。模擬小服務另外看 `SIM_PORT`（8091）、`SIM_HOST`（127.0.0.1，容器裡設 0.0.0.0）；它沒有對外的保護，不要開 port 到外面 |

## 部署注意：反向代理和玩家 IP

頻率限制（註冊、登入、事件、推播訂閱）是照玩家 IP 算的。部署架構決定 `FORWARD_HEADERS` 要怎麼設：

- **前面有反向代理**（Lightsail 上的 Caddy／nginx、Cloudflare）：設 `FORWARD_HEADERS=native`，並讓代理覆寫 `X-Forwarded-For`。沒設的話，所有人共用代理的 IP，一個人註冊 5 次就會擋住全站的註冊。
- **伺服器直接對外**：維持 `none`。這時設 `native` 反而不安全：玩家可以自己帶 `X-Forwarded-For` 假裝成別的 IP 繞過限制。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/auth/register` | `{username, password}` → `{token, username}` |
| POST | `/api/auth/login` | 同上；密碼錯 8 次鎖 10 分鐘 |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | `{username}` |
| GET | `/api/save` | `{revision, savedAt, save}`；沒有存檔回 404 `code: none` |
| PUT | `/api/save` | `{baseRevision, force, save}` → `{revision, savedAt, notice?}`；別的裝置先上傳過回 409 `code: conflict`；有開模擬時，跟上一份比對不過回 422（`time_ahead` 遊戲時間比伺服器快、`identity_changed` 魚的身分被改、`gift_removed`）。`force` 時對不上也收，但幾天內不能上架魚，`notice` 會說明 |
| POST | `/api/save/advance` | 伺服器用自己的時鐘把雲端存檔補算到現在，存成新的一版 → `{revision, savedAt, save, hours, capped, deaths, births}`；起點是伺服器收下雲端那份的時間，不看存檔裡的 savedAt；距離上次寫入不到一分鐘不補算，直接回雲端那份（`hours` 0）；沒開模擬回 503 `no_sim` |
| GET | `/api/me/export` | 伺服器上跟這個帳號有關的所有資料（個資法的查詢、複製權） |
| DELETE | `/api/account` | `{password}`；刪除帳號和所有相關資料，密碼錯回 403 `code: bad_password` |
| POST | `/api/events` | 不用登入。`{clientId, events: [{name, props}]}` → `{accepted}`；匿名數據分析，一次最多 50 筆、每個代號每天 500 筆，180 天後自動刪除 |
| GET | `/api/market/listings?species=&sort=price\|new` | 逛市場：別人上架中的商品（看不到基因）和賣家信譽 |
| POST | `/api/market/listings` | `{kind: fish\|plant, species, title, item, price}` → `{id, fee}`；上架費 1%、格子 5 格起。有開模擬時，魚要在雲端存檔裡（`no_cloud_save`、`not_in_save`、`dead`），商品資料用伺服器那份 |
| PUT / DELETE | `/api/market/listings/{id}` | 更新魚的近況 `{item}`／下架（上架費不退） |
| POST | `/api/market/listings/{id}/buy` | `{packaging: bag\|oxygen\|box}` → 訂單；款項由市場託管 |
| GET | `/api/market/mine` | 我的上架、賣出的訂單、買到的貨、格子數 |
| POST | `/api/market/orders/{id}/ship` | 賣家出貨 `{item, bagTemp, bagPh}`；伺服器決定運輸時間、到貨死亡、緊迫 |
| POST | `/api/market/orders/{id}/cancel` | 賣家沒辦法出貨（魚死了），退款給買家；超過 24 小時沒出貨也會自動取消 |
| POST | `/api/market/orders/{id}/collect` | 雙方各領一次：買家拿到貨或退款，賣家拿到貨款（扣 8% 成交稅） |
| GET | `/api/market/prices?species=` | 近兩週每天的成交中位數 |
| GET | `/api/push/key` | 不用登入。VAPID 公鑰（瀏覽器訂閱推播用） |
| PUT | `/api/push/devices/{id}` | 不用登入。`{secret, endpoint, p256dh, auth, categories}`；有帶 token 的話市場、好友通知也會送到這台。只接受 Google、Mozilla、Microsoft、Apple 的推播網址 |
| PUT | `/api/push/devices/{id}/schedule` | `{secret, items: [{at, category, title, body, tag}]}`；換掉這台排好的預測（最多 20 則、7 天內），空陣列就是取消 |
| DELETE | `/api/push/devices/{id}` | `{secret}`；關閉通知 |
| GET | `/api/points` | 點數餘額、儲值方案、商城道具（含今天買了幾個）、是否測試模式、這個月儲值多少 |
| POST | `/api/points/topup` | `{pack}` → `{balance}`；只有測試模式能用，每月上限 NT$5,000 |
| POST | `/api/points/buy` | `{item: cure\|tankset}` → `{grant, balance}`；扣點、檢查每日限購 |
| GET | `/api/points/grants` | 買了還沒領進遊戲的道具 |
| POST | `/api/points/grants/{id}/claim` | 遊戲已經放進背包（重複領不會出錯） |
| GET | `/api/points/history` | 最近 50 筆點數明細 |

需要登入的 API 帶 `Authorization: Bearer <token>`。錯誤一律回 `{code, message}`，`message` 是可以直接給玩家看的中文。

## 設計重點

- token 是隨機 32 bytes，資料庫只存 SHA-256；密碼用 BCrypt。
- 存檔整份 JSON 保管；`revision` 每次上傳加 1，用來偵測兩台裝置同時玩。Spring Boot 不解析存檔內容，要看內容時交給模擬小服務。
- 匿名數據分析不連帳號、不存 IP，只有玩家在遊戲設定裡同意才會送。看統計的查詢範例：
  `SELECT event_day, name, COUNT(*), COUNT(DISTINCT client_id) FROM analytics_event GROUP BY 1, 2 ORDER BY 1 DESC;`
  魚的死因：`SELECT props::json->>'cause' AS cause, COUNT(*) FROM analytics_event WHERE name = 'fish_died' GROUP BY 1 ORDER BY 2 DESC;`
- 儲值點數存在 `account.points`，每筆增減記在 `point_ledger`；儲值紀錄 `payment_order` 在刪除帳號後保留（帳務），只是不再對應到人。接金流時在 `MallService.topup` 換成金流回呼（付款成功才入帳）。
- 伺服器權威模擬（L2，2026-10-19 選了 Node 小服務）：
  - 遊戲時鐘由伺服器統一：上傳時遊戲時間最多比「伺服器收到上一份到現在」× 7 多 2% 加 1 個遊戲小時。玩家把裝置時間往後調、離線補算多跑的進度會被擋下，遊戲改用 `/api/save/advance` 伺服器補算的那份。登入雲端後設定裡也不能加快時間。
  - 已經存在的魚身分（品種、性別、第幾代、基因）不能改，老闆送的魚不能改成可以賣。
  - 市場上架的魚看伺服器那份存檔，之後更新近況、出貨都要是同一條（品種、性別、基因一樣）。
  - 模擬服務連不上時：上傳照收（不讓玩家存不了檔，記一筆 log），上架魚回 503。
  - 還沒做：新出生的魚的基因由伺服器重算（要記錄玩家每個動作重播，或把繁殖整個搬到伺服器）、錢的合理範圍檢查、市場到貨後的存活追蹤。
