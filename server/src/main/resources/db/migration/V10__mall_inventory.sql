-- 商城道具庫存由伺服器保管（docs/ledger.md §4）：用一個扣一個，遊戲端的背包只是顯示用的副本

CREATE TABLE mall_inventory (
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    item        VARCHAR(16) NOT NULL,
    count       INT NOT NULL CHECK (count >= 0),
    PRIMARY KEY (account_id, item)
);

-- 每次使用道具一筆；request_id 是遊戲端產生的，重送時直接回上次的結果
CREATE TABLE mall_use (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    request_id  UUID NOT NULL,
    item        VARCHAR(16) NOT NULL,
    remaining   INT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (account_id, request_id)
);

-- 還沒領的道具轉進庫存（point_grant 留著當購買紀錄）
INSERT INTO mall_inventory (account_id, item, count)
SELECT account_id, item, COUNT(*) FROM point_grant WHERE status = 'pending' GROUP BY account_id, item;
UPDATE point_grant SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP WHERE status = 'pending';
