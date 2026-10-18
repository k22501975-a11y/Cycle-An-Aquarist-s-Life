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

需要登入的 API 帶 `Authorization: Bearer <token>`。錯誤一律回 `{code, message}`，`message` 是可以直接給玩家看的中文。

## 設計重點

- token 是隨機 32 bytes，資料庫只存 SHA-256；密碼用 BCrypt。
- 存檔整份 JSON 原樣保管，伺服器不解析內容；`revision` 每次上傳加 1，用來偵測兩台裝置同時玩。
- 匿名數據分析不連帳號、不存 IP，只有玩家在遊戲設定裡同意才會送。看統計的查詢範例：
  `SELECT event_day, name, COUNT(*), COUNT(DISTINCT client_id) FROM analytics_event GROUP BY 1, 2 ORDER BY 1 DESC;`
  魚的死因：`SELECT props::json->>'cause' AS cause, COUNT(*) FROM analytics_event WHERE name = 'fish_died' GROUP BY 1 ORDER BY 2 DESC;`
- 下一步（L2）：伺服器權威的模擬與基因，需要決定模擬核心怎麼在伺服器上跑（Node 服務或移植成 Java）。
