-- 一條魚同時只能有一筆上架或成交（#75：以前同一條魚可以重複上架、賣好幾次）。
-- 上架時佔用，下架或訂單取消（沒出貨）時放掉；出貨後一直留著，代表這條魚已經賣掉了，
-- 上傳的存檔裡又出現這條魚（拿出貨前的舊存檔）會被擋下。魚的編號是每個存檔自己的，所以跟賣家一起算。
CREATE TABLE market_fish_claim (
    seller_id   BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    fish_id     BIGINT NOT NULL,
    listing_id  BIGINT NOT NULL REFERENCES market_listing(id) ON DELETE CASCADE,
    PRIMARY KEY (seller_id, fish_id)
);
CREATE INDEX market_fish_claim_listing ON market_fish_claim(listing_id);
