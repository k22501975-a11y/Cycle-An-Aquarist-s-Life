-- 來歷查不到的魚（#76）：存檔裡媽媽不在、基因沒辦法查的小魚（第一次上傳、兩次上傳隔太久），和牠們生的小魚。
-- 存檔照收，但這些魚不能在市場上架。魚的編號是每個存檔自己的（新遊戲會重來），所以連基因一起記，同編號不同基因是另一條。
CREATE TABLE market_untraced_fish (
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    fish_id     BIGINT NOT NULL,
    genome      TEXT NOT NULL
);
CREATE INDEX market_untraced_fish_account ON market_untraced_fish(account_id, fish_id);
