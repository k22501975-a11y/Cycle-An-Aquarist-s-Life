-- 匿名數據分析（隱私權政策第 3 節）：玩家在設定裡同意後才會送。
-- client_id 是遊戲端隨機產生的代號，不連到帳號；只拿來算人數，180 天後自動刪除。
CREATE TABLE analytics_event (
    id         BIGSERIAL PRIMARY KEY,
    client_id  VARCHAR(36) NOT NULL,
    name       VARCHAR(40) NOT NULL,
    props      VARCHAR(500),
    event_day  DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX analytics_event_day ON analytics_event(event_day, name);
CREATE INDEX analytics_event_client ON analytics_event(client_id, event_day);
