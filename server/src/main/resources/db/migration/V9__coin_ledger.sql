-- 伺服器帳本（docs/ledger.md §3，#77）：市場的扣款、入帳由伺服器記帳，並直接改雲端存檔裡的錢

CREATE TABLE coin_ledger (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- 每個帳號自己從 1 開始遞增；存檔的 economy.ledgerSeq 記著套用到第幾筆
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
