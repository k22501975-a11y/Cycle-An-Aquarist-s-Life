-- 好友（friends.md）：好友碼、好友邀請、交情、參觀與按讚、互贈

ALTER TABLE account ADD COLUMN friend_code VARCHAR(8);
CREATE UNIQUE INDEX account_friend_code ON account(friend_code);
-- 這個缸被好友按過幾次讚
ALTER TABLE account ADD COLUMN likes INT NOT NULL DEFAULT 0;

CREATE TABLE friend_request (
    from_id    BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    to_id      BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (from_id, to_id)
);

-- 每段好友關係存兩列（雙方各一列），交情兩列同步
CREATE TABLE friendship (
    owner_id        BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    friend_id       BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    affinity        INT NOT NULL DEFAULT 0,
    -- 交情每天最多加多少（防小號刷交情）
    affinity_day    DATE,
    affinity_today  INT NOT NULL DEFAULT 0,
    -- owner 最後一次參觀、按讚 friend 的日子
    last_visit_day  DATE,
    last_like_day   DATE,
    PRIMARY KEY (owner_id, friend_id)
);

CREATE TABLE gift (
    id         BIGSERIAL PRIMARY KEY,
    from_id    BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    to_id      BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    kind       VARCHAR(16) NOT NULL,
    payload    TEXT NOT NULL,
    points     INT NOT NULL,
    gift_day   DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX gift_inbox ON gift(to_id, claimed_at);
CREATE INDEX gift_sent ON gift(from_id, gift_day);
