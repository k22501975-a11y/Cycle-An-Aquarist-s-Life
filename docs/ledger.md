# 伺服器帳本（Issue #77）

跟別的帳號有關的錢和用點數買的道具，由伺服器記帳、由伺服器改存檔；遊戲端只顯示伺服器給的結果。
單機玩法（商店買賣、店家訂單、電費）的錢照舊在遊戲端算。

## 1. 現在的問題

| 漏洞 | 位置 | 後果 |
|---|---|---|
| 市場買東西，伺服器不扣款，遊戲端自己扣 | `src/ui/market-panel.ts`（`buy`） | 改程式不扣就白拿魚 |
| 上架費遊戲端自己扣 | `market-panel.ts`（上架、改價） | 免費上架 |
| 成交款、退款由遊戲端自己加 | `market-panel.ts`（`collect` 的結果） | 回傳值改大或重複加，憑空生錢，再透過市場「洗」給別的帳號 |
| 商城道具遊戲端自己放進背包 | `src/ui/mall-panel.ts`（`syncMall`）、`addMallGrant` | 不花點數改存檔就有道具 |
| 金流沒有收據驗證 | `PAYMENTS_SANDBOX` | 正式收費前一定要補（不在這份範圍，見 §6） |

## 2. 目標和不做的事

**要做到**
1. 市場的扣款、入帳都只在伺服器發生，跟掛單、訂單在**同一個資料庫交易**裡改，不會只扣錢沒成交、或成交了沒扣錢。
2. 同一筆款項只會入帳一次（重送請求、兩台裝置同時按都一樣）。
3. 不能用「沒扣款的存檔」或「扣款前的舊存檔」蓋掉雲端那份。
4. 商城道具的數量以伺服器為準，用一個扣一個。

**不在這份範圍**
- 單機賺的錢是否合理（例如改存檔把錢改大）：這是 L2「錢的範圍檢查」，另外做。帳本做好後，那邊只需要檢查「兩份存檔之間遊戲端自己增加的錢」，市場的進出已經由帳本說清楚。
- 金流與收據驗證（§6）。

## 3. 遊戲幣帳本

### 3.1 資料表 `coin_ledger`（V9）

```sql
CREATE TABLE coin_ledger (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- 每個帳號自己從 1 開始遞增；存檔記著套用到第幾筆
    seq         INT NOT NULL,
    delta       INT NOT NULL,
    -- 套用後存檔裡的錢
    balance     INT NOT NULL,
    -- market_buy 買東西（含包裝）、listing_fee 上架費、payout 成交款、refund 退款
    reason      VARCHAR(16) NOT NULL,
    -- 哪一筆掛單或訂單
    ref_id      BIGINT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (account_id, seq),
    -- 同一筆訂單的成交款、退款只會有一筆（防重複入帳）
    UNIQUE (account_id, reason, ref_id)
);
```

上架費以掛單 id 當 `ref_id`；改價不另收費（現在的規則），所以同一張掛單只會有一筆上架費。

### 3.2 存檔多一個欄位

`economy.ledgerSeq`：這份存檔已經套用到帳本的第幾筆。舊存檔沒有就是 0。
遊戲端不會自己改它，只會照伺服器回傳的值設定。

### 3.3 伺服器改存檔裡的錢

市場會動到錢的請求（買、上架、收款／退款）都多帶 `baseRevision`（遊戲端手上那份雲端存檔的版本）。伺服器在同一個交易裡：

1. 鎖住這個帳號的 `cloud_save`（`SELECT … FOR UPDATE`，見 §3.6），版本不同就回 409，遊戲先同步存檔再重試。沒有雲端存檔就回 409 `need_upload`，遊戲先上傳一次。
2. 讀 `state.economy.coins`。扣款時錢不夠就回 422 `not_enough_coins`，什麼都不改。
3. 改掛單或訂單（跟現在一樣）。
4. 寫一筆 `coin_ledger`（`seq` = 這個帳號上一筆加 1）。入帳時如果撞到 `UNIQUE (account_id, reason, ref_id)`，表示已經入過帳，直接回傳上次的結果。
5. 改存檔：`state.economy.coins += delta`、`state.economy.ledgerSeq = seq`。其他缸（`tanks[i].economy`）同步寫一樣的值，因為讀檔時 `linkTanks` 以第一缸為準，其他缸只是副本。
6. 存檔版本加 1，`updated_at` **不改**（不然會影響 L2 補算的起點，見 `SaveController.advance`）。

回傳 `{ revision, coins, ledgerSeq, delta }`。遊戲端套用 `coins += delta`、`ledgerSeq` 設成回傳的值、記下新的 revision。
**不能直接用回傳的 `coins` 覆蓋**：請求送出到回應回來之間，玩家可能在本機又花了錢（買飼料、付電費），這些還沒同步到雲端；直接覆蓋會把那些花費加回來，等於刷錢。回傳的 `coins` 只拿來顯示和除錯。
同一個回應只能套用一次：遊戲端記著已經套用的 `ledgerSeq`，回傳的 `ledgerSeq` 不比自己的大就不加（重送、重複點擊都不會加兩次）。

**為什麼直接改雲端存檔，而不是另外開一個伺服器錢包**：遊戲裡只有一個錢包，商店、訂單、電費天天在遊戲端加減。分成兩個錢包玩家要搬來搬去，畫面和平衡都要重做；改存檔裡的數字只多一個欄位，遊戲端改動也最小。代價是市場操作前雲端存檔要是最新的（第 1 步），遊戲在打開市場時本來就會先同步。

### 3.4 上傳檢查

`PUT /api/save` 多一條規則：上傳的 `economy.ledgerSeq` 比伺服器帳本最新一筆小，就回 422 `ledger_behind`，**強制覆蓋也不收**（跟 `shipped_fish` 一樣，不然選舊存檔就能把扣款洗掉）。遊戲收到後改下載雲端那份。

`ledgerSeq` 比伺服器大也不收（422 `ledger_ahead`，只可能是改過的存檔）。

這條不需要模擬服務，Java 直接比數字，沒開 L2 也有效。

### 3.5 兩台裝置

A 在市場買了東西（雲端 revision +1、ledgerSeq +1），B 還拿著舊的那份：B 上傳會先撞到 409（revision 不同）；B 選「用這台的」強制覆蓋，會撞到 `ledger_behind` 被擋，只能用雲端那份。所以扣款一定留下來。

### 3.6 同一把鎖

會寫雲端存檔的地方都要拿同一把鎖：`PUT /api/save`、`POST /api/save/advance`、市場的扣款入帳。（商城使用道具不改存檔，見 §4.2，不用這把鎖。）
`CloudSaveRepository` 加 `@Lock(PESSIMISTIC_WRITE) findForUpdate(id)`，這幾個地方都改用它讀存檔。
不然會發生：`advance` 讀了舊的存檔去跑模擬（幾百毫秒），這中間市場扣了款寫回，`advance` 再把舊的錢寫回去，扣款就不見了。
`advance` 跑模擬時會一直拿著鎖；模擬服務本來就有逾時，同一個帳號的請求本來就不多，可以接受。

## 4. 商城道具庫存

### 4.1 資料表 `mall_inventory`（V10）

```sql
CREATE TABLE mall_inventory (
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    item        VARCHAR(16) NOT NULL,
    count       INT NOT NULL CHECK (count >= 0),
    PRIMARY KEY (account_id, item)
);

-- 每次使用道具一筆；request_id 防重送
CREATE TABLE mall_use (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    request_id  UUID NOT NULL,
    item        VARCHAR(16) NOT NULL,
    remaining   INT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (account_id, request_id)
);
```

用點數買道具時，跟扣點數同一個交易把 `count` 加 1（`point_grant` 照樣留著當購買紀錄，直接記成 `claimed`）。
上線時（V10）把現有 `pending` 的 `point_grant` 轉進庫存、標成 `claimed`。原本的 `/api/points/grants` 和領取拿掉。
`GET /api/points`、`POST /api/points/buy` 的回應都多帶 `bag`（每種道具還有幾個）。

### 4.2 使用道具

`POST /api/points/use { item, requestId }`：`requestId` 是遊戲端每次使用產生的 UUID。
庫存不夠回 422 `no_item`，夠就減 1、寫一筆 `mall_use`（`account_id`、`request_id` 唯一、`item`、`created_at`），回傳 `{ item, remaining }`。
同一個 `requestId` 再送一次（網路斷了重送）直接回上次的結果，不會扣兩個；拿同一個編號用別的道具回 409 `request_reused`。
跟買道具一樣先鎖帳號那一列，同時送兩次也只扣一個。
不帶 `baseRevision`：用道具只改庫存、不改雲端存檔（效果在遊戲端套用，之後照常上傳），所以不需要存檔版本，也不用 §3.6 的存檔鎖。遊戲端拿到成功才套用效果（治魚、擺套缸）。
遊戲端的 `economy.mall` 改成只是顯示用的副本，每次打開商城、用道具後照伺服器的數字覆寫；`addMallGrant` 拿掉。

道具效果本身（例如特效藥把症狀消掉）還是遊戲端在跑，沒用道具卻自己把病治好要靠 L2 的模擬比對才抓得到，這不在這份範圍。

## 5. 遊戲端要改的地方

- `market-panel.ts`：買、上架、收款／退款都不再自己算金額，改成套用伺服器回傳的 `delta`（`coins += delta`，見 §3.3）、`ledgerSeq`、`revision`。開市場面板前先確定雲端存檔是最新的（已經有的 `autoUpload`）。
- `cloud.ts`：市場和商城的請求帶 `baseRevision`；處理 409 `need_upload`、422 `ledger_behind`。
- `mall-panel.ts`：顯示伺服器的庫存，使用道具先呼叫 `/api/mall/use`。
- `Economy` 多 `ledgerSeq?: number`。

## 6. 金流（之後接金流時做）

- 只信金流商打給伺服器的回呼或收據驗證（Google Play 用 Play Developer API 驗購買憑證），遊戲端傳來的「付好了」一律不算。
- `PAYMENTS_SANDBOX` 正式環境必須是關的，`ProductionGuard` 啟動時檢查，開著就不啟動。
- 退款回呼：扣回點數；點數不夠扣就記成負數、商城鎖住到補回為止。

## 7. 上線順序

1. **這份文件**（架構審查）。
2. **遊戲幣帳本**：V9 `coin_ledger`、市場三種請求改成伺服器扣款入帳、上傳檢查、遊戲端改套用回傳值。測試：錢不夠不成交、重送收款只入帳一次、舊存檔上傳被擋、兩台裝置強制覆蓋被擋、扣款和成交在同一個交易（成交失敗不扣錢）、`advance` 和扣款同時進來時扣款不會被蓋掉、遊戲端回應晚到時本機的花費不會被加回來。
3. **商城庫存**：V10 `mall_inventory`、`mall_use`、`/api/points/use`、遊戲端改顯示伺服器庫存。測試加同一個 `requestId` 重送只扣一個。
4. 金流另外開 issue。

舊資料：上線前已經成交、遊戲端還沒收款的訂單（`buyer_done`／`seller_done` 是空的），上線後照新流程由伺服器入帳，不會漏也不會重複（之前沒有入帳紀錄，`coin_ledger` 是空的）。
