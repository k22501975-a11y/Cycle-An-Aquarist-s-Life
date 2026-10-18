# 水族人生 伺服器

帳號與雲端存檔（GAME_DESIGN 第 12 節 Phase 2 的第一步）。Spring Boot 3、Java 21、PostgreSQL、Flyway。

## 本機執行

```bash
cd server
docker compose up          # PostgreSQL + 伺服器，http://localhost:8080
# 或自己開 PostgreSQL 後：
./gradlew bootRun
```

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
| `PAYMENTS_SANDBOX` | `false` | 儲值測試模式：不收錢直接入帳。金流還沒接，本機測試商城時設 `true`；正式上線前要接上金流、維持 `false` |
| `PUSH_SUBJECT` | `mailto:admin@localhost` | 推播服務聯絡營運者用的信箱（`mailto:`）或網址，上線時改成真的 |
| `VAPID_PUBLIC_KEY`／`VAPID_PRIVATE_KEY` | 空 | 推播的 VAPID 金鑰（base64url）。留空會在第一次啟動時產生並存進資料庫；換金鑰會讓所有裝置的訂閱失效 |

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/auth/register` | `{username, password}` → `{token, username}` |
| POST | `/api/auth/login` | 同上；密碼錯 8 次鎖 10 分鐘 |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | `{username}` |
| GET | `/api/save` | `{revision, savedAt, save}`；沒有存檔回 404 `code: none` |
| PUT | `/api/save` | `{baseRevision, force, save}` → `{revision, savedAt}`；別的裝置先上傳過回 409 `code: conflict` |
| GET | `/api/me/export` | 伺服器上跟這個帳號有關的所有資料（個資法的查詢、複製權） |
| DELETE | `/api/account` | `{password}`；刪除帳號和所有相關資料，密碼錯回 403 `code: bad_password` |
| POST | `/api/events` | 不用登入。`{clientId, events: [{name, props}]}` → `{accepted}`；匿名數據分析，一次最多 50 筆、每個代號每天 500 筆，180 天後自動刪除 |
| GET | `/api/market/listings?species=&sort=price\|new` | 逛市場：別人上架中的商品（看不到基因）和賣家信譽 |
| POST | `/api/market/listings` | `{kind: fish\|plant, species, title, item, price}` → `{id, fee}`；上架費 1%、格子 5 格起 |
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
- 存檔整份 JSON 原樣保管，伺服器不解析內容；`revision` 每次上傳加 1，用來偵測兩台裝置同時玩。
- 匿名數據分析不連帳號、不存 IP，只有玩家在遊戲設定裡同意才會送。看統計的查詢範例：
  `SELECT event_day, name, COUNT(*), COUNT(DISTINCT client_id) FROM analytics_event GROUP BY 1, 2 ORDER BY 1 DESC;`
  魚的死因：`SELECT props::json->>'cause' AS cause, COUNT(*) FROM analytics_event WHERE name = 'fish_died' GROUP BY 1 ORDER BY 2 DESC;`
- 儲值點數存在 `account.points`，每筆增減記在 `point_ledger`；儲值紀錄 `payment_order` 在刪除帳號後保留（帳務），只是不再對應到人。接金流時在 `MallService.topup` 換成金流回呼（付款成功才入帳）。
- 下一步（L2）：伺服器權威的模擬與基因，需要決定模擬核心怎麼在伺服器上跑（Node 服務或移植成 Java）。
