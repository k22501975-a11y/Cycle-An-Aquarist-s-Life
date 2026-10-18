-- 帳號
CREATE TABLE account (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(32)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 登入狀態：只存 token 的 SHA-256，資料庫外洩也拿不到可用的 token
CREATE TABLE session (
    token_hash  VARCHAR(64) PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX session_account ON session(account_id);

-- 雲端存檔：每個帳號一份，revision 每次上傳加 1（兩台裝置同時改時用來偵測衝突）
CREATE TABLE cloud_save (
    account_id   BIGINT PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
    revision     BIGINT NOT NULL,
    saved_at     BIGINT NOT NULL,
    save_version INT    NOT NULL,
    data         TEXT   NOT NULL,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
