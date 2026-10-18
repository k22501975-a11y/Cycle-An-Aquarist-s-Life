-- 推播通知（GAME_DESIGN 第 11 節）：Web Push 的裝置訂閱與排好的通知

-- VAPID 金鑰：第一次啟動時產生並保存，之後重啟沿用（換金鑰會讓所有裝置的訂閱失效）
CREATE TABLE push_key (
    id          INT PRIMARY KEY,
    public_key  VARCHAR(200) NOT NULL,
    private_key VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 一台裝置（瀏覽器）的推播訂閱。裝置自己產生 id 和密碼，不用登入也能收水缸的預警
CREATE TABLE push_device (
    id          VARCHAR(36) PRIMARY KEY,
    secret_hash VARCHAR(64) NOT NULL,
    -- 登入時才有：市場、好友這些伺服器上發生的事要知道送給誰
    account_id  BIGINT REFERENCES account(id) ON DELETE SET NULL,
    endpoint    VARCHAR(1000) NOT NULL,
    p256dh      VARCHAR(200) NOT NULL,
    auth        VARCHAR(100) NOT NULL,
    -- 開啟的類別，逗號分隔：crisis,breeding,market,friends
    categories  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX push_device_account ON push_device(account_id);

CREATE TABLE push_message (
    id         BIGSERIAL PRIMARY KEY,
    device_id  VARCHAR(36) NOT NULL REFERENCES push_device(id) ON DELETE CASCADE,
    -- forecast：遊戲預測的（重新排程時整批換掉）；event：伺服器上發生的事
    source     VARCHAR(10) NOT NULL,
    category   VARCHAR(10) NOT NULL,
    title      VARCHAR(60) NOT NULL,
    body       VARCHAR(300) NOT NULL,
    tag        VARCHAR(60) NOT NULL,
    send_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX push_message_due ON push_message(sent_at, send_at);
