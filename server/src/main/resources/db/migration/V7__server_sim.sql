-- 伺服器權威模擬（L2）：強制用一份對不上的存檔覆蓋雲端（例如改過的存檔）之後，幾天內不能在市場上架魚
ALTER TABLE cloud_save ADD COLUMN market_locked_until TIMESTAMP WITH TIME ZONE;
