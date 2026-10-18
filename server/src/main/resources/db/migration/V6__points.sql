-- 儲值點數與商城（design/monetization.md）：點數和遊戲幣分開，不能換成遊戲幣

-- 目前的點數餘額（每筆增減都另外記在 point_ledger）
ALTER TABLE account ADD COLUMN points INT NOT NULL DEFAULT 0;

-- 儲值紀錄：刪除帳號後留著（帳務要保存），只是不再對應到人
CREATE TABLE payment_order (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT REFERENCES account(id) ON DELETE SET NULL,
    pack        VARCHAR(16) NOT NULL,
    amount_twd  INT NOT NULL,
    points      INT NOT NULL,
    -- sandbox 測試付款（不收錢）；之後接金流再加
    provider    VARCHAR(16) NOT NULL,
    status      VARCHAR(12) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX payment_order_account ON payment_order(account_id, created_at);

-- 點數明細：儲值 +、購買 −
CREATE TABLE point_ledger (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    balance     INT NOT NULL,
    -- topup 儲值、buy 購買
    reason      VARCHAR(12) NOT NULL,
    note        VARCHAR(80) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX point_ledger_account ON point_ledger(account_id, id);

-- 買到的商城道具：遊戲領走前是 pending，領了變 claimed
CREATE TABLE point_grant (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    item        VARCHAR(16) NOT NULL,
    points      INT NOT NULL,
    status      VARCHAR(12) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    claimed_at  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX point_grant_account ON point_grant(account_id, item, created_at);
