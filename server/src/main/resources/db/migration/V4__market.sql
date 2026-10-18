-- 玩家市場（market-and-breeding.md §3）：一口價上架、託管、運輸、到貨、賣家信譽、行情

CREATE TABLE market_listing (
    id          BIGSERIAL PRIMARY KEY,
    seller_id   BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- fish：一尾魚蝦（還活在賣家缸裡）；plant：一份插枝
    kind        VARCHAR(8)  NOT NULL,
    species     VARCHAR(32) NOT NULL,
    -- 買家看得到的名字，例如「藍蛇王孔雀魚 公」
    title       VARCHAR(80) NOT NULL,
    -- 商品內容（遊戲端的魚資料或插枝數量）；伺服器權威模擬（L2）之前由遊戲端產生
    item        TEXT NOT NULL,
    health      REAL NOT NULL,
    price       INT  NOT NULL,
    fee         INT  NOT NULL,
    -- open 上架中、sold 已售出、cancelled 已下架
    status      VARCHAR(12) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX market_listing_open ON market_listing(status, species, price);
CREATE INDEX market_listing_seller ON market_listing(seller_id, status);

-- 一筆成交：款項先由市場託管，到貨後才撥給賣家
CREATE TABLE market_order (
    id           BIGSERIAL PRIMARY KEY,
    listing_id   BIGINT REFERENCES market_listing(id) ON DELETE SET NULL,
    -- 帳號刪除後訂單留著，另一方還能收貨或拿回款項
    buyer_id     BIGINT REFERENCES account(id) ON DELETE SET NULL,
    seller_id    BIGINT REFERENCES account(id) ON DELETE SET NULL,
    kind         VARCHAR(8)  NOT NULL,
    species      VARCHAR(32) NOT NULL,
    title        VARCHAR(80) NOT NULL,
    item         TEXT NOT NULL,
    price        INT  NOT NULL,
    packaging    VARCHAR(12) NOT NULL,
    -- paid 等賣家出貨、shipped 運送中（doa 表示路上死了）、cancelled 賣家沒出貨
    status       VARCHAR(12) NOT NULL,
    doa          BOOLEAN NOT NULL DEFAULT FALSE,
    -- 到貨時魚的緊迫程度 0–1
    arrival_stress REAL,
    bag_temp     REAL,
    bag_ph       REAL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    shipped_at   TIMESTAMP WITH TIME ZONE,
    arrive_at    TIMESTAMP WITH TIME ZONE,
    -- 雙方各自在遊戲裡處理完（收貨／退款、入帳／取消）的時間
    buyer_done   TIMESTAMP WITH TIME ZONE,
    seller_done  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX market_order_buyer ON market_order(buyer_id, buyer_done);
CREATE INDEX market_order_seller ON market_order(seller_id, seller_done);
CREATE INDEX market_order_prices ON market_order(species, status, arrive_at);
